from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseAIProvider(ABC):
    @abstractmethod
    async def generate_summary(self, prompt: str) -> str:
        """Generate a summary based on the given prompt."""
        pass

class OllamaProvider(BaseAIProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3:8b"):
        self.base_url = base_url
        self.model = model

    async def generate_summary(self, prompt: str) -> str:
        # Placeholder for actual Ollama API call
        # e.g., using aiohttp to POST to self.base_url + "/api/generate"
        return f"[Ollama {self.model}] Summary of incident: {prompt[:50]}..."

class GeminiProvider(BaseAIProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def generate_summary(self, prompt: str) -> str:
        # Placeholder for actual Gemini API call
        return f"[Gemini] Summary of incident: {prompt[:50]}..."

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
