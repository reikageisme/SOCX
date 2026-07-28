import os
import aiohttp
import asyncio
import geoip2.database
from geoip2.errors import AddressNotFoundError
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "GeoLite2-City.mmdb")
DB_URL = "https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-City.mmdb"

class GeoIPService:
    def __init__(self):
        self.reader = None
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    async def initialize(self):
        if not os.path.exists(DB_PATH):
            logger.info("GeoLite2-City.mmdb not found. Downloading...")
            await self._download_db()
        else:
            logger.info("GeoLite2-City.mmdb found.")
        
        try:
            self.reader = geoip2.database.Reader(DB_PATH)
        except Exception as e:
            logger.error(f"Failed to load GeoIP Database: {e}")

    async def _download_db(self):
        try:
            from app.config import settings
            import tarfile
            import io
            
            if settings.MAXMIND_LICENSE_KEY:
                url = f"https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key={settings.MAXMIND_LICENSE_KEY}&suffix=tar.gz"
                logger.info("Using Official MaxMind URL with License Key...")
            else:
                url = DB_URL
                logger.info("Using Github Mirror for GeoLite2-City...")

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        content = await response.read()
                        
                        if settings.MAXMIND_LICENSE_KEY:
                            # Maxmind returns a tar.gz file
                            tar = tarfile.open(fileobj=io.BytesIO(content), mode="r:gz")
                            for member in tar.getmembers():
                                if member.name.endswith(".mmdb"):
                                    f = tar.extractfile(member)
                                    with open(DB_PATH, "wb") as out:
                                        out.write(f.read())
                                    logger.info("Successfully extracted and downloaded GeoIP database from MaxMind.")
                                    break
                        else:
                            # Mirror returns raw mmdb file
                            with open(DB_PATH, "wb") as f:
                                f.write(content)
                            logger.info("Successfully downloaded GeoIP database from Mirror.")
                    else:
                        logger.error(f"Failed to download GeoIP DB, status code: {response.status}")
        except Exception as e:
            logger.error(f"Error downloading GeoIP DB: {e}")

    def lookup(self, ip_address: str):
        if not self.reader:
            return {"lat": 0.0, "lng": 0.0, "country": "Unknown", "is_local": False}
            
        try:
            # Skip lookup for local IPs
            if ip_address.startswith("10.") or ip_address.startswith("192.168.") or ip_address.startswith("127.") or ip_address.startswith("172."):
                return {"lat": 0.0, "lng": 0.0, "country": "Local Network", "is_local": True}

            response = self.reader.city(ip_address)
            return {
                "lat": response.location.latitude or 0.0,
                "lng": response.location.longitude or 0.0,
                "country": response.country.iso_code or "Unknown",
                "is_local": False
            }
        except AddressNotFoundError:
            return {"lat": 0.0, "lng": 0.0, "country": "Unknown", "is_local": False}
        except Exception as e:
            logger.error(f"GeoIP Lookup error for {ip_address}: {e}")
            return {"lat": 0.0, "lng": 0.0, "country": "Error", "is_local": False}

    def close(self):
        if self.reader:
            self.reader.close()

geoip_service = GeoIPService()
