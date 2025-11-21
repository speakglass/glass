"""High-level helpers for account persistence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
import uuid
import secrets
import re

from sqlalchemy import select, delete, or_, func
from sqlalchemy.orm import selectinload

from ..auth.jwt import AuthenticatedUser
from .db import (
    AccountConversation,
    AccountUser,
    ConversationPartner,
    ConversationMessage,
    ConversationEvaluation,
    MessageFeedback,
    PasswordResetToken,
    PersistenceDatabase,
)


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_role(value: Any) -> str:
    role = str(value or "partner").strip().lower()
    if role not in {"user", "partner", "assistant"}:
        return "partner"
    return role


def _normalize_lang_code(value: Any, *, fallback: str | None = None) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip().lower()
    if fallback:
        return fallback.lower()
    return "unknown"


def _extract_translation(value: Any) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    if isinstance(value, str):
        cleaned = value.strip()
        return (cleaned or None), None
    if isinstance(value, dict):
        text = value.get("text") or value.get("translation") or value.get("target_text") or value.get("value")
        lang = value.get("language") or value.get("lang_code")
        cleaned = _clean_text(text)
        if not cleaned:
            return None, None
        lang_code = lang.strip().lower() if isinstance(lang, str) and lang.strip() else None
        return cleaned, lang_code
    return None, None


def _build_conversation_messages(
    messages: list[dict[str, Any]] | None,
    *,
    conversation_id: str,
    user_id: str,
    learning_lang: str | None,
    native_lang: str | None,
) -> tuple[list[ConversationMessage], dict[str, ConversationMessage]]:
    if not messages:
        return [], {}

    results: list[ConversationMessage] = []
    utterance_map: dict[str, ConversationMessage] = {}
    for seq, raw in enumerate(messages, start=1):
        if not isinstance(raw, dict):
            continue
        text = _clean_text(raw.get("text"))
        if not text:
            continue
        role = _normalize_role(raw.get("role"))
        lang = raw.get("language") or raw.get("lang") or raw.get("lang_code")
        fallback_lang = native_lang if role == "user" else learning_lang
        lang_code = _normalize_lang_code(lang, fallback=fallback_lang)
        translation_text, translation_lang_code = _extract_translation(raw.get("translation"))
        partner_id_value = raw.get("partner_id")
        partner_id: str | None = None
        if isinstance(partner_id_value, str):
            cleaned_partner = partner_id_value.strip()
            if cleaned_partner:
                partner_id = cleaned_partner
        if partner_id and role == "user":
            partner_id = None

        utterance_id_value = raw.get("utterance_id")
        utterance_id: str | None = None
        if isinstance(utterance_id_value, str):
            cleaned = utterance_id_value.strip()
            utterance_id = cleaned or None

        message = ConversationMessage(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
            partner_id=partner_id,
            utterance_id=utterance_id,
            text=text,
            lang_code=lang_code,
            translation_text=translation_text,
            translation_lang_code=translation_lang_code,
            seq=seq,
        )
        results.append(message)
        if utterance_id:
            if role == "user":
                # Map user utterances so we can attach feedback to the learner's text.
                utterance_map[utterance_id] = message
            elif utterance_id not in utterance_map:
                utterance_map[utterance_id] = message
    return results, utterance_map


def _build_message_feedback_entries(
    feedback_items: list[dict[str, Any]] | None,
    *,
    conversation_id: str,
    user_id: str,
    utterance_map: dict[str, ConversationMessage],
) -> list[MessageFeedback]:
    """Convert assistant feedback payloads into MessageFeedback rows."""
    if not feedback_items:
        return []

    entries: list[MessageFeedback] = []
    seen: set[tuple[str, str | None, str | None]] = set()
    for raw in feedback_items:
        if not isinstance(raw, dict):
            continue
        utterance_id = _clean_text(raw.get("utterance_id"))
        if not utterance_id:
            continue
        message = utterance_map.get(utterance_id)
        if not message or message.id is None:
            continue
        suggestion_raw = raw.get("suggestion")
        suggestion = suggestion_raw if isinstance(suggestion_raw, dict) else None
        explanation = _clean_text(suggestion.get("reason_native") if suggestion else None)
        if not explanation:
            explanation = _clean_text(raw.get("reason_native"))
        if not explanation:
            explanation = _clean_text(raw.get("text"))
        target_text = _clean_text(suggestion.get("target_text")) if suggestion else None
        dedupe_key = (utterance_id, explanation, target_text)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        feedback_type = _clean_text((suggestion.get("error_type") if suggestion else None) or raw.get("feedback_type"))
        severity = _clean_text((suggestion.get("severity") if suggestion else None) or raw.get("severity"))
        entry = MessageFeedback(
            conversation_id=conversation_id,
            message_id=message.id,
            user_id=user_id,
            feedback_type=(feedback_type or "general").lower(),
            severity=(severity or "info").lower(),
            original_text=message.text,
            suggested_text=target_text,
            explanation=explanation or "Feedback",
            span_start=None,
            span_end=None,
            is_overall=False,
        )
        entries.append(entry)
    return entries


_UNSET = object()


DEFAULT_PARTNERS: list[dict[str, Any]] = [
    {
        "slug": "en_emma",
        "learning_lang": "en",
        "native_lang": "en",
        "name": "Emma",
        "description": "London marketer who swaps idioms over coffee chats",
        "description_i18n": {
            "en": "London marketer who swaps idioms over coffee chats",
            "ko": "런던 마케터. 커피 한잔하며 관용구 이야기 나누기 좋아함",
            "ja": "ロンドンのマーケター。コーヒーを飲みながら慣用句を交換するのが好き",
            "es": "Marketera de Londres que intercambia modismos tomando café",
            "fr": "Marketeur londonien qui échange des expressions autour d'un café",
        },
        "avatar_asset": "emma.png",
        "voice_id": "cgSgspJ2msm6clMCkdW9",
    },
    {
        "slug": "en_alex",
        "learning_lang": "en",
        "native_lang": "en",
        "name": "Alex",
        "description": "New York product lead who loves travel podcasts",
        "description_i18n": {
            "en": "New York product lead who loves travel podcasts",
            "ko": "뉴욕 프로덕트 리드. 여행 팟캐스트 애청자",
            "ja": "ニューヨークのプロダクトリード。旅行ポッドキャストが大好き",
            "es": "Product lead de Nueva York amante de los podcasts de viajes",
            "fr": "Chef de produit new-yorkais passionné de podcasts de voyage",
        },
        "avatar_asset": "alex.png",
        "voice_id": "IKne3meq5aSn9XLyUdCD",
    },
    {
        "slug": "ko_jiwoo",
        "learning_lang": "ko",
        "native_lang": "ko",
        "name": "Jiwoo",
        "description": "Busan travel vlogger sharing food spots and K-drama gossip",
        "description_i18n": {
            "en": "Busan travel vlogger sharing food spots and K-drama gossip",
            "ko": "부산 여행 브이로거. 맛집과 K-드라마 수다 공유",
            "ja": "釜山の旅行ブロガー。グルメスポットとK-ドラマのゴシップを共有",
            "es": "Vlogger de viajes de Busan que comparte lugares de comida y chismes de K-dramas",
            "fr": "Vloggeuse de voyage de Busan partageant restos et potins K-drama",
        },
        "avatar_asset": "jiwoo.png",
        "voice_id": "8jHHF8rMqMlg8if2mOUe",
    },
    {
        "slug": "ko_minjun",
        "learning_lang": "ko",
        "native_lang": "ko",
        "name": "Minjun",
        "description": "Seoul software engineer comparing K-pop drops",
        "description_i18n": {
            "en": "Seoul software engineer comparing K-pop drops",
            "ko": "서울 소프트웨어 엔지니어. K-pop 신곡 비교하는 걸 좋아함",
            "ja": "ソウルのソフトウェアエンジニア。K-popの新曲を比較するのが好き",
            "es": "Ingeniero de software de Seúl comparando lanzamientos de K-pop",
            "fr": "Ingénieur logiciel séoulite qui compare les sorties K-pop",
        },
        "avatar_asset": "minjun.png",
        "voice_id": "UgBBYS2sOqTuMpoF3BR0",
    },
    {
        "slug": "ja_yui",
        "learning_lang": "ja",
        "native_lang": "ja",
        "name": "Yui",
        "description": "Tokyo cafe owner chatting anime and study tips",
        "description_i18n": {
            "en": "Tokyo cafe owner chatting anime and study tips",
            "ko": "도쿄 카페 주인. 애니메이션과 공부 팁 이야기하는 걸 좋아함",
            "ja": "東京のカフェオーナー。アニメと勉強のコツについておしゃべり",
            "es": "Dueña de café en Tokio que charla sobre anime y consejos de estudio",
            "fr": "Propriétaire de café tokyoïte discutant anime et astuces d'étude",
        },
        "avatar_asset": "yui.png",
        "voice_id": "fUjY9K2nAIwlALOwSiwc",
    },
    {
        "slug": "ja_haruto",
        "learning_lang": "ja",
        "native_lang": "ja",
        "name": "Haruto",
        "description": "Osaka game developer into live music and baseball",
        "description_i18n": {
            "en": "Osaka game developer into live music and baseball",
            "ko": "오사카 게임 개발자. 라이브 음악과 야구 팬",
            "ja": "大阪のゲーム開発者。ライブ音楽と野球が好き",
            "es": "Desarrollador de juegos de Osaka aficionado a la música en vivo y el béisbol",
            "fr": "Développeur de jeux d'Osaka passionné de concerts et de baseball",
        },
        "avatar_asset": "haruto.png",
        "voice_id": "3JDquces8E8bkmvbh6Bc",
    },
    {
        "slug": "es_camila",
        "learning_lang": "es",
        "native_lang": "es",
        "name": "Camila",
        "description": "Mexico City DJ sharing reggaeton drops",
        "description_i18n": {
            "en": "Mexico City DJ sharing reggaeton drops",
            "ko": "멕시코시티 DJ. 레게톤 신곡 공유하는 걸 좋아함",
            "ja": "メキシコシティのDJ。レゲトンの新曲をシェア",
            "es": "DJ de Ciudad de México compartiendo lanzamientos de reggaetón",
            "fr": "DJ de Mexico City partageant des sorties reggaeton",
        },
        "avatar_asset": "camila.png",
        "voice_id": "qHkrJuifPpn95wK3rm2A",
    },
    {
        "slug": "es_diego",
        "learning_lang": "es",
        "native_lang": "es",
        "name": "Diego",
        "description": "Madrid sports journalist debating La Liga",
        "description_i18n": {
            "en": "Madrid sports journalist debating La Liga",
            "ko": "마드리드 스포츠 기자. 라리가 토론 좋아함",
            "ja": "マドリードのスポーツジャーナリスト。ラリーガについて議論",
            "es": "Periodista deportivo de Madrid debatiendo sobre La Liga",
            "fr": "Journaliste sportif madrilène débattant de La Liga",
        },
        "avatar_asset": "diego.png",
        "voice_id": "94zOad0g7T7K4oa7zhDq",
    },
    {
        "slug": "fr_claire",
        "learning_lang": "fr",
        "native_lang": "fr",
        "name": "Claire",
        "description": "Paris strategist mixing pastry tips with work talk",
        "description_i18n": {
            "en": "Paris strategist mixing pastry tips with work talk",
            "ko": "파리 전략가. 페이스트리 팁과 업무 이야기를 섞어서 함",
            "ja": "パリのストラテジスト。パティスリーのコツと仕事の話を混ぜる",
            "es": "Estratega parisina mezclando consejos de repostería con charlas de trabajo",
            "fr": "Stratège parisienne mêlant conseils pâtisserie et discussions pro",
        },
        "avatar_asset": "claire.png",
        "voice_id": "F1toM6PcP54s45kOOAyV",
    },
    {
        "slug": "fr_luc",
        "learning_lang": "fr",
        "native_lang": "fr",
        "name": "Luc",
        "description": "Lyon designer into cycling tours and indie cinema",
        "description_i18n": {
            "en": "Lyon designer into cycling tours and indie cinema",
            "ko": "리옹 디자이너. 사이클 투어와 인디 영화 팬",
            "ja": "リヨンのデザイナー。サイクリングツアーとインディ映画が好き",
            "es": "Diseñador de Lyon aficionado a los tours en bicicleta y el cine indie",
            "fr": "Designer lyonnais passionné de cyclotourisme et cinéma indépendant",
        },
        "avatar_asset": "luc.png",
        "voice_id": "93nuHbke4dTER9x2pDwE",
    },
]


def _build_avatar_url(asset: str | None, explicit: str | None = None) -> str | None:
    if explicit:
        return explicit
    if asset:
        return f"/partners/{asset}"
    return None


def _build_template_metadata(entry: dict[str, Any]) -> dict[str, Any] | None:
    metadata = dict(entry.get("metadata") or {})
    avatar_asset = entry.get("avatar_asset")
    if avatar_asset:
        metadata.setdefault("avatar_asset", avatar_asset)
    metadata.setdefault("template_slug", entry["slug"])
    metadata.setdefault("type", "roleplay")
    # Include i18n descriptions in metadata for cloning
    description_i18n = entry.get("description_i18n")
    if description_i18n:
        metadata["description_i18n"] = description_i18n
    return metadata or None


def _merge_metadata(existing: dict[str, Any] | None, new_meta: dict[str, Any] | None) -> dict[str, Any] | None:
    if not new_meta:
        return existing
    merged = dict(existing or {})
    merged.update(new_meta)
    return merged


def _slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[-\s]+", "-", value)
    return value.strip("-")


async def _generate_unique_slug(session, name: str) -> str:
    base = _slugify(name) or "partner"
    slug = base
    suffix = 2
    while True:
        exists = await session.scalar(select(ConversationPartner.id).where(ConversationPartner.slug == slug))
        if not exists:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


async def ensure_default_partners(db: PersistenceDatabase) -> None:
    """Seed default partners for each learning language (idempotent)."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        updated = False
        for data in DEFAULT_PARTNERS:
            existing = await session.scalar(select(ConversationPartner).where(ConversationPartner.slug == data["slug"]))
            avatar_url = _build_avatar_url(data.get("avatar_asset"), data.get("avatar_url"))
            metadata = _build_template_metadata(data)
            desired_kind = data.get("kind") or ("live_call" if not data.get("voice_id") else "roleplay")
            if existing:
                changed = False
                for field in ("name", "description", "avatar_url", "learning_lang", "native_lang", "voice_id"):
                    if field == "avatar_url":
                        new_value = avatar_url
                    else:
                        new_value = data.get(field)
                    if getattr(existing, field) != new_value:
                        setattr(existing, field, new_value)
                        changed = True
                if existing.kind != desired_kind:
                    existing.kind = desired_kind
                    changed = True
                if not existing.is_system:
                    existing.is_system = True
                    changed = True
                if not existing.is_active:
                    existing.is_active = True
                    changed = True
                if metadata and existing.extra_metadata != metadata:
                    existing.extra_metadata = metadata
                    changed = True
                if changed:
                    session.add(existing)
                    updated = True
            else:
                partner = ConversationPartner(
                    slug=data["slug"],
                    learning_lang=data.get("learning_lang"),
                    native_lang=data.get("native_lang"),
                    name=data["name"],
                    description=data.get("description"),
                    avatar_url=avatar_url,
                    voice_id=data.get("voice_id"),
                    kind=desired_kind,
                    extra_metadata=metadata,
                    is_system=True,
                    is_active=True,
                )
                session.add(partner)
                updated = True
        if updated:
            await session.commit()


