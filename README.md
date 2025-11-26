<img src=".github/assets/glass-demo.gif" alt="Glass Demo" width="100%" />

<p align="center"><strong>AI tool for language exchange and real-world practice.</strong></p>

<p align="center"><i>Learn any language by speaking it from day one, not by studying it.</i></p>

<p align="center">
  <sub>🏆 <b>#1 Way To Learn Languages</b> • <i>Probably</i></sub>
</p>

<p align="center">
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

# Glass

Glass gives you real-time feedback and suggestions during live conversations. Talk with AI partners that remember you, or use it in real meetings and language exchanges.

#### Why Glass?

- **Speak from day one** – We'll show you how to say it, start talking immediately
- **Never stuck for words** – Get real-time suggestions when you don't know what to say
- **Use in real conversations** – Works during actual meetings, calls, and live exchanges
- **Learn from every conversation** – Instant corrections and post-call insights
- **Can't find a practice partner?** – Talk to AI partners right now, they remember you

<p align="center">
  <a href="https://app.speakglass.com"><strong>Demo</strong></a> • 
  <a href="https://docs.speakglass.com/"><strong>Documentation</strong></a> • 
  <a href="https://discord.gg/GxJwcgnchM"><strong>Discord</strong></a>
</p>

## Use cases

- 🌐 Language exchange with native speakers or tutors
- 🗣️ Speaking practice for language learning with AI partners
- 🎯 Interview prep and presentation rehearsal

## Project Structure

Glass is a monorepo containing:

```
glass/
├── packages/
│   ├── shared/      # Common code (types, API client, utils)
│   ├── web/         # Next.js web app
│   └── mobile/      # React Native Expo app
└── src/glass/       # Python backend (FastAPI)
```

For mobile app setup, see [SETUP_MOBILE.md](./SETUP_MOBILE.md).

## Setup

**Prerequisites:**

- Docker 24+ and Docker Compose v2

**Quick Start:**

1. Clone the repository
2. Copy environment files and add your API keys:

```bash
cp .env.example .env
cp packages/web/.env.example packages/web/.env
```

3. Edit `.env` with your provider API keys:

   **Required:**

   - `GLASS_OPENAI_API_KEY` - OpenAI API key (required for embeddings)
   - `GLASS_GEMINI_API_KEY` - Google AI Studio key for Gemini 2.5 Flash LLM
   - `GLASS_ELEVENLABS_API_KEY` - ElevenLabs API key for TTS
   - `GLASS_DEEPGRAM_KEY` - Deepgram API key for ASR
   - `GLASS_AUTH_JWT_SECRET` - Generate with `openssl rand -hex 32`
   - `GLASS_DATABASE_URL` - Postgres connection string (default: `postgresql+asyncpg://glass:glass@db:5432/glass`)
   - `GLASS_REDIS_URL` - Redis connection string (default: `redis://redis:6379/0`)

4. Edit `packages/web/.env` with the same JWT secret:

   - `GLASS_AUTH_JWT_SECRET` - Must match backend
   - `AUTH_SECRET` - Generate with `openssl rand -hex 32`

5. Start the stack:

```bash
docker compose up --build
```

**Access:**

- Web app: http://localhost:3000
- API docs: http://localhost:8000/docs

## Tech stack

- **Backend:** Python 3.11+, FastAPI, WebSockets, SQLAlchemy, pgvector, Redis, Deepgram, Gemini (default) with OpenAI fallback, ElevenLabs
- **Web Frontend:** Next.js 16 App Router, React 18, NextAuth, TanStack Query/Table, Lingui, Tailwind tooling
- **Mobile:** React Native, Expo SDK 52, Expo Router, TanStack Query, AsyncStorage
- **Shared:** TypeScript, platform-independent API client, type definitions
- **Data & infra:** Postgres + pgvector for semantic memory, Redis for usage metering, Docker images for api/web, pnpm-managed frontend
- **Testing & tooling:** Pytest, Next lint, Lingui extraction/compile, Husky + Commitlint

## Memory architecture

Glass uses **semantic memory** powered by pgvector to recall context intelligently:

- **Live context**: Current session turns stored in Redis for real-time prompts
- **Semantic facts**: Vector-embedded memories with scope/category/retention stored in Postgres
- **Session metadata**: Historical sessions for audit and history

When you talk, Glass embeds your context, searches by vector similarity, and includes relevant memories in prompts—no complex RAG pipelines needed.

## Roadmap

| Item                                      | Status     | Notes                         |
| ----------------------------------------- | ---------- | ----------------------------- |
| Real-time feedback & sentence suggestions | ✅ Done    | Streaming via WebSocket       |
| Screen audio capture for meetings         | ✅ Done    | Works with Zoom/Meet/Teams    |
| Persistent memory/personalization         | ✅ Done    | Postgres + Redis memory core  |
| Docker/Compose support                    | ✅ Done    | Backend/Web images + compose  |
| pgvector semantic memory search           | ✅ Done    | Vector-based memory retrieval |
| Mobile app (iOS/Android)                  | ✅ Done    | React Native Expo app         |
| Desktop app                               | 🚧 Planned | macOS app with full Glass UI  |
| Speaker diarization                       | 🚧 Planned | Multi-speaker labeling        |
| Local-hosted model adapters (LLM/ASR/TTS) | 🚧 Planned | Self-hosted runtime           |

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
