<img width="1511" height="828" alt="web-app" src="https://github.com/user-attachments/assets/01c8a960-90c1-4b39-81b9-84f6091323a8" />

# Glass

AI that helps you speak any language in the real world.

Glass is your live language coach: speak in the moment with real-time feedback,
sentence suggestions, and pronunciation you can read—even if you can’t read the
script yet.

<p>
  <a href="https://discord.gg/W7RAzUdYaj">
    <img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" />
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

- 🎧 Real-time feedback and sentence suggestions
- 🔤 Pronunciation with native-language hints and romanization (e.g., romaji)
- 🗣️ Practice mode with an AI voice partner
- 🧠 Persistent memory that personalizes over time

## Use Cases

- 🧑‍💻 Online meetings: Zoom, Google Meet, Teams (via screen audio capture)
- 🌐 Online language exchange
- 🎯 Interview prep and presentations

## What is this?

Glass is the web version of our AI speaking assistant. It consists of:

- FastAPI backend (speech → understanding → suggestions)
- Next.js frontend (microphone/screen-audio capture, real-time UI)

## Quickstart (local)

### Backend

```bash
# Using uv (recommended)
uv venv && source .venv/bin/activate
uv pip install -e .[dev]
uv run uvicorn glass.app:create_app --reload
# API: http://localhost:8000, WS: ws://localhost:8000/ws/audio-multi
```

### Web

```bash
cd web
pnpm install          # or npm install
# Create web/.env.local
cat > .env.local <<'EOF'
NEXT_PUBLIC_GLASS_WS_URL=ws://localhost:8000
NEXT_PUBLIC_GLASS_API_URL=http://localhost:8000
EOF
pnpm dev              # open http://localhost:3000
```

### Providers (recommended)

- TTS: ElevenLabs Flash 2.5
- LLM: OpenAI GPT‑4.1 Mini
- ASR: Deepgram nova‑3/nova‑2

Set these in your backend `.env`:

```bash
# ElevenLabs (TTS)
GLASS_ELEVENLABS_API_KEY=sk-...
GLASS_ELEVENLABS_MODEL=eleven_flash_v2_5

# OpenAI (LLM)
GLASS_OPENAI_API_KEY=sk-...
GLASS_OPENAI_MODEL=gpt-4.1-mini

# Deepgram (ASR)
GLASS_DEEPGRAM_KEY=dg-...
GLASS_DEEPGRAM_MODEL=nova-3   # or nova-2
GLASS_DEEPGRAM_LANGUAGE=en-US
```

Local-hosted model adapters (LLM/ASR/TTS) will be added soon.

## Roadmap

| Item                                      | Status     | Notes                        |
| ----------------------------------------- | ---------- | ---------------------------- |
| Real-time feedback & sentence suggestions | ✅ Done    | Streaming via WebSocket      |
| Screen audio capture for meetings         | ✅ Done    | Works with Zoom/Meet/Teams   |
| Desktop app                               | 🚧 Planned | macOS app with full glass UI |
| Speaker diarization                       | 🚧 Planned | Multi-speaker labeling       |
| Screen capture input (on-screen context)  | 🚧 Planned | Image/screen context → help  |
| Persistent memory/personalization         | 🚧 Planned | Zep/Graphiti adapters        |
| Local-hosted model adapters (LLM/ASR/TTS) | 🚧 Planned | Self-hosted runtime          |
| Docker/Compose support                    | 🚧 Planned | Backend/Web images + compose |

## License

This project is licensed under the Business Source License 1.1 (BSL).

- Hosted use is allowed, but commercial competition is restricted until the Change Date.
- On 2028‑01‑01, the license automatically changes to Apache‑2.0.
- See the full terms in [LICENSE](./LICENSE), including the Non‑Competitive definition and a small‑scale revenue exception.

## Community & contact

- **[GitHub Discussions](https://github.com/speakglass/glass/discussions)**: best place for questions, product feedback, and ideas.

- **[GitHub Issues](https://github.com/speakglass/glass/issues)**: report bugs and propose features so we can track them.

- **[Discord](https://discord.gg/W7RAzUdYaj)**: share what you’re building and chat with the community.

- **[X (Twitter)](https://x.com/speakglass)**: follow updates, launches, and community highlights.