async def ensure_user_partner_templates(db: PersistenceDatabase, user_id: str) -> None:
    """Ensure user has personalized copies of every system partner template."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user_partners_result = await session.scalars(
            select(ConversationPartner).where(
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        user_partners = list(user_partners_result)
        existing_template_slugs: set[str] = set()
        for partner in user_partners:
            meta = partner.extra_metadata or {}
            if isinstance(meta, dict):
                template_slug = meta.get("template_slug")
                if template_slug:
                    existing_template_slugs.add(template_slug)

        system_partners_result = await session.scalars(
            select(ConversationPartner)
            .where(
                ConversationPartner.is_system.is_(True),
                ConversationPartner.is_active.is_(True),
            )
            .order_by(ConversationPartner.name.asc())
        )
        system_partners = list(system_partners_result)
        created = False
        for template in system_partners:
            template_slug = template.slug
            if template_slug in existing_template_slugs:
                continue
            slug = await _generate_unique_slug(session, template.name)
            clone_metadata = dict(template.extra_metadata or {})
            clone_metadata["template_slug"] = template_slug

            # Keep original description - will be localized dynamically in list_partners
            clone = ConversationPartner(
                user_id=user_id,
                slug=slug,
                learning_lang=template.learning_lang,
                native_lang=template.native_lang,
                name=template.name,
                description=template.description,
                avatar_url=template.avatar_url,
                voice_id=template.voice_id,
                kind=template.kind,
                extra_metadata=clone_metadata or None,
                is_system=False,
                is_active=True,
            )
            session.add(clone)
            created = True
        if created:
            await session.commit()


async def list_partners(
    db: PersistenceDatabase,
    user_id: str,
    *,
    learning_lang: str | None = None,
) -> list[ConversationPartner]:
    """List available partners (system defaults + user-custom)."""
    await ensure_user_partner_templates(db, user_id)
    async_session_factory = db.session()
    async with async_session_factory() as session:
        # Get user's current native language preference
        user = await session.scalar(select(AccountUser).where(AccountUser.id == user_id))
        user_native_lang = user.native_lang if user else None

        stmt = select(ConversationPartner).where(
            ConversationPartner.is_active.is_(True),
            ConversationPartner.user_id == user_id,
        )
        if learning_lang:
            stmt = stmt.where(ConversationPartner.learning_lang == learning_lang)
        stmt = stmt.order_by(
            ConversationPartner.user_id.isnot(None),
            ConversationPartner.name.asc(),
        )
        result = await session.scalars(stmt)
        partners = list(result.all())

        # Localize descriptions based on user's current native language
        if user_native_lang:
            for partner in partners:
                meta = partner.extra_metadata or {}
                if isinstance(meta, dict):
                    description_i18n = meta.get("description_i18n")
                    if isinstance(description_i18n, dict):
                        # Use localized description if available, fallback to original
                        localized = description_i18n.get(user_native_lang)
                        if localized:
                            partner.description = localized

        return partners


async def update_partner_details(
    db: PersistenceDatabase,
    partner_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> ConversationPartner | None:
    """Update selected partner fields without enforcing API permissions."""
    if not any([name, description, extra_metadata]):
        return None
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.get(ConversationPartner, partner_id)
        if not partner:
            return None
        changed = False
        if name and name.strip() and name != partner.name:
            partner.name = name.strip()
            changed = True
        if description is not None and description != partner.description:
            partner.description = description
            changed = True
        if extra_metadata is not None:
            merged = dict(partner.extra_metadata or {})
            merged.update(extra_metadata)
            if merged != (partner.extra_metadata or {}):
                partner.extra_metadata = merged
                changed = True
        if not changed:
            return partner
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def reassign_conversation_partner(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
    partner_id: str,
) -> tuple[AccountConversation, ConversationPartner, str | None] | tuple[None, None, None]:
    """Assign an existing partner to a saved conversation."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        convo = await session.scalar(
            select(AccountConversation).where(
                AccountConversation.id == conversation_id,
                AccountConversation.user_id == user_id,
            )
        )
        if convo is None:
            return None, None, None

        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.is_active.is_(True),
                or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None)),
            )
        )
        if partner is None:
            raise ValueError("Partner not found or unavailable")

        old_partner_id = convo.partner_id
        normalized_old = (old_partner_id or "").lower()
        normalized_new = partner_id.lower()

        messages_result = await session.scalars(
            select(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id)
        )
        for message in messages_result:
            if message.role == "partner":
                message.partner_id = partner.id

        convo.partner_id = partner.id

        session.add(convo)
        await session.commit()
        await session.refresh(convo)
        return convo, partner, old_partner_id


