"""Simple echo LLM adapter for local development."""

from __future__ import annotations

import random
from typing import Sequence


class EchoLLMAdapter:
    async def suggest(
        self,
        transcript_tail: Sequence[str | dict],
        screen: str | None,
        memory: Sequence[dict],
        tone: str,
        lang: str,
    ) -> dict:
        if not transcript_tail:
            text = "Waiting for input."
        else:
            last_entry = transcript_tail[-1]
            if isinstance(last_entry, dict):
                speaker = last_entry.get("speaker", "unknown")
                tail_text = last_entry.get("text", "")
                text = f"[{speaker}]: {tail_text}"
            else:
                text = str(last_entry)
        
        memory_hint = memory[0]["text"] if memory else ""
        if screen:
            text = f"{text} | Screen: {screen}"
        if memory_hint:
            text = f"{text} | Memory: {memory_hint}"
        return {"text": text.strip(), "tone": tone, "notes": []}

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Echo translation for development."""
        return f"[Translated to {target_lang}]: {text}"

    async def answer(self, transcript_tail: Sequence[str | dict], lang: str, mode: str = "real", target_lang: str | None = None) -> str:
        """Echo answer for development."""
        if not transcript_tail:
            return "No conversation history available."
        last_text = self._get_last_text(transcript_tail)
        if mode == "practice" and target_lang:
            return f"[Echo Answer - Practice]: User's response in {target_lang} to: '{last_text}'"
        return f"[Echo Answer]: Based on '{last_text}', I would suggest..."

    async def follow_up(self, transcript_tail: Sequence[str | dict], lang: str) -> str:
        """Echo follow-up for development."""
        if not transcript_tail:
            return "No conversation history available."
        last_text = self._get_last_text(transcript_tail)
        return f"[Echo Follow-up]: Continuing from '{last_text}', you could say..."

    async def answer_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict:
        """Structured echo for answer suggestions."""
        target = f"(echo) Suggested answer in {target_lang}"
        out: dict = {"target_text": target}
        # Dev adapter: skip pronunciation by default
        return out
    
    async def follow_up_structured(
        self,
        transcript_tail: Sequence[str | dict],
        *,
        target_lang: str,
        native_lang: str,
        pronunciation_mode: str | None = None,
    ) -> dict:
        """Structured echo for follow-up suggestions."""
        target = f"(echo) Follow-up in {target_lang}"
        return {"target_text": target}

    async def feedback(self, user_text: str, lang: str, target_lang: str | None = None, native_lang: str | None = None, mode: str = "real") -> str:
        """Echo feedback for development - sometimes returns NONE."""
        # Simulate conditional feedback: short statements don't need feedback
        if len(user_text.split()) < 3:
            return "NONE"
        if mode == "practice":
            return f"[Echo Feedback - Practice]: 완전한 문장으로 말하는 게 더 좋아요 → {user_text} (with improvements)"
        if target_lang:
            return f"[Echo Feedback]: 예약할 때는 이렇게 말해요 → '{user_text}' in {target_lang}"
        return f"[Echo Feedback]: Your statement '{user_text}' seems clear."
    
    async def should_suggest(
        self,
        transcript_tail: Sequence[str | dict],
        kind: str,
        mode: str = "real",
    ) -> bool:
        """Simple dev gating: mimic previous heuristics so auto-mode works locally."""
        # Pull last text
        last = self._get_last_text(transcript_tail)
        kind = (kind or "").lower()
        if kind == 'answer':
            # Suggest if partner likely asked something or invited a reply
            return ('?' in last) or (mode == 'practice') or (len(last.split()) >= 2)
        # follow_up after user speaks: require substance, but NOT if user asked a question
        if '?' in last:
            return False  # User asked question, they're waiting for answer
        return len(last.split()) >= 3
    
    async def should_feedback(
        self,
        transcript_tail: Sequence[str | dict],
        user_text: str,
        mode: str = "real",
    ) -> bool:
        """Simple feedback gate for development."""
        if not user_text or len(user_text.split()) < 4:
            return False
        if '?' in user_text:
            return False
        return True
    
    async def generate_ai_response(
        self,
        user_text: str,
        scenario: str | None,
        conversation_history: Sequence[dict],
        target_lang: str,
    ) -> str:
        """Echo AI response for development."""
        scenario_name = scenario.split(':')[0] if scenario and ':' in scenario else (scenario or "casual")
        
        # Check if this is initial greeting
        is_initial = len(conversation_history) == 0 or user_text.startswith("[")
        
        if is_initial:
            return self._initial_greeting_for(target_lang, scenario_name)
        else:
            return f"[Echo AI in {target_lang} for {scenario_name}]: Response to '{user_text}'"

    def _get_last_text(self, transcript_tail: Sequence[str | dict]) -> str:
        """Extract last text from transcript."""
        if not transcript_tail:
            return ""
        last_entry = transcript_tail[-1]
        if isinstance(last_entry, dict):
            return last_entry.get("text", "")
        return str(last_entry)

    def _initial_greeting_for(self, target_lang: str, scenario: str) -> str:
        """Produce a simple, scenario-aware greeting in the selected language with light variety."""
        lang = (target_lang or "").strip().lower()
        scen = (scenario or "casual").strip().lower()
        # Normalize a few scenario families
        is_airport = "airport" in scen or "check-in" in scen
        is_restaurant = "restaurant" in scen or "cafe" in scen
        is_interview = "interview" in scen
        is_shopping = "shopping" in scen or "store" in scen
        # Korean
        if "korean" in lang or lang == "ko" or "한국어" in lang:
            options = []
            if is_airport:
                options = ["안녕하세요. 체크인 도와드릴까요?", "안녕하세요. 어디로 가시는 항공편이신가요?"]
            elif is_restaurant:
                options = ["안녕하세요. 무엇을 드릴까요?", "어서 오세요. 주문 도와드릴까요?"]
            elif is_interview:
                options = ["안녕하세요. 와 주셔서 감사합니다. 간단히 자기소개 부탁드려요.", "안녕하세요. 오늘 인터뷰는 편하게 진행할게요. 먼저 자기소개 부탁드립니다."]
            elif is_shopping:
                options = ["안녕하세요. 어떤 상품을 찾고 계세요?", "찾으시는 물건 있으신가요? 제가 도와드릴게요."]
            else:
                options = ["안녕하세요. 무엇을 도와드릴까요?", "안녕하세요. 오늘 어떻게 시작해볼까요?"]
            return random.choice(options)
        # Japanese
        if "japanese" in lang or lang == "ja" or "日本語" in lang:
            options = []
            if is_airport:
                options = ["こんにちは。チェックインの手続きでよろしいですか？", "こんにちは。本日のご搭乗先はどちらですか？"]
            elif is_restaurant:
                options = ["いらっしゃいませ。ご注文はお決まりですか？", "こんにちは。おすすめをご案内しましょうか？"]
            elif is_interview:
                options = ["本日はお越しいただきありがとうございます。まずは自己紹介をお願いします。", "こんにちは。リラックスして進めましょう。最初に自己紹介からお願いします。"]
            elif is_shopping:
                options = ["いらっしゃいませ。何かお探しですか？", "こんにちは。ご希望の品はございますか？"]
            else:
                options = ["こんにちは。今日はどう始めましょうか？", "こんにちは。どのようにお手伝いできますか？"]
            return random.choice(options)
        # Spanish
        if "spanish" in lang or lang == "es" or "español" in lang:
            options = []
            if is_airport:
                options = ["Hola, ¿viene a hacer el check‑in? ¿En qué puedo ayudarle?", "Hola, ¿para qué vuelo se presenta hoy?"]
            elif is_restaurant:
                options = ["Hola, bienvenido/a. ¿Qué le gustaría pedir?", "Hola, ¿quiere que le recomiende algo?"]
            elif is_interview:
                options = ["Hola, gracias por venir. ¿Podría presentarse brevemente?", "Hola, pongámonos cómodos. ¿Puede empezar con una breve presentación?"]
            elif is_shopping:
                options = ["Hola. ¿Busca algo en particular?", "Hola, ¿quiere que le ayude a encontrar algo?"]
            else:
                options = ["Hola. ¿Cómo le puedo ayudar hoy?", "Hola, ¿empezamos con algo sencillo?"]
            return random.choice(options)
        # French
        if "french" in lang or lang == "fr" or "français" in lang:
            options = []
            if is_airport:
                options = ["Bonjour, c’est pour l’enregistrement ? Je peux vous aider ?", "Bonjour, vous voyagez vers quelle destination aujourd’hui ?"]
            elif is_restaurant:
                options = ["Bonjour, bienvenue. Qu’est-ce que vous souhaitez commander ?", "Bonjour, puis-je vous conseiller quelque chose ?"]
            elif is_interview:
                options = ["Bonjour, merci d’être venu. Pourriez-vous vous présenter brièvement ?", "Bonjour, on va y aller tranquillement. Pouvez-vous commencer par une brève présentation ?"]
            elif is_shopping:
                options = ["Bonjour. Cherchez-vous quelque chose en particulier ?", "Bonjour, je peux vous aider à trouver un article ?"]
            else:
                options = ["Bonjour. Comment puis-je vous aider aujourd’hui ?", "Bonjour, on commence par quoi ?"]
            return random.choice(options)
        # Chinese (simplified-neutral)
        if "chinese" in lang or lang in {"zh", "mandarin", "中文", "汉语"}:
            options = []
            if is_airport:
                options = ["您好，需要办理登机手续吗？", "您好，您今天飞往哪里？"]
            elif is_restaurant:
                options = ["您好，想点些什么？", "您好，要不要我给您推荐一下？"]
            elif is_interview:
                options = ["您好，感谢您来参加面试。可以先做个简单的自我介绍吗？", "您好，放轻松就好。先做个自我介绍吧。"]
            elif is_shopping:
                options = ["您好，请问在找什么吗？", "您好，需要我帮您找点什么吗？"]
            else:
                options = ["您好，请问需要我帮忙吗？", "您好，咱们先从哪儿开始好呢？"]
            return random.choice(options)
        # Default (English/other)
        if is_airport:
            options = ["Hello! Are you here to check in today?", "Hi there—what flight are you checking in for?"]
        if is_restaurant:
            options = ["Hi there! What would you like to order?", "Welcome in—want a recommendation to start?"]
        if is_interview:
            options = ["Hello, thanks for coming in. Could you briefly introduce yourself?", "Hey—no rush, could you start with a short intro?"]
        if is_shopping:
            options = ["Hi! Are you looking for something in particular?", "Hi—can I help you find anything?"]
        else:
            options = ["Hi! How can I help you today?", "Hey there—what should we start with?"]
        return random.choice(options)
