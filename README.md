<img width="1511" height="828" alt="web-app" src="https://github.com/user-attachments/assets/01c8a960-90c1-4b39-81b9-84f6091323a8" />

# Glass

AI that helps you speak any language in the real world.

Glass is your live language coach: speak in the moment with real-time feedback,
sentence suggestions, and pronunciation you can read—even if you can’t read the
script yet. This repo hosts both the FastAPI backend (speech → understanding → suggestions) and the Next.js app that streams microphone/screen audio and renders the real-time UI.

<p>
  <a href="https://discord.gg/W7RAzUdYaj">
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

## Table of contents

- [Features](#features)
- [Use cases](#use-cases)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Configuration](#configuration)
  - [Environment variables](#environment-variables)
  - [Authentication & meeting history](#authentication--meeting-history)
  - [Providers (recommended)](#providers-recommended)
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Docker quickstart](#docker-quickstart)
  - [Running locally](#running-locally)
- [Testing & quality](#testing--quality)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [License](#license)
- [Community & contact](#community--contact)

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

## Repository layout

```text
.
├── src/glass/            # FastAPI services, domain pipeline, adapters, config
├── web/                  # Next.js 16 app (components, locales, hooks, providers)
├── migrations/           # SQL migrations for persistence tweaks
├── tests/                # Backend pytest suite
├── docker-compose.yml    # Local stack (FastAPI + Next.js + Postgres, optional Redis)
├── Dockerfile            # Backend image (uvicorn + FastAPI)
├── web/Dockerfile        # Frontend image (pnpm + Next dev server)
└── requirements.txt      # Backend dependency lock for Docker/pip installs
```

## Architecture

1. **Browser ↔ Next.js:** The web app captures microphone audio (and optionally system audio) and drives authentication, onboarding, and history views. It communicates with the backend via REST + WebSocket endpoints (`/api/*` + `/ws/*`).
2. **Real-time pipeline:** `src/glass/domain/pipeline.py` orchestrates ASR → memory → LLM. Audio chunks stream into `ASRProcessor`, transcripts flow through `LLMProcessor`, and events fan out over the active WebSocket for UI updates.
3. **Providers & adapters:** ASR/LLM/TTS adapters live under `src/glass/adapters/*` and conform to ports defined in `src/glass/domain/ports.py`, making it straightforward to swap providers or add self-hosted models.
4. **State & persistence:** `AppState` wires together Postgres (user accounts & meeting history via `src/glass/persistence`), optional Redis (usage quotas), and Zep memory (`src/glass/adapters/memory/zep.py`). Uploaded audio and cached artifacts live under `var/uploads`.
5. **API surface:** FastAPI exposes `GET/POST /api/...` routes for auth, accounts, history, and feedback plus `/docs`/`/redoc` for auto-generated documentation. The websocket router (`src/glass/api/websocket.py`) streams pipeline events in both practice and “Real Talk” modes.

## Configuration

### Environment variables

Copy `.env.example` (backend) and `web/.env.example` (frontend) to start.

#### Required backend variables (prefixed with `GLASS_`)

| Variable                   | Purpose                                    | Example                                          |
| -------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `GLASS_OPENAI_API_KEY`     | OpenAI API key for LLM                     | `sk-...`                                         |
| `GLASS_ELEVENLABS_API_KEY` | ElevenLabs API key for TTS                 | `sk-...`                                         |
| `GLASS_DEEPGRAM_KEY`       | Deepgram API key for ASR                   | `dg-...`                                         |
| `GLASS_ZEP_API_KEY`        | Zep Cloud API key for memory               | `z_...`                                          |
| `GLASS_AUTH_JWT_SECRET`    | Shared signing secret (FastAPI ↔ NextAuth) | _generate with `openssl rand -hex 32`_           |
| `GLASS_DATABASE_URL`       | PostgreSQL URL for user accounts & history | `postgresql+asyncpg://glass:glass@db:5432/glass` |

**Email Verification (Resend):**

- `GLASS_RESEND_API_KEY`: Resend API key (required for email verification)
- `GLASS_RESEND_VERIFICATION_TEMPLATE_ID`: Template ID for email verification
- `GLASS_RESEND_PASSWORD_RESET_TEMPLATE_ID`: Template ID for password reset
- Without Resend configured, users are auto-verified on registration

**Optional:**

- Set `GLASS_REDIS_URL` + `GLASS_FREE_MINUTES_PER_USER` to enable usage quotas

Frontend variables (set in `web/.env.local` or `web/.env`):

- `NEXT_PUBLIC_GLASS_API_URL` - Glass API URL (WebSocket URL auto-generated)
- `GLASS_API_URL_INTERNAL` - Internal Docker URL for SSR (optional, defaults to public URL)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GLASS_AUTH_JWT_SECRET` (must match backend)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional, for Google OAuth)
- Feedback + waitlist notifications reuse the backend `GLASS_DISCORD_WEBHOOK_URL` secret—no extra frontend env needed.

### Authentication & meeting history

1. **Backend** – set `GLASS_AUTH_JWT_SECRET` and `GLASS_DATABASE_URL`.
2. **Frontend** – set `NEXTAUTH_SECRET`, `NEXT_PUBLIC_GLASS_API_URL`, and copy the same `GLASS_AUTH_JWT_SECRET`.
3. Run database migrations: `cd migrations && alembic upgrade head` (or use Docker Compose which auto-runs migrations).

Email/password authentication works out of the box. For Google OAuth, add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to frontend env ([setup guide](https://console.cloud.google.com/)).

### Providers (recommended)

- TTS: ElevenLabs Flash 2.5 (`GLASS_ELEVENLABS_MODEL=eleven_flash_v2_5`)
- LLM: OpenAI GPT‑4.1 Mini (`GLASS_OPENAI_MODEL=gpt-4.1-mini`)
- ASR: Deepgram nova‑3 (or nova‑2 for multilingual meetings)
- Memory: Zep Cloud (set `GLASS_ZEP_API_KEY` / `GLASS_ZEP_PROJECT_ID`)

Example backend snippet:

```bash
# ElevenLabs (TTS)
GLASS_ELEVENLABS_API_KEY=sk-...
GLASS_ELEVENLABS_MODEL=eleven_flash_v2_5

# OpenAI (LLM)
GLASS_OPENAI_API_KEY=sk-...
GLASS_OPENAI_MODEL=gpt-4.1-mini
GLASS_OPENAI_ANALYSIS_MODEL=gpt-5-mini

# Deepgram (ASR)
GLASS_DEEPGRAM_KEY=dg-...
GLASS_DEEPGRAM_MODEL=nova-3
GLASS_DEEPGRAM_LANGUAGE=en-US

# Memory (Zep)
GLASS_ZEP_API_KEY=zp-...
GLASS_ZEP_PROJECT_ID=glass
```

Local/self-hosted adapter support (LLM/ASR/TTS) is implemented via the shared ports and can be expanded by adding new classes under `src/glass/adapters/*`.

## Setup

### Prerequisites

- Docker 24+ and Docker Compose v2 (for the recommended workflow)
- Python 3.11+ plus `pip`/`venv` (backend dev)
- Node.js 20+ with `corepack` (pnpm 10.x) for the web app
- PostgreSQL (local container provided in `docker-compose.yml`)
- Redis (optional, for usage quotas; container provided in `docker-compose.yml`)

### Docker quickstart

```bash
cp .env.example .env              # Backend secrets (OpenAI, Deepgram, JWT, etc.)
cp web/.env.example web/.env      # Frontend secrets (Google OAuth, NextAuth, same JWT)
# Edit both files with real credentials — GLASS_AUTH_JWT_SECRET must match
docker compose up --build
```

Services:

- API: http://localhost:8000 (FastAPI docs at `/docs`)
- Web: http://localhost:3000
- Data: Postgres + Redis are persisted in the `pgdata` volume; uploads live in the `backend_uploads` volume.

Compose mounts `src/` and key `web/*` directories for hot reloads while the rest of the container stays cached.

### Running locally

#### Shared services

Spin up Postgres (required):

```bash
docker compose up -d db
```

Optionally, add Redis for usage quotas:

```bash
docker compose up -d redis
```

Or point `GLASS_DATABASE_URL` (and optionally `GLASS_REDIS_URL`) at your own infrastructure.

#### Backend (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env  # fill in provider/API keys
uvicorn glass.app:create_app --factory --reload --host 0.0.0.0 --port 8000
```

By default history is written to `var/glass-history.db`. Provide a Postgres URL to collaborate with other clients. REST routes live under `/api/*`, WebSockets under `/ws/*`.

#### Frontend (Next.js)

```bash
cd web
corepack enable
pnpm install
cp .env.example .env.local   # or .env
pnpm dev
```

This launches the Next.js dev server on http://localhost:3000 with hot reload, Lingui message extraction, and NextAuth callbacks hitting the locally running API (`NEXT_PUBLIC_GLASS_API_URL=http://localhost:8000`).

## Testing & quality

- Backend: `pytest` (see `tests/`) plus `ruff`/`mypy` if desired.
- Frontend: `pnpm lint` (Next + ESLint) and `pnpm lingui:extract && pnpm lingui:compile` for localization sanity.
- Commit hygiene: Husky + Commitlint run via `pnpm prepare` at the repo root; follow [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## Deployment

- **Containers:** `Dockerfile` (backend) and `web/Dockerfile` (frontend) produce standalone images suitable for any OCI runtime.
- **Compose:** `docker-compose.yml` bundles the full stack with sane defaults, environment propagation, and bind mounts for development.
- **Custom setups:** Point your orchestration (Kubernetes, ECS, Fly, etc.) at the two images, provide the same `.env` secrets, and wire managed Postgres/Redis + provider credentials. The FastAPI app is stateless aside from `var/uploads`.

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
- **[Discord](https://discord.gg/W7RAzUdYaj)**: hang out with the community and share builds.
- **[X (Twitter)](https://x.com/speakglass)**: follow launches and highlights.