async def get_partner_by_id(
    db: PersistenceDatabase,
    partner_id: str,
    *,
    user_id: str | None = None,
) -> ConversationPartner | None:
    """Fetch a partner ensuring the requesting user has access."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(ConversationPartner).where(
            ConversationPartner.id == partner_id,
            ConversationPartner.is_active.is_(True),
        )
        if user_id is not None:
            stmt = stmt.where(or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None)))
        return await session.scalar(stmt)


async def create_partner(
    db: PersistenceDatabase,
    user_id: str,
    *,
    name: str,
    description: str | None = None,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    avatar_url: str | None = None,
    voice_id: str | None = None,
) -> ConversationPartner:
    """Create a custom partner for a user."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        slug = await _generate_unique_slug(session, name)
        partner_kind = "live_call" if not voice_id else "roleplay"
        partner = ConversationPartner(
            user_id=user_id,
            slug=slug,
            learning_lang=learning_lang,
            native_lang=native_lang,
            name=name,
            description=description,
            avatar_url=avatar_url,
            voice_id=voice_id,
            kind=partner_kind,
            is_system=False,
            is_active=True,
        )
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def update_partner(
    db: PersistenceDatabase,
    partner_id: str,
    user_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    avatar_url: str | None = None,
    voice_id: str | None = None,
) -> ConversationPartner:
    """Update a partner owned by the user."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        if not partner:
            raise ValueError("Partner not found")
        if name:
            partner.name = name
        if description is not None:
            partner.description = description
        if learning_lang is not None:
            partner.learning_lang = learning_lang
        if native_lang is not None:
            partner.native_lang = native_lang
        if avatar_url is not None:
            partner.avatar_url = avatar_url
        if voice_id is not None:
            partner.voice_id = voice_id
        partner.kind = "live_call" if not partner.voice_id else "roleplay"
        session.add(partner)
        await session.commit()
        await session.refresh(partner)
        return partner


async def delete_partner(
    db: PersistenceDatabase,
    partner_id: str,
    user_id: str,
) -> None:
    """Soft-delete a partner."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        partner = await session.scalar(
            select(ConversationPartner).where(
                ConversationPartner.id == partner_id,
                ConversationPartner.user_id == user_id,
                ConversationPartner.is_active.is_(True),
            )
        )
        if not partner:
            raise ValueError("Partner not found")
        partner.is_active = False
        session.add(partner)
        await session.commit()


