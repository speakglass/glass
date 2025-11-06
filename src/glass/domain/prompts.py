"""LLM prompt presets and formatting utilities."""

from __future__ import annotations

from textwrap import dedent


LLM_PRESETS: dict[str, dict[str, str]] = {
    "progress": {
        "system": dedent(
            """
            You are a concise meeting copilot.
            Respond with action-forward suggestions in 15-24 words.
            Avoid filler, avoid repeating earlier recommendations.
            """
        ).strip(),
    },
    "decision": {
        "system": dedent(
            """
            You help teams converge on decisions.
            Highlight owners, blockers, and next checkpoints in 15-24 words.
            """
        ).strip(),
    },
    "sales": {
        "system": dedent(
            """
            You coach an account executive during a sales call.
            Surface opportunity signals, objections, and next steps in 15-24 words.
            """
        ).strip(),
    },
    "support": {
        "system": dedent(
            """
            You assist a support engineer.
            Offer empathetic, actionable responses staying under 24 words.
            """
        ).strip(),
    },
}


def resolve_prompt(role: str) -> dict[str, str]:
    """Return the prompt preset for the desired role."""
    return LLM_PRESETS.get(role, LLM_PRESETS["progress"])
