import os
import aiohttp
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings

logger = logging.getLogger(__name__)

class ThreatIntelService:
    def __init__(self):
        self.malicious_ips = {} # Dict[str, dict] IP -> Metadata
        self.scheduler = AsyncIOScheduler()
        self.last_pull_time = None
        self.last_pull_status = "pending"

    async def initialize(self):
        logger.info("Initializing Threat Intel Cache...")
        await self.pull_threat_intel()
        self.scheduler.add_job(self.pull_threat_intel, 'interval', minutes=15)
        self.scheduler.start()

    async def pull_threat_intel(self):
        logger.info("Pulling Threat Intel...")
        new_ips_dict = {}
        try:
            # 1. Pull OTX
            if settings.OTX_API_KEY:
                otx_data = await self._pull_otx()
                new_ips_dict.update(otx_data)
                
            # 2. Pull ThreatFox
            if settings.THREATFOX_API_KEY:
                tf_data = await self._pull_threatfox()
                new_ips_dict.update(tf_data)
                
            # 3. Pull AbuseIPDB
            if settings.ABUSEIPDB_API_KEY:
                abuse_data = await self._pull_abuseipdb()
                new_ips_dict.update(abuse_data)
                
            if new_ips_dict:
                self.malicious_ips.update(new_ips_dict)
                logger.info(f"Loaded {len(new_ips_dict)} NEW malicious IPs into cache. Total: {len(self.malicious_ips)}")
                
                # Đẩy dữ liệu mới cho pipeline để broadcast lên bản đồ dưới dạng global threat feed
                from app.core.pipeline import pipeline
                if hasattr(pipeline, 'enqueue_global_feed'):
                    asyncio.create_task(pipeline.enqueue_global_feed(new_ips_dict))
            else:
                logger.warning("No new threat intel IPs from APIs. Keeping existing cache.")
                
            self.last_pull_time = __import__('datetime').datetime.utcnow()
            self.last_pull_status = "success"
            
        except Exception as e:
            logger.error(f"Error pulling threat intel: {e}")
            self.last_pull_status = "failed"
            self.last_pull_time = __import__('datetime').datetime.utcnow()

    async def _pull_otx(self) -> dict:
        url = "https://otx.alienvault.com/api/v1/pulses/subscribed"
        headers = {"X-OTX-API-KEY": settings.OTX_API_KEY}
        ip_data = {}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        for pulse in data.get("results", []):
                            pulse_name = pulse.get("name", "Unknown Pulse")
                            pulse_created = pulse.get("created", "")
                            for indicator in pulse.get("indicators", []):
                                if indicator.get("type") in ["IPv4", "IPv6"]:
                                    ip = indicator.get("indicator")
                                    ip_data[ip] = {
                                        "reported_by": "OTX",
                                        "confidence": 1.0,
                                        "first_seen": pulse_created,
                                        "malware_family": pulse_name
                                    }
        except Exception as e:
            logger.error(f"OTX pull failed: {e}")
        return ip_data

    async def _pull_threatfox(self) -> dict:
        url = "https://threatfox-api.abuse.ch/api/v1/"
        headers = {"API-KEY": settings.THREATFOX_API_KEY}
        payload = {"query": "get_iocs", "days": 1}
        ip_data = {}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        for ioc in data.get("data", []):
                            if ioc.get("ioc_type") in ["ip:port", "ipv4:port"]:
                                ip = ioc.get("ioc").split(":")[0]
                                ip_data[ip] = {
                                    "reported_by": "ThreatFox",
                                    "confidence": ioc.get("confidence_level", 100) / 100.0,
                                    "first_seen": ioc.get("first_seen", ""),
                                    "malware_family": ioc.get("malware", "Unknown")
                                }
        except Exception as e:
            logger.error(f"ThreatFox pull failed: {e}")
        return ip_data

    async def _pull_abuseipdb(self) -> dict:
        url = "https://api.abuseipdb.com/api/v2/blacklist"
        headers = {
            "Key": settings.ABUSEIPDB_API_KEY,
            "Accept": "application/json"
        }
        params = {"confidenceMinimum": 90}
        ip_data = {}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        for item in data.get("data", []):
                            ip = item.get("ipAddress")
                            ip_data[ip] = {
                                "reported_by": "AbuseIPDB",
                                "confidence": item.get("abuseConfidenceScore", 100) / 100.0,
                                "first_seen": item.get("lastReportedAt", ""),
                                "malware_family": "Blacklisted Server"
                            }
        except Exception as e:
            logger.error(f"AbuseIPDB pull failed: {e}")
        return ip_data



    def check_ip(self, ip_address: str) -> bool:
        """Return True if the IP is known to be malicious"""
        return ip_address in self.malicious_ips

threat_intel_service = ThreatIntelService()
