<img width="1461" height="751" alt="app-mockup" src="https://github.com/user-attachments/assets/0e678490-e9e0-4ce0-b15d-7b0656f5b1c1" />

# Glass

AI that helps you speak any language in the real world.

Glass is your live language coach: speak in the moment with real-time feedback,
sentence suggestions, and pronunciation you can read—even if you can’t read the
script yet.

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
