import asyncio
import random
import uuid
import json
from datetime import datetime, timezone

# Some realistic lat/lng pairs for countries to simulate global attacks
COUNTRY_COORDS = {
    "US": [37.0902, -95.7129],
    "CN": [35.8617, 104.1954],
    "RU": [61.5240, 105.3188],
    "DE": [51.1657, 10.4515],
    "BR": [-14.2350, -51.9253],
    "IN": [20.5937, 78.9629],
    "VN": [14.0583, 108.2772],
    "FR": [46.2276, 2.2137],
    "GB": [55.3781, -3.4360],
    "KR": [35.9078, 127.7669],
    "JP": [36.2048, 138.2529],
    "AU": [-25.2744, 133.7751]
}

ATTACK_TYPES = [
    {"type": "Malware", "severity": "high", "color": "bg-red-500"},
    {"type": "Phishing", "severity": "medium", "color": "bg-purple-500"},
    {"type": "Exploit", "severity": "high", "color": "bg-orange-500"},
    {"type": "DDoS", "severity": "low", "color": "bg-blue-500"},
    {"type": "SQL Injection", "severity": "medium", "color": "bg-yellow-500"}
]

class GlobalAttackSimulator:
    """
    VISUALIZATION SIMULATOR
    Generates mock global threat events for map visualization purposes only.
    Not real threat data.
    """
    def __init__(self):
        self.is_running = False
        self._task = None

    def generate_random_attack(self):
        countries = list(COUNTRY_COORDS.keys())
        src_country = random.choice(countries)
        dst_country = random.choice([c for c in countries if c != src_country])
        
        # Add slight jitter to coordinates so they don't all stack on exactly the same pixel
        src_lat = COUNTRY_COORDS[src_country][0] + random.uniform(-2.0, 2.0)
        src_lng = COUNTRY_COORDS[src_country][1] + random.uniform(-2.0, 2.0)
        
        dst_lat = COUNTRY_COORDS[dst_country][0] + random.uniform(-2.0, 2.0)
        dst_lng = COUNTRY_COORDS[dst_country][1] + random.uniform(-2.0, 2.0)
        
        attack = random.choice(ATTACK_TYPES)
        
        event = {
            "id": str(uuid.uuid4()),
            "source_kind": "global_simulated",
            "source": {
                "lat": src_lat,
                "lng": src_lng,
                "country": src_country,
                "query": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
            },
            "dest": {
                "lat": dst_lat,
                "lng": dst_lng,
                "country": dst_country,
                "query": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
            },
            "severity": attack["severity"],
            "type": attack["type"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reported_by": "Radware-Sim"
        }
        return event

    async def _run(self):
        # Prevent circular import at module load
        from app.core.websockets import manager
        while self.is_running:
            # Generate 1-3 attacks per tick
            num_attacks = random.randint(1, 3)
            for _ in range(num_attacks):
                event = self.generate_random_attack()
                await manager.broadcast(json.dumps(event))
            
            # Fire very fast: every 300ms to 800ms
            await asyncio.sleep(random.uniform(0.3, 0.8))

    def start(self):
        if not self.is_running:
            self.is_running = True
            
            # IMPORTANT: Simulated events bypass pipeline/detection intentionally
            import logging
            logger = logging.getLogger(__name__)
            logger.info("Global Attack Simulator started (visualization only, not real threats)")
            
            self._task = asyncio.create_task(self._run())

    def stop(self):
        if self.is_running:
            self.is_running = False
            if self._task:
                self._task.cancel()

simulator = GlobalAttackSimulator()
