"""Memory embedding generation for semantic search."""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger(__name__)


class MemoryEmbedder:
    """Generate embeddings for memory records with multilingual support.

    Supports multiple embedding providers with a focus on multilingual
    semantic search across different languages.
    """

    def __init__(self, provider: str = "openai", api_key: str | None = None) -> None:
        """Initialize embedder with specified provider.

        Args:
            provider: Embedding provider ("openai", "gemini")
            api_key: API key for the provider (if None, uses environment variable)
        """
        self.provider = provider.lower()
        self.api_key = api_key

        if self.provider == "openai":
            # text-embedding-3-small (1536 dim) for HNSW index compatibility
            # Note: HNSW index has 2000 dimension limit, so can't use 3-large (3072 dim)
            self.model = "text-embedding-3-small"
            self.dimension = 1536
            self._init_openai()
        elif self.provider == "gemini":
            self.model = "text-embedding-004"
            self.dimension = 768
            self._init_gemini()
        else:
            raise ValueError(f"Unsupported embedding provider: {provider}")

        LOGGER.info(
            f"[MemoryEmbedder] Initialized with provider={self.provider}, model={self.model}, dimension={self.dimension}"
        )

    def _init_openai(self) -> None:
        """Initialize OpenAI client."""
        try:
            import openai

            if self.api_key:
                self.client = openai.AsyncOpenAI(api_key=self.api_key)
            else:
                self.client = openai.AsyncOpenAI()  # Uses OPENAI_API_KEY env var
        except ImportError as e:
            raise ImportError("OpenAI package required. Install with: pip install openai") from e

    def _init_gemini(self) -> None:
        """Initialize Gemini client."""
        try:
            import google.genai as genai

            if self.api_key:
                self.client = genai.Client(api_key=self.api_key)
            else:
                self.client = genai.Client()  # Uses GOOGLE_API_KEY env var
        except ImportError as e:
            raise ImportError("Google GenAI package required. Install with: pip install google-genai") from e

    async def embed_memory(self, text: str) -> list[float]:
        """Generate embedding for a memory record.

        Uses only the raw text for best semantic matching.

        Args:
            text: Memory text to embed

        Returns:
            Embedding vector as list of floats
        """
        # Truncate if too long (most models have ~8K token limits)
        max_chars = 8000
        if len(text) > max_chars:
            text = text[:max_chars]
            LOGGER.warning(f"[MemoryEmbedder] Truncated text to {max_chars} chars")

        try:
            embedding = await self._generate_embedding(text)
            return embedding
        except Exception as e:
            LOGGER.error(f"[MemoryEmbedder] Failed to embed memory: {e}", exc_info=True)
            raise

    async def embed_query(self, query: str, context: str | None = None) -> list[float]:
        """Generate embedding for a search query.

        Args:
            query: Search query text
            context: Optional conversation context for better results

        Returns:
            Embedding vector as list of floats
        """
        # Add context if provided (helps with ambiguous queries)
        if context:
            max_context_chars = 500
            if len(context) > max_context_chars:
                context = context[:max_context_chars]
            text = f"{query}\n\nContext: {context}"
        else:
            text = query

        try:
            embedding = await self._generate_embedding(text)
            return embedding
        except Exception as e:
            LOGGER.error(f"[MemoryEmbedder] Failed to embed query: {e}", exc_info=True)
            raise

    async def _generate_embedding(self, text: str) -> list[float]:
        """Generate embedding using the configured provider.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        if self.provider == "openai":
            return await self._generate_openai_embedding(text)
        elif self.provider == "gemini":
            return await self._generate_gemini_embedding(text)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def _generate_openai_embedding(self, text: str) -> list[float]:
        """Generate embedding using OpenAI API."""
        response = await self.client.embeddings.create(model=self.model, input=text, encoding_format="float")
        return response.data[0].embedding

    async def _generate_gemini_embedding(self, text: str) -> list[float]:
        """Generate embedding using Gemini API."""
        # Note: Gemini API may have different async patterns
        # This is a placeholder - adjust based on actual API
        response = await self.client.models.embed_content(
            model=self.model,
            content=text,
        )
        return response.embedding

    async def embed_batch(
        self,
        texts: list[str],
        batch_size: int = 100,
    ) -> list[list[float]]:
        """Generate embeddings for multiple texts efficiently.

        Useful for backfilling existing records.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts per API call (provider-dependent)

        Returns:
            List of embedding vectors
        """
        if self.provider == "openai":
            # OpenAI supports batch embedding
            all_embeddings: list[list[float]] = []

            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                response = await self.client.embeddings.create(model=self.model, input=batch, encoding_format="float")
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)

            return all_embeddings
        else:
            # Fallback: Generate one by one
            embeddings = []
            for text in texts:
                embedding = await self._generate_embedding(text)
                embeddings.append(embedding)
            return embeddings
