from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import suppress
from dataclasses import dataclass, field, replace, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Sequence

from ..domain.avatar_fallbacks import choose_fallback_avatar
from ..domain.partner_generation import (
    PersonaPreferences,
    VoiceSelectionError,
    compress_interests,
    generate_avatar_image_bytes,
    generate_partner_persona,
    select_voice_for_persona,
)
from ..persistence.service import (
    create_partner,
    update_partner,
    count_roleplay_partners,
    upsert_partner_generation_job_record,
)
from ..utils.blob_storage import AzureBlobUploader, build_partner_avatar_blob_name
from ..services.limits import partner_limit_status

LOGGER = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PartnerGenerationJobStatus(str, Enum):
    QUEUED = "queued"
    GENERATING_PERSONA = "generating_persona"
    SELECTING_VOICE = "selecting_voice"
    SAVING_PARTNER = "saving_partner"
    GENERATING_AVATAR = "generating_avatar"
    COMPLETED = "completed"
    FAILED = "failed"


PartnerGenerationStep = str  # Narrowed elsewhere ('persona', 'voice', 'partner', 'avatar')


@dataclass
class PersonaPreview:
    name: str | None = None
    summary: str | None = None
    summary_translation: str | None = None
    persona_age: str | None = None
    persona_gender: str | None = None
    persona_occupation: str | None = None
    persona_occupation_translation: str | None = None
    persona_city: str | None = None
    persona_city_translation: str | None = None
    persona_country: str | None = None
    persona_country_translation: str | None = None
    persona_background: str | None = None
    persona_interests: list[str] = field(default_factory=list)
    persona_background_translation: str | None = None
    persona_interests_translation: list[str] = field(default_factory=list)


@dataclass
class PartnerGenerationJob:
    id: str
    user_id: str
    status: PartnerGenerationJobStatus = PartnerGenerationJobStatus.QUEUED
    message: str | None = None
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)
    steps_completed: list[PartnerGenerationStep] = field(default_factory=list)
    persona_preview: PersonaPreview | None = None
    partner: Any | None = None
    partner_id: str | None = None
    voice_id: str | None = None
    error: str | None = None
    task: asyncio.Task | None = field(default=None, repr=False, compare=False)

    def snapshot(self) -> PartnerGenerationJob:
        """Return a copy for safe external reads."""
        return replace(
            self,
            steps_completed=list(self.steps_completed),
            persona_preview=replace(self.persona_preview) if self.persona_preview else None,
            task=None,
        )