async def ensure_user(
    db: PersistenceDatabase,
    claims: AuthenticatedUser,
) -> AccountUser:
    """Create or update an account user from the authenticated claims."""
    import logging

    logger = logging.getLogger(__name__)

    try:
        logger.info(f"[ensure_user] Starting for user_id={claims.user_id}, email={claims.email}")
        async_session_factory = db.session()
        async with async_session_factory() as session:
            user = await session.scalar(select(AccountUser).where(AccountUser.id == claims.user_id))
            now = datetime.now(timezone.utc)
            if user:
                logger.info(f"[ensure_user] User exists, updating: {claims.user_id}")
                user.email = claims.email
                user.name = claims.name
                user.avatar_url = claims.avatar_url
                user.last_login_at = now
            else:
                logger.info(f"[ensure_user] Creating new user: {claims.user_id}")
                user = AccountUser(
                    id=claims.user_id,
                    email=claims.email,
                    name=claims.name,
                    avatar_url=claims.avatar_url,
                    last_login_at=now,
                )
                session.add(user)
            await session.commit()
            await session.refresh(user)
            logger.info(f"[ensure_user] Success for user_id={claims.user_id}")
            return user
    except Exception as exc:
        logger.error(f"[ensure_user] Error for user_id={claims.user_id}: {exc}", exc_info=True)
        raise


