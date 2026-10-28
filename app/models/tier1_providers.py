"""
Tier 1 Free Cloud Providers

Production implementations for:
- OpenRouter (many models, free tier)
- Groq (very fast, free tier)
- Gemini API (strong reasoning, free tier)
- NVIDIA NIM (production models, free tier)
"""

import httpx
import os
from typing import Optional

from app.models.multi_provider_system import BaseProvider, ProviderConfig
from app.utils.logger import get_logger

logger = get_logger(__name__)


class OpenRouterProvider(BaseProvider):
    """OpenRouter provider (free-tier support)"""
    
    ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
    
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        
        config = ProviderConfig(
            name="OpenRouter",
            provider_id="openrouter",
            api_key=api_key,
            endpoint=self.ENDPOINT,
            models=[
                "openrouter/auto",
                "meta-llama/llama-2-70b-chat",
                "mistralai/mistral-7b-instruct",
                "mistralai/mistral-medium",
                "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
            ],
            priority=1,
            free_tier=True,
            rate_limit_per_minute=3,
        )
        
        super().__init__(config)
    
    async def generate(
        self,
        prompt: str,
        model: str = "openrouter/auto",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> str:
        """Generate response from OpenRouter"""
        if not self.config.api_key:
            raise ValueError("OPENROUTER_API_KEY not set")
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "HTTP-Referer": "https://github.com/Harsha-code-per/DeV",
            "X-Title": "DeV AI Engineering OS",
        }
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.ENDPOINT,
                json=payload,
                headers=headers
            )
            
            if response.status_code == 429:
                raise Exception("OpenRouter rate limited (429)")
            
            response.raise_for_status()
            data = response.json()
            
            return data["choices"][0]["message"]["content"]
    
    async def health_check(self) -> bool:
        """Check OpenRouter health"""
        try:
            if not self.config.api_key:
                return False
            
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://openrouter.ai/api/v1/auth/key",
                    headers=headers
                )
                
                return response.status_code == 200
        
        except Exception as e:
            logger.warning(f"OpenRouter health check failed: {e}")
            return False


class GroqProvider(BaseProvider):
    """Groq provider (very fast, free tier)"""
    
    ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
    
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GROQ_API_KEY")
        
        config = ProviderConfig(
            name="Groq",
            provider_id="groq",
            api_key=api_key,
            endpoint=self.ENDPOINT,
            models=[
                "mixtral-8x7b-32768",
                "llama2-70b-4096",
            ],
            priority=0,  # Highest priority - fastest
            free_tier=True,
            rate_limit_per_minute=30,
        )
        
        super().__init__(config)
    
    async def generate(
        self,
        prompt: str,
        model: str = "mixtral-8x7b-32768",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> str:
        """Generate response from Groq"""
        if not self.config.api_key:
            raise ValueError("GROQ_API_KEY not set")
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.ENDPOINT,
                json=payload,
                headers=headers
            )
            
            if response.status_code == 429:
                raise Exception("Groq rate limited (429)")
            
            response.raise_for_status()
            data = response.json()
            
            return data["choices"][0]["message"]["content"]
    
    async def health_check(self) -> bool:
        """Check Groq health"""
        try:
            if not self.config.api_key:
                return False
            
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers=headers
                )
                
                return response.status_code == 200
        
        except Exception as e:
            logger.warning(f"Groq health check failed: {e}")
            return False


class GeminiProvider(BaseProvider):
    """Google Gemini API provider (strong reasoning, free tier)"""
    
    ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
    
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        
        config = ProviderConfig(
            name="Google Gemini",
            provider_id="gemini",
            api_key=api_key,
            endpoint=self.ENDPOINT,
            models=[
                "gemini-1.5-flash",
                "gemini-1.5-pro",
                "gemini-pro",
            ],
            priority=2,
            free_tier=True,
            rate_limit_per_minute=10,
        )
        
        super().__init__(config)
    
    async def generate(
        self,
        prompt: str,
        model: str = "gemini-1.5-flash",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> str:
        """Generate response from Gemini"""
        if not self.config.api_key:
            raise ValueError("GEMINI_API_KEY not set")
        
        url = f"{self.ENDPOINT}/{model}:generateContent?key={self.config.api_key}"
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            
            if response.status_code == 429:
                raise Exception("Gemini rate limited (429)")
            
            response.raise_for_status()
            data = response.json()
            
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError) as e:
                raise Exception(f"Invalid Gemini response: {e}")
    
    async def health_check(self) -> bool:
        """Check Gemini health"""
        try:
            if not self.config.api_key:
                return False
            
            url = f"{self.ENDPOINT}?key={self.config.api_key}"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                
                return response.status_code == 200
        
        except Exception as e:
            logger.warning(f"Gemini health check failed: {e}")
            return False


class NVIDIANIMProvider(BaseProvider):
    """NVIDIA NIM provider (production models, free tier)"""
    
    ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
    
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("NVIDIA_API_KEY")
        
        config = ProviderConfig(
            name="NVIDIA NIM",
            provider_id="nvidia",
            api_key=api_key,
            endpoint=self.ENDPOINT,
            models=[
                "meta/llama2-70b",
                "mistralai/mixtral-8x7b-instruct-v0.1",
                "nvidia/neva-22b",
            ],
            priority=3,
            free_tier=True,
            rate_limit_per_minute=5,
        )
        
        super().__init__(config)
    
    async def generate(
        self,
        prompt: str,
        model: str = "meta/llama2-70b",
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> str:
        """Generate response from NVIDIA NIM"""
        if not self.config.api_key:
            raise ValueError("NVIDIA_API_KEY not set")
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.ENDPOINT,
                json=payload,
                headers=headers
            )
            
            if response.status_code == 429:
                raise Exception("NVIDIA NIM rate limited (429)")
            
            response.raise_for_status()
            data = response.json()
            
            return data["choices"][0]["message"]["content"]
    
    async def health_check(self) -> bool:
        """Check NVIDIA NIM health"""
        try:
            if not self.config.api_key:
                return False
            
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.ENDPOINT}",
                    headers=headers
                )
                
                # NIM might not have a health endpoint, check if we can reach it
                return response.status_code in [200, 404]
        
        except Exception as e:
            logger.warning(f"NVIDIA NIM health check failed: {e}")
            return False
