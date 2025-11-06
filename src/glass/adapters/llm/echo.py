"""Simple echo LLM adapter for local development."""

from __future__ import annotations

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
            return f"[Echo AI Greeting in {target_lang} for {scenario_name}]: Hello! Let's practice {target_lang}!"
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