async def upsert_conversation(
    db: PersistenceDatabase,
    *,
    user_id: str,
    session_id: str,
    title: str | None,
    summary: str | None,
    feedback: str | None,
    scores: dict[str, Any] | None,
    messages: list[dict[str, Any]] | None,
    learning_lang: str | None,
    native_lang: str | None,
    started_at: datetime,
    ended_at: datetime | None,
    duration_seconds: int | None,
    partner_id: str | None = None,
    feedback_items: list[dict[str, Any]] | None = None,
) -> AccountConversation:
    """Persist a conversation summary for later review.

    Note: extracted_info removed - durable memory is tracked separately.
    """
    async_session_factory = db.session()
    async with async_session_factory() as session:
        conversation_id = session_id
        normalized_start = started_at or ended_at or datetime.now(timezone.utc)
        convo = await session.get(AccountConversation, conversation_id)
        if not convo:
            convo = AccountConversation(
                id=conversation_id,
                user_id=user_id,
                title=title,
                summary=summary,
                learning_lang=learning_lang,
                native_lang=native_lang,
                started_at=normalized_start,
                ended_at=ended_at,
                duration_seconds=duration_seconds,
                partner_id=partner_id,
                last_message_at=ended_at,
                message_count=0,
            )
            session.add(convo)
        else:
            if title:
                convo.title = title
            if summary:
                convo.summary = summary
            convo.learning_lang = learning_lang or convo.learning_lang
            convo.native_lang = native_lang or convo.native_lang
            convo.started_at = normalized_start
            convo.ended_at = ended_at
            if duration_seconds is not None:
                convo.duration_seconds = duration_seconds
            if partner_id is not None:
                convo.partner_id = partner_id
        convo.last_message_at = ended_at or convo.last_message_at
        convo.updated_at = datetime.now(timezone.utc)

        await session.flush()

        await session.execute(delete(ConversationMessage).where(ConversationMessage.conversation_id == conversation_id))
        message_models, utterance_map = _build_conversation_messages(
            messages,
            conversation_id=conversation_id,
            user_id=user_id,
            learning_lang=learning_lang,
            native_lang=native_lang,
        )
        if message_models:
            session.add_all(message_models)
            await session.flush()
        convo.message_count = len(message_models)

        await session.execute(delete(MessageFeedback).where(MessageFeedback.conversation_id == conversation_id))
        feedback_models = _build_message_feedback_entries(
            feedback_items,
            conversation_id=conversation_id,
            user_id=user_id,
            utterance_map=utterance_map,
        )
        if feedback_models:
            session.add_all(feedback_models)

        await session.execute(
            delete(ConversationEvaluation).where(ConversationEvaluation.conversation_id == conversation_id)
        )
        if scores or feedback:
            score_payload = scores or {}
            fluency = int(score_payload.get("fluency") or 0)
            accuracy = int(score_payload.get("accuracy") or 0)
            expression = int(score_payload.get("comprehensibility") or score_payload.get("expression") or 0)
            provided_scores = [value for value in [fluency, accuracy, expression] if value is not None]
            overall = int(sum(provided_scores) / len(provided_scores)) if provided_scores else 0
            evaluation = ConversationEvaluation(
                conversation_id=conversation_id,
                user_id=user_id,
                rubric_version="v1",
                fluency_score=fluency,
                accuracy_score=accuracy,
                expression_score=expression,
                overall_score=overall,
                overall_feedback=feedback or "",
                improvement_tips=None,
                evaluation_raw={"scores": scores, "feedback": feedback},
            )
            session.add(evaluation)

        await session.commit()
        await session.refresh(convo)
        return convo