class PartnerGenerationJobManager:
    """In-memory coordinator for partner generation background jobs."""

    def __init__(self, *, database, settings, llm_adapter) -> None:
        self._database = database
        self._settings = settings
        self._llm = llm_adapter
        self._jobs: dict[str, PartnerGenerationJob] = {}
        self._lock = asyncio.Lock()
        self._retention = timedelta(minutes=30)

    async def start_job(
        self,
        *,
        user_id: str,
        learning_lang: str | None,
        native_lang: str | None,
        language_level: str | None,
        topics: Sequence[str],
        partner_type: str,
        gender: str,
        age_range: str,
        billing_payload: dict[str, Any] | None = None,
    ) -> PartnerGenerationJob:
        if not self._llm:
            raise RuntimeError("LLM adapter is not configured")

        job = PartnerGenerationJob(
            id=uuid.uuid4().hex,
            user_id=user_id,
            status=PartnerGenerationJobStatus.QUEUED,
            message="Looking for someone who matches your vibe",
        )
        async with self._lock:
            self._prune_locked()
            self._jobs[job.id] = job
            snapshot = job.snapshot()
        await self._persist_job_snapshot(snapshot)

        preferences = PersonaPreferences(
            learning_lang=learning_lang,
            native_lang=native_lang,
            language_level=language_level,
            topics=topics,
            partner_type=partner_type,  # type: ignore[arg-type]
            gender=gender,  # type: ignore[arg-type]
            age_range=age_range,  # type: ignore[arg-type]
        )

        job.task = asyncio.create_task(
            self._run_job(
                job_id=job.id,
                user_id=user_id,
                preferences=preferences,
                billing_payload=billing_payload or {},
            )
        )
        job.task.add_done_callback(lambda task, job_id=job.id: self._log_task_result(job_id, task))
        return job.snapshot()

    async def get_job(self, job_id: str, *, user_id: str) -> PartnerGenerationJob | None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.user_id != user_id:
                return None
            return job.snapshot()

    async def _run_job(
        self,
        *,
        job_id: str,
        user_id: str,
        preferences: PersonaPreferences,
        billing_payload: dict[str, Any],
    ) -> None:
        import time

        job_start_time = time.time()
        LOGGER.info(
            "[Job %s] Starting partner generation for user %s (lang=%s, level=%s)",
            job_id,
            user_id,
            preferences.learning_lang,
            preferences.language_level,
        )

        avatar_task: asyncio.Task[bytes | None] | None = None
        try:
            await self._update_job(
                job_id,
                status=PartnerGenerationJobStatus.GENERATING_PERSONA,
                message="Meeting promising partners...",
            )

            persona_start = time.time()
            LOGGER.info("[Job %s] STEP 1/5: Starting persona generation...", job_id)
            persona, localized_persona = await generate_partner_persona(self._llm, preferences)
            persona_elapsed = time.time() - persona_start
            LOGGER.info(
                "[Job %s] STEP 1/5: ✓ Persona generated in %.2fs (name=%s, age=%s, gender=%s)",
                job_id,
                persona_elapsed,
                persona.name,
                persona.age,
                persona.gender,
            )
            preview = PersonaPreview(
                name=persona.name,
                summary=persona.summary,
                summary_translation=localized_persona.summary if localized_persona else None,
                persona_age=str(persona.age),
                persona_gender=persona.gender,
                persona_occupation=persona.occupation,
                persona_occupation_translation=localized_persona.occupation if localized_persona else None,
                persona_city=persona.city,
                persona_city_translation=localized_persona.city if localized_persona else None,
                persona_country=persona.country,
                persona_country_translation=localized_persona.country if localized_persona else None,
                persona_background=persona.background,
                persona_background_translation=localized_persona.background if localized_persona else None,
                persona_interests=list(persona.interests),
                persona_interests_translation=(
                    list(localized_persona.interests) if localized_persona and localized_persona.interests else []
                ),
            )
            await self._update_job(
                job_id,
                persona_preview=preview,
                steps_add=["persona"],
                message=f"{persona.name} is writing a short intro...",
            )

            prompt_text = persona.avatar_prompt_text
            avatar_task = self._start_avatar_task(prompt_text)
            if avatar_task:
                LOGGER.info("[Job %s] STEP 2/5: Avatar generation started in background", job_id)

            await self._update_job(
                job_id,
                status=PartnerGenerationJobStatus.SELECTING_VOICE,
                message="They're practicing how they'll sound with you...",
            )

            voice_start = time.time()
            LOGGER.info("[Job %s] STEP 3/5: Starting voice selection...", job_id)
            try:
                voice_id = await select_voice_for_persona(
                    self._llm,
                    persona,
                    learning_lang=preferences.learning_lang,
                )
                voice_elapsed = time.time() - voice_start
                LOGGER.info(
                    "[Job %s] STEP 3/5: ✓ Voice selected in %.2fs (voice_id=%s)",
                    job_id,
                    voice_elapsed,
                    voice_id,
                )
            except VoiceSelectionError as exc:
                LOGGER.error(
                    "[Job %s] STEP 3/5: ✗ Voice selection failed after %.2fs: %s",
                    job_id,
                    time.time() - voice_start,
                    exc,
                )
                await self._fail_job(job_id, f"Voice selection failed: {exc}")
                if avatar_task:
                    avatar_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await avatar_task
                return
            await self._update_job(job_id, voice_id=voice_id, steps_add=["voice"])

            await self._update_job(
                job_id,
                status=PartnerGenerationJobStatus.SAVING_PARTNER,
                message="They're polishing their profile details...",
            )

            used_roleplay_partners = await count_roleplay_partners(self._database, user_id=user_id)
            limit_state = partner_limit_status(self._settings, billing_payload, used=used_roleplay_partners)
            if limit_state.blocked:
                limit_value = limit_state.limit or getattr(self._settings, "free_tier_roleplay_partner_limit", 3)
                LOGGER.info(
                    "[Job %s] Aborting partner save: limit reached (limit=%s, used=%s)",
                    job_id,
                    limit_value,
                    used_roleplay_partners,
                )
                await self._fail_job(
                    job_id,
                    f"Free accounts can create up to {limit_value} AI partners. Delete one or upgrade for more.",
                )
                if avatar_task:
                    avatar_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await avatar_task
                return

            partner_save_start = time.time()
            LOGGER.info("[Job %s] STEP 4/5: Saving partner to database...", job_id)
            partner = await create_partner(
                self._database,
                user_id,
                name=persona.name,
                description=persona.summary,
                description_translation=localized_persona.summary if localized_persona else None,
                learning_lang=preferences.native_lang,  # Partner learns user's native language
                native_lang=preferences.learning_lang,  # Partner's native is user's learning language
                avatar_url=None,
                voice_id=voice_id,
                persona_age=str(persona.age),
                persona_gender=persona.gender,
                persona_occupation=persona.occupation,
                persona_occupation_translation=localized_persona.occupation if localized_persona else None,
                persona_city=persona.city,
                persona_city_translation=localized_persona.city if localized_persona else None,
                persona_country=persona.country,
                persona_country_translation=localized_persona.country if localized_persona else None,
                persona_relationship=preferences.partner_type,
                persona_background=persona.background,
                persona_background_translation=localized_persona.background if localized_persona else None,
                persona_interests=compress_interests(persona.interests),
                persona_interests_translation=(
                    compress_interests(localized_persona.interests)
                    if localized_persona and localized_persona.interests
                    else None
                ),
            )
            partner_save_elapsed = time.time() - partner_save_start
            LOGGER.info(
                "[Job %s] STEP 4/5: ✓ Partner saved in %.2fs (partner_id=%s)",
                job_id,
                partner_save_elapsed,
                getattr(partner, "id", None),
            )
            await self._update_job(
                job_id,
                partner=partner,
                partner_id=getattr(partner, "id", None),
                steps_add=["partner"],
                message="Partner profile ready",
            )

            avatar_bytes: bytes | None = None
            fallback_avatar_url: str | None = None
            if avatar_task:
                await self._update_job(
                    job_id,
                    status=PartnerGenerationJobStatus.GENERATING_AVATAR,
                    message="They're picking their favorite photo...",
                )
                avatar_gen_start = time.time()
                LOGGER.info("[Job %s] STEP 5/5: Waiting for avatar generation to complete...", job_id)
                avatar_bytes = await self._await_avatar_bytes_with_retry(
                    job_id=job_id,
                    prompt_text=prompt_text,
                    task=avatar_task,
                )
                avatar_gen_elapsed = time.time() - avatar_gen_start
                if avatar_bytes:
                    LOGGER.info(
                        "[Job %s] STEP 5/5: ✓ Avatar generated in %.2fs (%d bytes)",
                        job_id,
                        avatar_gen_elapsed,
                        len(avatar_bytes),
                    )
                else:
                    LOGGER.warning(
                        "[Job %s] STEP 5/5: Avatar generation returned no data after %.2fs",
                        job_id,
                        avatar_gen_elapsed,
                    )
                    fallback_avatar_url = choose_fallback_avatar(
                        gender=persona.gender,
                        country=persona.country,
                        age=persona.age,
                    )
            else:
                LOGGER.info("[Job %s] STEP 5/5: Skipping avatar generation (not configured)", job_id)
                fallback_avatar_url = choose_fallback_avatar(
                    gender=persona.gender,
                    country=persona.country,
                    age=persona.age,
                )

            selected_avatar_url: str | None = None
            if avatar_bytes and getattr(partner, "id", None):
                await self._update_job(job_id, message="Posting their new profile photo...")
                upload_start = time.time()
                LOGGER.info("[Job %s] Uploading avatar to blob storage...", job_id)
                avatar_url = await self._upload_generated_avatar(
                    user_id=user_id,
                    partner_id=partner.id,
                    data=avatar_bytes,
                )
                upload_elapsed = time.time() - upload_start
                if avatar_url:
                    LOGGER.info(
                        "[Job %s] ✓ Avatar uploaded in %.2fs (url=%s)",
                        job_id,
                        upload_elapsed,
                        avatar_url[:100] if avatar_url else None,
                    )
                    partner = await update_partner(
                        self._database,
                        partner_id=partner.id,
                        user_id=user_id,
                        avatar_url=avatar_url,
                    )
                    await self._update_job(
                        job_id,
                        partner=partner,
                        steps_add=["avatar"],
                        message="Photo looks great!",
                    )
                    selected_avatar_url = avatar_url
                else:
                    LOGGER.warning("[Job %s] Avatar upload returned no URL after %.2fs", job_id, upload_elapsed)
            if not selected_avatar_url and fallback_avatar_url and getattr(partner, "id", None):
                LOGGER.info("[Job %s] Applying fallback avatar for persona %s", job_id, persona.name)
                partner = await update_partner(
                    self._database,
                    partner_id=partner.id,
                    user_id=user_id,
                    avatar_url=fallback_avatar_url,
                )
                await self._update_job(
                    job_id,
                    partner=partner,
                    steps_add=["avatar"],
                    message="Posted a curated profile photo",
                )

            job_elapsed = time.time() - job_start_time
            LOGGER.info(
                "[Job %s] ✓ Partner generation completed in %.2fs (partner_id=%s, name=%s)",
                job_id,
                job_elapsed,
                getattr(partner, "id", None),
                persona.name,
            )
            await self._update_job(job_id, status=PartnerGenerationJobStatus.COMPLETED, message="Ready to say hi!")
        except Exception as exc:  # pragma: no cover - defensive logging
            job_elapsed = time.time() - job_start_time
            LOGGER.exception("[Job %s] ✗ Partner generation failed after %.2fs: %s", job_id, job_elapsed, exc)
            await self._fail_job(job_id, "We hit a snag while matching you")
            if avatar_task:
                avatar_task.cancel()
                with suppress(asyncio.CancelledError):
                    await avatar_task

    def _start_avatar_task(self, prompt: str | None) -> asyncio.Task[bytes | None] | None:
        api_key = getattr(self._settings, "gemini_api_key", None)
        model = getattr(self._settings, "gemini_image_model", None)
        if not api_key or not model or not prompt:
            return None
        return asyncio.create_task(
            generate_avatar_image_bytes(
                prompt,
                api_key=api_key,
                model=model,
                image_size=getattr(self._settings, "gemini_image_size", None),
            )
        )

    async def _await_avatar_bytes_with_retry(
        self,
        *,
        job_id: str,
        prompt_text: str | None,
        task: asyncio.Task[bytes | None],
    ) -> bytes | None:
        timeout_seconds = getattr(self._settings, "gemini_image_timeout_seconds", 60.0) or 0
        max_attempts = getattr(self._settings, "gemini_image_retry_attempts", 1) or 1
        attempt = 0
        current_task: asyncio.Task[bytes | None] | None = task

        while current_task and attempt < max_attempts:
            attempt += 1
            try:
                if timeout_seconds > 0:
                    return await asyncio.wait_for(current_task, timeout=timeout_seconds)
                return await current_task
            except asyncio.TimeoutError:
                LOGGER.warning(
                    "[Job %s] Avatar generation attempt %d/%d timed out after %.0fs",
                    job_id,
                    attempt,
                    max_attempts,
                    timeout_seconds,
                )
                current_task.cancel()
                with suppress(asyncio.CancelledError):
                    await current_task
                if attempt >= max_attempts:
                    break
                await self._update_job(
                    job_id,
                    message="Photo generation is taking longer than expected, trying again...",
                )
                current_task = self._start_avatar_task(prompt_text)
                if current_task is None:
                    LOGGER.warning(
                        "[Job %s] Unable to retry avatar generation - missing prompt or Gemini config",
                        job_id,
                    )
                    break
            except Exception as exc:  # pragma: no cover - best effort logging
                LOGGER.warning(
                    "[Job %s] Avatar generation attempt %d/%d failed: %s",
                    job_id,
                    attempt,
                    max_attempts,
                    exc,
                )
                break

        return None

    async def _upload_generated_avatar(self, *, user_id: str, partner_id: str, data: bytes) -> str | None:
        connection_string = getattr(self._settings, "azure_blob_connection_string", None)
        container = getattr(self._settings, "azure_blob_container", None)
        if not connection_string or not container:
            LOGGER.debug("Azure Blob Storage not configured; skipping avatar upload")
            return None

        try:
            uploader = AzureBlobUploader(
                connection_string=connection_string,
                container=container,
                public_base_url=getattr(self._settings, "azure_blob_public_base_url", None),
                api_version=getattr(self._settings, "azure_blob_api_version", None),
                public_access=getattr(self._settings, "azure_blob_public_access", None),
                require_signed_urls=getattr(self._settings, "azure_blob_sign_urls", None),
                signed_url_ttl_seconds=getattr(self._settings, "azure_blob_signed_url_ttl_seconds", None),
            )
        except Exception as exc:  # pragma: no cover - Azure client construction failure
            LOGGER.warning("Failed to initialize Azure uploader: %s", exc)
            return None

        blob_name = build_partner_avatar_blob_name(user_id, partner_id, ".png")
        try:
            return await asyncio.to_thread(
                uploader.upload_bytes,
                data,
                blob_name=blob_name,
                content_type="image/png",
            )
        except Exception as exc:  # pragma: no cover - azure SDK failure
            LOGGER.warning("Failed to upload generated avatar: %s", exc)
            return None

    async def _update_job(
        self,
        job_id: str,
        *,
        status: PartnerGenerationJobStatus | None = None,
        message: str | None = None,
        persona_preview: PersonaPreview | None = None,
        partner: Any | None = None,
        partner_id: str | None = None,
        voice_id: str | None = None,
        error: str | None = None,
        steps_add: Sequence[PartnerGenerationStep] | None = None,
    ) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if status:
                job.status = status
            if message is not None:
                job.message = message
            if persona_preview:
                job.persona_preview = persona_preview
            if partner is not None:
                job.partner = partner
            if partner_id is not None:
                job.partner_id = partner_id
            if voice_id is not None:
                job.voice_id = voice_id
            if error is not None:
                job.error = error
            if steps_add:
                for step in steps_add:
                    if step not in job.steps_completed:
                        job.steps_completed.append(step)
            job.updated_at = _utcnow()
            snapshot = job.snapshot()
        await self._persist_job_snapshot(snapshot)

    async def _persist_job_snapshot(self, job: PartnerGenerationJob) -> None:
        preview_dict = asdict(job.persona_preview) if job.persona_preview else None
        status_value = job.status.value if isinstance(job.status, PartnerGenerationJobStatus) else str(job.status)
        try:
            await upsert_partner_generation_job_record(
                self._database,
                job_id=job.id,
                user_id=job.user_id,
                status=status_value,
                message=job.message,
                steps_completed=list(job.steps_completed),
                persona_preview=preview_dict,
                partner_id=job.partner_id,
                voice_id=job.voice_id,
                error=job.error,
            )
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.warning("Failed to persist partner generation job %s: %s", job.id, exc)

    async def _fail_job(self, job_id: str, error_message: str) -> None:
        await self._update_job(
            job_id,
            status=PartnerGenerationJobStatus.FAILED,
            message="Couldn't find the right match",
            error=error_message,
        )

    def _prune_locked(self) -> None:
        cutoff = _utcnow() - self._retention
        for job_id, job in list(self._jobs.items()):
            if job.status in {PartnerGenerationJobStatus.COMPLETED, PartnerGenerationJobStatus.FAILED}:
                if job.updated_at < cutoff:
                    task = job.task
                    if task:
                        task.cancel()
                    self._jobs.pop(job_id, None)

    @staticmethod
    def _log_task_result(job_id: str, task: asyncio.Task) -> None:
        with suppress(asyncio.CancelledError):
            try:
                task.result()
            except Exception:  # pragma: no cover - defensive logging
                LOGGER.exception("Partner generation job %s raised unhandled exception", job_id)
