import requests
import logging

logger = logging.getLogger(__name__)

class TelegramService:
    def __init__(self):
        pass

    def send_message(self, token: str, chat_id: str, message: str) -> bool:
        """
        Send a message via Telegram Bot API
        """
        if not token or not chat_id:
            logger.error("Missing Telegram bot token or chat ID")
            return False
            
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        
        try:
            res = requests.post(url, json=payload, timeout=10)
            res.raise_for_status()
            logger.info(f"Telegram message sent to {chat_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {str(e)}")
            return False

telegram_service = TelegramService()