async def list_recent_conversations(
    db: PersistenceDatabase,
    *,
    user_id: str,
    limit: int,
    offset: int = 0,
    search: str | None = None,
) -> list[AccountConversation]:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = (
            select(AccountConversation)
            .options(selectinload(AccountConversation.evaluations))
            .where(AccountConversation.user_id == user_id)
        )

        # Add search filter if provided
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                (AccountConversation.title.ilike(search_pattern)) | (AccountConversation.summary.ilike(search_pattern))
            )

        ordering = func.coalesce(
            AccountConversation.last_message_at,
            AccountConversation.ended_at,
            AccountConversation.started_at,
            AccountConversation.created_at,
        )
        stmt = stmt.order_by(ordering.desc()).offset(offset).limit(limit)
        result = await session.scalars(stmt)
        return list(result.all())


async def get_partners_by_ids(
    db: PersistenceDatabase,
    *,
    user_id: str,
    partner_ids: Iterable[str],
) -> dict[str, ConversationPartner]:
    """Fetch active partners visible to the user for the provided IDs."""
    normalized_ids = {pid for pid in (pid.strip() for pid in partner_ids) if pid}
    if not normalized_ids:
        return {}
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(ConversationPartner).where(
            ConversationPartner.id.in_(normalized_ids),
            ConversationPartner.is_active.is_(True),
            or_(ConversationPartner.user_id == user_id, ConversationPartner.user_id.is_(None)),
        )
        result = await session.scalars(stmt)
        partners = result.all()
    return {partner.id: partner for partner in partners}


