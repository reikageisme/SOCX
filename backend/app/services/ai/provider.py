import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

import aiohttp

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert SOC (Security Operations Center) analyst assistant.
When given incident details, provide a concise, actionable summary including:
1. Attack classification and severity assessment
2. Potential impact analysis
3. Recommended immediate response actions
4. Suggested investigation steps
Keep the summary under 300 words. Use bullet points for clarity."""

NL2SQL_PROMPT = """You are a ClickHouse SQL expert. Translate the following natural language query into a valid ClickHouse SQL SELECT statement for the `threat_events` table.
Table Schema:
- id (String)
- source_kind (String)
- source_ip (String)
- source_country (String)
- dest_ip (String)
- dest_country (String)
- severity (String)
- event_type (String)
- timestamp (DateTime64)

Rules:
1. Return ONLY the raw SQL query.
2. Do not include markdown formatting like ```sql ... ```.
3. Do not include any explanations.
4. Default limit is 100 unless specified.
5. Use proper ClickHouse syntax (e.g. toYYYYMMDD for date)."""


class BaseAIProvider(ABC):
    @abstractmethod
    async def generate_summary(self, prompt: str) -> str:
        """Generate a summary based on the given prompt."""
        pass

    @abstractmethod
    async def translate_nl_to_sql(self, query: str) -> str:
        """Translate Natural Language to ClickHouse SQL."""
        pass


class OllamaProvider(BaseAIProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3:8b"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate_summary(self, prompt: str) -> str:
        """Call Ollama /api/generate endpoint."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": SYSTEM_PROMPT,
            "stream": False,
            "options": {
                "temperature": 0.3,
                "num_predict": 512,
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"Ollama API error {resp.status}: {error_text}")
                        return f"[AI Error] Ollama returned status {resp.status}"
                    
                    data = await resp.json()
                    return data.get("response", "[AI Error] Empty response from Ollama")
        except aiohttp.ClientConnectorError:
            logger.warning(f"Cannot connect to Ollama at {self.base_url}")
            return "[AI Error] Cannot connect to Ollama. Ensure it is running."
        except Exception as e:
            logger.error(f"Ollama generate error: {e}")
            return f"[AI Error] {str(e)}"

    async def translate_nl_to_sql(self, query: str) -> str:
        """Call Ollama for NL2SQL."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": query,
            "system": NL2SQL_PROMPT,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 256,
            },
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("response", "").replace("```sql", "").replace("```", "").strip()
                    return ""
        except Exception as e:
            logger.error(f"Ollama SQL error: {e}")
            return ""


class GeminiProvider(BaseAIProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def generate_summary(self, prompt: str) -> str:
        """Call Google Gemini API."""
        if not self.api_key:
            return "[AI Error] Gemini API key not configured"

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": f"{SYSTEM_PROMPT}\n\n{prompt}"}
                ]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 512,
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"Gemini API error {resp.status}: {error_text}")
                        return f"[AI Error] Gemini returned status {resp.status}"
                    
                    data = await resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "[AI Error] Empty Gemini response")
                    return "[AI Error] No candidates in Gemini response"
        except Exception as e:
            logger.error(f"Gemini generate error: {e}")
            return f"[AI Error] {str(e)}"

    async def translate_nl_to_sql(self, query: str) -> str:
        """Call Google Gemini API for NL2SQL."""
        if not self.api_key:
            return ""

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": f"{NL2SQL_PROMPT}\n\nQuery: {query}"}
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 256,
            },
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                return parts[0].get("text", "").replace("```sql", "").replace("```", "").strip()
                    return ""
        except Exception as e:
            logger.error(f"Gemini SQL error: {e}")
            return ""

class AIProviderFactory:
    _instance: Optional[BaseAIProvider] = None

    @classmethod
    def get_provider(cls, provider_type: str = "ollama", **kwargs) -> BaseAIProvider:
        if cls._instance is None:
            if provider_type == "ollama":
                cls._instance = OllamaProvider(
                    base_url=kwargs.get("url", "http://localhost:11434"),
                    model=kwargs.get("model", "llama3:8b")
                )
            elif provider_type == "gemini":
                cls._instance = GeminiProvider(api_key=kwargs.get("api_key", ""))
            else:
                raise ValueError(f"Unknown provider type: {provider_type}")
        return cls._instance

    @classmethod
    def set_provider(cls, provider_type: str, **kwargs):
        if provider_type == "ollama":
            cls._instance = OllamaProvider(
                base_url=kwargs.get("url", "http://localhost:11434"),
                model=kwargs.get("model", "llama3:8b")
            )
        elif provider_type == "gemini":
            cls._instance = GeminiProvider(api_key=kwargs.get("api_key", ""))
        else:
            raise ValueError(f"Unknown provider type: {provider_type}")
