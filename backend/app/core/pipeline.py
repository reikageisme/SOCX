import asyncio
import json
import logging
import time
from datetime import datetime
from pydantic import BaseModel
from typing import Dict, Any

from app.core.websockets import manager
from app.core.geoip import geoip_service
from app.core.threat_intel import threat_intel_service
from app.core.clickhouse import clickhouse_storage

logger = logging.getLogger(__name__)

# Queue to decouple API receiver from enrichment processing
event_queue = None

class Pipeline:
    def __init__(self):
        self.is_running = False
        self.worker_task = None
        self.max_events_per_sec = 20
        self.last_flush = time.time()
        self.global_feed_queue = None
        self.global_worker_task = None
        self.last_event_time = None
        self.events_sent_in_window = 0

    def start(self):
        global event_queue
        if event_queue is None:
            event_queue = asyncio.Queue(maxsize=10000)
            
        if self.global_feed_queue is None:
            self.global_feed_queue = asyncio.Queue(maxsize=100000)
            
        if not self.is_running:
            self.is_running = True
            self.worker_task = asyncio.create_task(self._worker())
            self.global_worker_task = asyncio.create_task(self._global_feed_worker())
            logger.info("Enrichment Pipeline started.")

    def stop(self):
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
        if self.global_worker_task:
            self.global_worker_task.cancel()

    async def enqueue_event(self, event_data: Dict[str, Any]):
        """Put raw event into queue"""
        try:
            if event_queue is not None:
                await event_queue.put(event_data)
                saddr = event_data.get('saddr', 'unknown')
                dport = event_data.get('dport', 'unknown')
                daddr = event_data.get('daddr', 'unknown')
                logger.info(f"Event queued: {saddr}:{dport} -> {daddr}")
        except asyncio.QueueFull:
            logger.warning("Event queue full, dropping event.")

    async def enqueue_global_feed(self, ips_dict: Dict[str, dict]):
        """Put batch of global threat IPs into queue for drip-feeding"""
        if self.global_feed_queue is not None:
            for ip, meta in ips_dict.items():
                try:
                    await self.global_feed_queue.put({"ip": ip, "meta": meta})
                except asyncio.QueueFull:
                    break
            logger.info(f"Enqueued {len(ips_dict)} global threats for drip-feeding.")

    async def _global_feed_worker(self):
        """Drip-feed global threats to WebSocket to avoid UI freeze"""
        import random
        # Default local infrastructure destination to draw arcs to
        local_geo = {"lat": 14.0583, "lng": 108.2772, "country": "Local Network"}
        
        while self.is_running:
            try:
                # If queue is empty, simulate a random attack from known malicious IPs
                if self.global_feed_queue is None or self.global_feed_queue.empty():
                    if threat_intel_service.malicious_ips:
                        # Pick a random IP from cache to simulate ongoing attacks from known bad actors
                        ip = random.choice(list(threat_intel_service.malicious_ips.keys()))
                        meta = threat_intel_service.malicious_ips[ip]
                        
                        # Resolve GeoIP
                        geo = geoip_service.lookup(ip)
                        
                        event = {
                            "source_kind": "global_threat_feed",
                            "source": geo,
                            "dest": local_geo,
                            "severity": "high" if meta.get("confidence", 0) > 0.8 else "medium",
                            "type": "malicious_ip",
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                            "reported_by": meta.get("reported_by", "Unknown"),
                            "confidence": meta.get("confidence", 1.0),
                            "first_seen": meta.get("first_seen", ""),
                            "malware_family": meta.get("malware_family", "Unknown"),
                            "metadata": {"note": "Global Threat Feed (Simulated)"}
                        }
                        await self._throttle_and_broadcast(event)
                    
                    await asyncio.sleep(random.uniform(0.5, 2.0))
                    continue
                
                # Process actual queue if it has items
                # Fetch up to 2 items per second
                for _ in range(2):
                    if self.global_feed_queue.empty():
                        break
                        
                    item = await self.global_feed_queue.get()
                    ip = item["ip"]
                    meta = item["meta"]
                    
                    # Resolve GeoIP
                    geo = geoip_service.lookup(ip)
                    
                    event = {
                        "source_kind": "global_threat_feed",
                        "source": geo,
                        "dest": local_geo,
                        "severity": "high" if meta.get("confidence", 0) > 0.8 else "medium",
                        "type": "malicious_ip",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "reported_by": meta.get("reported_by", "Unknown"),
                        "confidence": meta.get("confidence", 1.0),
                        "first_seen": meta.get("first_seen", ""),
                        "malware_family": meta.get("malware_family", "Unknown"),
                        "metadata": {"note": "Global Threat Feed"}
                    }
                    
                    await self._throttle_and_broadcast(event)
                    self.global_feed_queue.task_done()
                    
                await asyncio.sleep(1) # Drip-feed interval
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in global feed worker: {e}")
                await asyncio.sleep(1)

    async def _worker(self):
        """Background worker to process events"""
        while self.is_running:
            try:
                if event_queue is None:
                    await asyncio.sleep(1)
                    continue
                    
                # Get event from queue
                event = await event_queue.get()
                self.last_event_time = datetime.utcnow()
                
                # Enrich data
                enriched_event = await self._enrich(event)
                
                # Detection & Correlation
                from app.core.detection.engine import detection_engine
                if enriched_event:
                    detection_engine.evaluate_event(enriched_event)
                
                # Filter (only send malicious or high severity)
                if enriched_event:
                    await self._throttle_and_broadcast(enriched_event)
                
                event_queue.task_done()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in pipeline worker: {e}")
                await asyncio.sleep(1)

    async def _enrich(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Add GeoIP and Threat Intel to raw event"""
        saddr = event.get("saddr")
        daddr = event.get("daddr")
        
        # Threat Intel Check
        is_malicious = threat_intel_service.check_ip(saddr) or threat_intel_service.check_ip(daddr)
        
        # Optional: Filter out safe noise for Phase 2 demo.
        # If it's port 80/443 and not malicious, we might drop it unless we want to see it on map.
        # Let's keep it if it's a critical port (27017) or malicious.
        is_critical_port = event.get("dport") not in [80, 443]
        
        # DEMO MODE: Không drop bất kỳ event nào để thấy được kết quả trên UI
        # if not is_malicious and not is_critical_port:
        #     return None # Drop event to avoid map noise
            
        # GeoIP Lookup
        source_geo = geoip_service.lookup(saddr)
        dest_geo = geoip_service.lookup(daddr)
        
        severity = "high" if is_malicious else "medium"
        
        source_country = source_geo.get("country", "Unknown") if source_geo else "Unknown"
        dest_country = dest_geo.get("country", "Unknown") if dest_geo else "Unknown"
        logger.info(f"Event enriched: {source_country} -> {dest_country}, malicious={is_malicious}")
        
        # Format for Frontend Map
        return {
            "source_kind": "local_sensor",
            "source": source_geo,
            "dest": dest_geo,
            "severity": severity,
            "type": "malicious_ip" if is_malicious else "critical_port_access",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "metadata": event # Keep raw data just in case
        }

    async def _throttle_and_broadcast(self, event: Dict[str, Any]):
        """Broadcast event to WebSocket with throttling, and store in ClickHouse."""
        current_time = time.time()
        
        # Reset window every second
        if current_time - self.last_flush >= 1.0:
            self.last_flush = current_time
            self.events_sent_in_window = 0
            
        if self.events_sent_in_window < self.max_events_per_sec:
            await manager.broadcast(json.dumps(event))
            self.events_sent_in_window += 1
            logger.info(f"Event broadcast to {len(manager.active_connections)} clients")
        else:
            logger.warning("Event throttled (rate limit reached)")

        # Store ALL events in ClickHouse (even throttled ones) for compliance
        try:
            clickhouse_storage.store_event(event)
        except Exception as e:
            logger.debug(f"ClickHouse store skipped: {e}")

pipeline = Pipeline()