async def count_conversations(
    db: PersistenceDatabase,
    *,
    user_id: str,
    search: str | None = None,
) -> int:
    """Count total conversations for pagination."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(func.count()).select_from(AccountConversation).where(AccountConversation.user_id == user_id)

        # Add search filter if provided
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                (AccountConversation.title.ilike(search_pattern)) | (AccountConversation.summary.ilike(search_pattern))
            )

        result = await session.scalar(stmt)
        return result or 0


async def count_total_users(db: PersistenceDatabase) -> int:
    """Return total number of registered account users."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        result = await session.scalar(select(func.count()).select_from(AccountUser))
        return int(result or 0)


async def get_conversation_detail(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
) -> AccountConversation | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = (
            select(AccountConversation)
            .options(
                selectinload(AccountConversation.conversation_messages),
                selectinload(AccountConversation.evaluations),
                selectinload(AccountConversation.feedback_entries).selectinload(MessageFeedback.message),
            )
            .where(
                AccountConversation.user_id == user_id,
                AccountConversation.id == conversation_id,
            )
        )
        return await session.scalar(stmt)


async def delete_conversation(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
) -> bool:
    """Delete a conversation by ID. Returns True if deleted, False if not found."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = delete(AccountConversation).where(
            AccountConversation.user_id == user_id,
            AccountConversation.id == conversation_id,
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0


async def update_conversation_title(
    db: PersistenceDatabase,
    *,
    user_id: str,
    conversation_id: str,
    title: str | None = None,
) -> AccountConversation | None:
    """Update the title of a conversation. Returns the updated conversation or None if not found."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        convo = await session.scalar(
            select(AccountConversation).where(
                AccountConversation.user_id == user_id,
                AccountConversation.id == conversation_id,
            )
        )
        if not convo:
            return None
        if title is not None:
            convo.title = title
        convo.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(convo)
        return convo


async def get_user_by_email(
    db: PersistenceDatabase,
    email: str,
) -> AccountUser | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.email == email)
        return await session.scalar(stmt)


