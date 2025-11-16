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
- 🧠 Persistent memory backed by Zep that personalizes over time
- 💾 Meeting history, transcripts, and summaries stored in Postgres
- 🌐 Fully localized Next.js 16 app (Lingui PO workflows + dark mode UI)

## Use cases

- 🧑‍💻 Online meetings (Zoom, Meet, Teams) using screen audio capture
- 🌐 Language exchanges and live tutoring sessions
- 🎯 Interview prep, presentations, and impromptu conversation practice

## Tech stack

- **Backend:** Python 3.11+, FastAPI, WebSockets, SQLAlchemy, Redis, Deepgram, OpenAI, ElevenLabs, Zep
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
   - `GLASS_ZEP_API_KEY` - Zep Cloud API key for memory
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
| Persistent memory/personalization         | ✅ Done    | Zep adapter with KG context  |
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
