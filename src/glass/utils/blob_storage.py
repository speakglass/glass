"""Helpers for uploading files to Azure Blob Storage."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import (
    BlobServiceClient,
    BlobSasPermissions,
    ContentSettings,
    generate_blob_sas,
)

LOGGER = logging.getLogger(__name__)
AZURITE_DEFAULT_API_VERSION = "2023-11-03"
DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365  # 1 year


@dataclass
class AzureBlobUploader:
    """Lightweight wrapper for uploading bytes to Azure Blob Storage."""

    connection_string: str
    container: str
    public_base_url: str | None = None
    api_version: str | None = None
    public_access: str | None = None
    require_signed_urls: bool | None = None
    signed_url_ttl_seconds: int | None = DEFAULT_SIGNED_URL_TTL_SECONDS
    _connection_settings: dict[str, str] = field(init=False, repr=False, default_factory=dict)

    def __post_init__(self) -> None:
        client_kwargs = {}
        inferred_version = self._infer_api_version()
        if inferred_version:
            client_kwargs["api_version"] = inferred_version
        self._service_client = BlobServiceClient.from_connection_string(
            self.connection_string, **client_kwargs
        )
        self._container_client = self._service_client.get_container_client(self.container)
        self._ensure_container()
        self._connection_settings = self._parse_connection_string()
        self._sign_urls = self._should_sign_urls()

    def _ensure_container(self) -> None:
        """Ensure the container exists and has the correct public access level."""
        try:
            self._container_client.create_container(public_access=self.public_access)
        except ResourceExistsError:
            pass
        except Exception as exc:  # pragma: no cover - azure SDK errors
            LOGGER.warning("Unable to ensure blob container %s exists: %s", self.container, exc)
        self._apply_public_access()

    def upload_bytes(self, data: bytes, *, blob_name: str, content_type: Optional[str] = None) -> str:
        """Upload bytes to blob storage and return the blob URL."""
        blob_client = self._container_client.get_blob_client(blob_name)
        content_settings = ContentSettings(content_type=content_type) if content_type else None
        blob_client.upload_blob(data, overwrite=True, content_settings=content_settings)
        url = self._format_public_url(blob_name, blob_client.url)
        if self._sign_urls:
            signed = self._build_signed_query(blob_name)
            if signed:
                delimiter = "&" if "?" in url else "?"
                url = f"{url}{delimiter}{signed}"
        return url

    def _format_public_url(self, blob_name: str, default_url: str) -> str:
        """Return the externally accessible URL, falling back to Azure's default."""
        if not self.public_base_url:
            return default_url
        base = self.public_base_url.rstrip("/")
        suffix = blob_name.lstrip("/")
        encoded_suffix = quote(suffix, safe="/-._~")
        return f"{base}/{encoded_suffix}"

    def _infer_api_version(self) -> str | None:
        """Return the API version to use (overrides default for Azurite)."""
        if self.api_version:
            return self.api_version
        if "devstoreaccount1" in self.connection_string.lower():
            return AZURITE_DEFAULT_API_VERSION
        return None

    def _apply_public_access(self) -> None:
        """Ensure container public access policy matches configuration (best-effort)."""
        if not self.public_access:
            return
        try:
            self._container_client.set_container_access_policy(public_access=self.public_access)
        except Exception as exc:  # pragma: no cover - azure SDK errors
            LOGGER.warning(
                "Unable to set public access %s on container %s: %s",
                self.public_access,
                self.container,
                exc,
            )

    def _should_sign_urls(self) -> bool:
        """Return True if blob URLs should include SAS signatures."""
        if self.require_signed_urls is not None:
            return self.require_signed_urls
        return "devstoreaccount1" in self.connection_string.lower()

    def _build_signed_query(self, blob_name: str) -> str | None:
        """Return a SAS query string for the blob (if credentials allow)."""
        ttl = self.signed_url_ttl_seconds or 0
        if ttl <= 0:
            return None
        credential = getattr(self._service_client, "credential", None)
        account_name = getattr(self._service_client, "account_name", None)
        account_key = None
        if credential is not None:
            account_key = getattr(credential, "account_key", None)
            if not account_key:
                named_key = getattr(credential, "named_key", None)
                if named_key is not None:
                    account_key = getattr(named_key, "key", None)
                    if not account_name:
                        account_name = getattr(named_key, "name", None)
        if not account_name:
            account_name = self._connection_settings.get("accountname")
        if not account_key:
            account_key = self._connection_settings.get("accountkey")
        if not account_name or not account_key:
            LOGGER.debug("Skipping SAS generation for %s; missing account key", blob_name)
            return None
        expiry = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        try:
            return generate_blob_sas(
                account_name=account_name,
                container_name=self.container,
                blob_name=blob_name,
                account_key=account_key,
                permission=BlobSasPermissions(read=True),
                expiry=expiry,
            )
        except Exception as exc:  # pragma: no cover - azure SDK errors
            LOGGER.warning("Unable to generate SAS for blob %s: %s", blob_name, exc)
            return None

    def _parse_connection_string(self) -> dict[str, str]:
        """Best-effort parsing for connection string settings."""
        settings: dict[str, str] = {}
        try:
            pairs = [segment for segment in self.connection_string.split(";") if segment]
            for pair in pairs:
                if "=" not in pair:
                    continue
                key, value = pair.split("=", 1)
                settings[key.strip().lower()] = value.strip()
        except Exception as exc:  # pragma: no cover - defensive parsing
            LOGGER.debug("Unable to parse Azure connection string: %s", exc)
        return settings


def build_partner_avatar_blob_name(user_id: str, partner_id: str, extension: str | None = None) -> str:
    """Return a deterministic path for partner avatar uploads."""
    suffix = extension or ""
    if suffix and not suffix.startswith("."):
        suffix = f".{suffix}"
    return f"partners/{user_id}/{partner_id}/{uuid.uuid4().hex}{suffix}"