async def create_local_user(
    db: PersistenceDatabase,
    *,
    email: str,
    password_hash: str | None = None,
    name: str | None = None,
    avatar_url: str | None = None,
    email_verified: bool = False,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = AccountUser(
            id=uuid.uuid4().hex,
            email=email,
            name=name,
            password_hash=password_hash,
            avatar_url=avatar_url,
            email_verified=email_verified,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def set_user_password(
    db: PersistenceDatabase,
    *,
    user_id: str,
    password_hash: str,
    name: str | None = None,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.id == user_id))
        if user is None:
            raise ValueError("User not found")
        user.password_hash = password_hash
        if name and not user.name:
            user.name = name
        await session.commit()
        await session.refresh(user)
        return user


async def create_password_reset_token(
    db: PersistenceDatabase,
    *,
    user_id: str,
    expires_in_hours: int = 1,
) -> str:
    """Create a password reset token for a user."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)

    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = PasswordResetToken(
            user_id=user_id,
            token=token,
            expires_at=expires_at,
        )
        session.add(reset_token)
        await session.commit()
        return token


async def verify_reset_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Verify a password reset token and return the user if valid."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = await session.scalar(select(PasswordResetToken).where(PasswordResetToken.token == token))
        if not reset_token:
            return None

        # Check if token is expired or already used
        now = datetime.now(timezone.utc)
        if reset_token.expires_at < now or reset_token.used:
            return None

        # Get the user
        user = await session.scalar(select(AccountUser).where(AccountUser.id == reset_token.user_id))
        return user


async def mark_token_as_used(
    db: PersistenceDatabase,
    token: str,
) -> None:
    """Mark a reset token as used."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        reset_token = await session.scalar(select(PasswordResetToken).where(PasswordResetToken.token == token))
        if reset_token:
            reset_token.used = True
            await session.commit()


async def get_user_by_id(
    db: PersistenceDatabase,
    user_id: str,
) -> AccountUser | None:
    """Get a user by their ID."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.id == user_id)
        return await session.scalar(stmt)


async def get_user_by_stripe_customer_id(
    db: PersistenceDatabase,
    customer_id: str,
) -> AccountUser | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.stripe_customer_id == customer_id)
        return await session.scalar(stmt)


async def get_user_by_stripe_subscription_id(
    db: PersistenceDatabase,
    subscription_id: str,
) -> AccountUser | None:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        stmt = select(AccountUser).where(AccountUser.stripe_subscription_id == subscription_id)
        return await session.scalar(stmt)


async def update_user_subscription(
    db: PersistenceDatabase,
    *,
    user_id: str,
    stripe_customer_id: str | None | object = _UNSET,
    stripe_subscription_id: str | None | object = _UNSET,
    subscription_status: str | None | object = _UNSET,
    subscription_plan: str | None | object = _UNSET,
    subscription_interval: str | None | object = _UNSET,
    current_period_end: datetime | None | object = _UNSET,
    cancel_at: datetime | None | object = _UNSET,
    cancel_at_period_end: bool | None | object = _UNSET,
) -> AccountUser:
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.id == user_id))
        if user is None:
            raise ValueError("User not found")
        if stripe_customer_id is not _UNSET:
            user.stripe_customer_id = stripe_customer_id  # type: ignore[assignment]
        if stripe_subscription_id is not _UNSET:
            user.stripe_subscription_id = stripe_subscription_id  # type: ignore[assignment]
        if subscription_status is not _UNSET:
            user.subscription_status = subscription_status  # type: ignore[assignment]
        if subscription_plan is not _UNSET:
            user.subscription_plan = subscription_plan  # type: ignore[assignment]
        if subscription_interval is not _UNSET:
            user.subscription_interval = subscription_interval  # type: ignore[assignment]
        if current_period_end is not _UNSET:
            user.subscription_current_period_end = current_period_end  # type: ignore[assignment]
        if cancel_at is not _UNSET:
            user.subscription_cancel_at = cancel_at  # type: ignore[assignment]
        if cancel_at_period_end is not _UNSET:
            user.subscription_cancel_at_period_end = cancel_at_period_end  # type: ignore[assignment]
        await session.commit()
        await session.refresh(user)
        return user


async def clear_user_subscription(
    db: PersistenceDatabase,
    *,
    user_id: str,
) -> AccountUser:
    return await update_user_subscription(
        db,
        user_id=user_id,
        stripe_subscription_id=None,
        subscription_status=None,
        subscription_plan=None,
        subscription_interval=None,
        current_period_end=None,
        cancel_at=None,
        cancel_at_period_end=None,
    )


async def mark_onboarding_completed(
    db: PersistenceDatabase,
    user_id: str,
    learning_lang: str | None = None,
    native_lang: str | None = None,
    language_level: str | None = None,
) -> AccountUser:
    """Mark onboarding as completed for a user and save language preferences."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.id == user_id))
        if user is None:
            raise ValueError("User not found")

        # Only set if not already completed
        if user.onboarding_completed_at is None:
            user.onboarding_completed_at = datetime.now(timezone.utc)

        # Save language preferences
        if learning_lang:
            user.learning_lang = learning_lang
        if native_lang:
            user.native_lang = native_lang
        if language_level:
            user.language_level = language_level

        await session.commit()
        await session.refresh(user)
        return user


# ===== Email Verification =====


async def create_verification_token(
    db: PersistenceDatabase,
    user_id: str,
) -> tuple[str, datetime]:
    """Create an email verification token for a user.

    Returns:
        Tuple of (token, expires_at)
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.id == user_id))
        if user is None:
            raise ValueError("User not found")

        user.verification_token = token
        user.verification_token_expires = expires_at

        await session.commit()
        await session.refresh(user)
        return token, expires_at


async def verify_email_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Verify an email verification token and mark email as verified.

    Returns:
        User if token is valid, None otherwise
    """
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.verification_token == token))

        if user is None:
            return None

        # Check if token is expired
        if user.verification_token_expires is None or user.verification_token_expires < datetime.now(timezone.utc):
            return None

        # Mark email as verified and clear token
        user.email_verified = True
        user.verification_token = None
        user.verification_token_expires = None

        await session.commit()
        await session.refresh(user)
        return user


async def get_user_by_verification_token(
    db: PersistenceDatabase,
    token: str,
) -> AccountUser | None:
    """Get a user by their verification token."""
    async_session_factory = db.session()
    async with async_session_factory() as session:
        user = await session.scalar(select(AccountUser).where(AccountUser.verification_token == token))
        return user


# ===== Memory Operations =====
# Memory management is handled by the configured memory adapter (Postgres by default)
# See: src/glass/adapters/memory/postgres.py for relational operations
