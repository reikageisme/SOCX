import requests
import logging

logger = logging.getLogger(__name__)

DISCORD_WEBHOOKS = {
    "critical-alerts": "https://discord.com/api/webhooks/1532420096193069228/asVFc_JWecNRCIQt9FpvkFgiET3n0aTCgxcYR29f8YeNgwZdyyXAhUybqn3GdYyaGiTG",
    "security-warnings": "https://discord.com/api/webhooks/1532420556115279933/3BBagKEN_B0cc6bUvM4tP9fkBSoPF2lFTbui8lpBnKoSYnSCOj-RV_SYT9rEsLwuAviO",
    "pve-status": "https://discord.com/api/webhooks/1532420780330189092/As2vEBnRFiBGHUwDBU6XcqTGpRGZ7tSOwrcin2GoNvxdtPqZlTM2u0_o4zQxzDrWZqOB",
    "network-logs": "https://discord.com/api/webhooks/1532420931891237114/mNgMGb_my8Uey6ANQqeH9AGOQc_WGnPvaQ72ezI2mqwtAtLH76IOemblSoBszT0fUVRy",
    "database-monitor": "https://discord.com/api/webhooks/1532421094072385757/r_CyTEZnIacuTEGSgqOoINdqZMFgJSUX4-TzlS9X5OKgBZ7e4QTCG50nn9XbXIVIP1l8",
    "pentest-reports": "https://discord.com/api/webhooks/1532421218651734208/Wrnc2h9qWamOv8CH07SSqnvKV42LBDB1vSdtNPEyZ5f9mWosPTz8Ft5kc5omKvtQWT3a",
    "forensics-analysis": "https://discord.com/api/webhooks/1532421331755335681/L8YI6K0ebbT41-A5E-qUbyrS9EqDQuq1bOO5IVeRyUEO8F31DgRw0MXy-16bi_VFjT91"
}

class DiscordService:
    def __init__(self):
        pass

    def send_alert(self, category: str, content: str = None, embeds: list = None) -> bool:
        """
        Send a message via Discord Webhook.
        """
        url = DISCORD_WEBHOOKS.get(category)
        if not url:
            logger.error(f"Unknown Discord category: {category}")
            return False

        payload = {}
        if content:
            payload["content"] = content
        if embeds:
            payload["embeds"] = embeds

        try:
            res = requests.post(url, json=payload, timeout=10)
            res.raise_for_status()
            logger.info(f"Discord alert sent to #{category}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Discord alert to #{category}: {str(e)}")
            return False

discord_service = DiscordService()
