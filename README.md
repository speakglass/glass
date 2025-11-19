<img width="1511" height="828" alt="web-app" src="https://github.com/user-attachments/assets/01c8a960-90c1-4b39-81b9-84f6091323a8" />

# Glass

AI that helps you speak any language in the real world.

Glass is your live language coach: speak in the moment with real-time feedback,
sentence suggestions, and pronunciation you can read—even if you can’t read the
script yet. This repo hosts both the FastAPI backend (speech → understanding → suggestions) and the Next.js app that streams microphone/screen audio and renders the real-time UI.

<p>
  <a href="https://discord.gg/GxJwcgnchM">
    <img alt="Discord" src="https://img.shields.io/badge/discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" />
  </a>
  <a href="https://x.com/speakglass">
    <img alt="Follow on X" src="https://img.shields.io/twitter/follow/speakglass?style=social" />
  </a>
  <a href="https://github.com/speakglass/glass/stargazers">
    <img alt="GitHub Stars" src="https://img.shields.io/github/stars/speakglass/glass?style=social" />
  </a>
  <a href="https://github.com/speakglass/glass/fork">
    <img alt="GitHub Forks" src="https://img.shields.io/github/forks/speakglass/glass?style=social" />
  </a>
  <a href="./LICENSE">
    <img alt="License: BSL 1.1 → Apache-2.0" src="https://img.shields.io/badge/License-BSL%201.1%20%E2%86%92%20Apache--2.0-0b7285?style=flat-square" />
  </a>
</p>

## Features

- 🎧 Real-time feedback, sentence suggestions, and pronunciation hints/romanization
- 🔤 Keyword → natural sentence translation with context awareness
- 🗣️ Practice mode with on-device mic + optional AI voice partner
- 🧠 Persistent memory powered by Postgres + Redis that personalizes over time
- 💾 Meeting history, transcripts, and summaries stored in Postgres
- 🌐 Fully localized Next.js 16 app (Lingui PO workflows + dark mode UI)

## Use cases

- 🧑‍💻 Online meetings (Zoom, Meet, Teams) using screen audio capture
- 🌐 Language exchanges and live tutoring sessions
- 🎯 Interview prep, presentations, and impromptu conversation practice

## Memory architecture

At runtime we only persist compact facts in `memory_records`. Each record stores:

| Field | Purpose |
| --- | --- |
| `user_id`, `conversation_id`, `partner_id` | Scope (user-scoped, partner-scoped, or conversation-scoped) |
| `category` | One of fact / preference / skill / context / rule |
| `retention` | short_term / long_term / permanent (with optional expiry) |
| `text`, `summary` | Canonical fact text plus optional headline |
| `keywords`, `entities` | Lightweight search accelerators |
| `importance` | Used to rank facts when building prompts |

The classifier described in `src/glass/adapters/memory/classifier.py` ensures every fact is normalized and deduplicated before insert.

All higher-level operations simply filter this table:

| Operation | Query |
| --- | --- |
| “Tell me about the user” | `SELECT * FROM memory_records WHERE user_id = :user AND partner_id IS NULL ORDER BY importance DESC LIMIT N` |
| “Remind me what this partner likes” | `... WHERE user_id = :user AND partner_id = :partner` |
| “Give me the last session’s commitments” | `... WHERE conversation_id = :conversation ORDER BY updated_at DESC` |

That’s it—no extra persona/feedback tables required. Session history still streams through Redis/Postgres for context, but durable memory lives in one place, making it trivial to reason about and operate.

### Conceptual memory layers

| Layer | Description | Lifetime |
| --- | --- | --- |
| Live context buffer | Deques in `ConversationMemory` + Redis for current session turns. Feeds prompts, never persisted long term. | Seconds–minutes |
| Durable facts (`memory_records`) | Classified facts (fact / preference / skill / context / rule) with retention scoring. Drives personalization queries. | Days–forever (depending on retention) |
| Session metadata (`account_conversations`) | Minimal rows noting session/partner/time for audit + history lists. No transcripts stored here. | Historical reference |

Every feature maps to one of these abstractions, which keeps the mental model simple: capture context in-memory, condense into facts, and jot down which session produced them.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, WebSockets, SQLAlchemy, Redis, Deepgram, OpenAI, ElevenLabs
- **Frontend:** Next.js 16 App Router, React 18, NextAuth, TanStack Query/Table, Lingui, Tailwind tooling
- **Data & infra:** Postgres for history, Redis for usage metering, Docker images for api/web, pnpm-managed frontend
- **Testing & tooling:** Pytest, Next lint, Lingui extraction/compile, Husky + Commitlint

## Setup

**Prerequisites:**

- Docker 24+ and Docker Compose v2

**Quick Start:**

1. Clone the repository
2. Copy environment files and add your API keys:

```bash
cp .env.example .env
cp web/.env.example web/.env
```

3. Edit `.env` with your provider API keys:

   - `GLASS_LLM_PROVIDER` - `openai` (default) or `gemini`
   - `GLASS_OPENAI_API_KEY` - OpenAI API key for LLM (when using OpenAI)
   - `GLASS_GEMINI_API_KEY` - Google AI Studio key for Gemini 2.5 Flash LLM (when using Gemini)
   - `GLASS_ELEVENLABS_API_KEY` - ElevenLabs API key for TTS
   - `GLASS_DEEPGRAM_KEY` - Deepgram API key for ASR
   - `GLASS_AUTH_JWT_SECRET` - Generate with `openssl rand -hex 32`

4. Edit `web/.env` with the same JWT secret:

   - `GLASS_AUTH_JWT_SECRET` - Must match backend
   - `AUTH_SECRET` - Generate with `openssl rand -hex 32`

5. Start the stack:

```bash
docker compose up --build
```

**Access:**

- Web app: http://localhost:3000
- API docs: http://localhost:8000/docs

## Roadmap

| Item                                      | Status     | Notes                        |
| ----------------------------------------- | ---------- | ---------------------------- |
| Real-time feedback & sentence suggestions | ✅ Done    | Streaming via WebSocket      |
| Screen audio capture for meetings         | ✅ Done    | Works with Zoom/Meet/Teams   |
| Persistent memory/personalization         | ✅ Done    | Postgres + Redis memory core |
| Docker/Compose support                    | ✅ Done    | Backend/Web images + compose |
| Desktop app                               | 🚧 Planned | macOS app with full Glass UI |
| Speaker diarization                       | 🚧 Planned | Multi-speaker labeling       |
| Local-hosted model adapters (LLM/ASR/TTS) | 🚧 Planned | Self-hosted runtime          |

## Contributing

Issues and PRs are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards, branching, and commit message requirements. Automated checks (pytest, lint, Lingui) should pass before opening a pull request.

## License

This project is licensed under the Business Source License 1.1 (BSL).

- Hosted use is allowed, but commercial competition is restricted until the Change Date.
- On 2028‑01‑01, the license automatically changes to Apache‑2.0.
- See the full terms in [LICENSE](./LICENSE), including the Non‑Competitive definition and a small‑scale revenue exception.

## Community & contact

- **[GitHub Discussions](https://github.com/speakglass/glass/discussions)**: questions, product feedback, and ideas.
- **[GitHub Issues](https://github.com/speakglass/glass/issues)**: report bugs and propose features.
- **[Discord](https://discord.gg/GxJwcgnchM)**: hang out with the community and share builds.
- **[X (Twitter)](https://x.com/speakglass)**: follow launches and highlights.
