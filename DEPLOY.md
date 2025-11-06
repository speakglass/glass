# Glass Deployment Guide (Web + API)

This doc is for production deployment of Glass. The open-source README stays focused on local use.

## Overview

- Frontend: Next.js on Vercel
- Backend: FastAPI (WebSockets) on Azure App Service (or your host)
- Domains: app.example.com (web), api.example.com (backend)

## Prereqs

- Providers
  - TTS: ElevenLabs Flash 2.5
  - LLM: OpenAI GPT‑4.1 Mini
  - ASR: Deepgram nova‑3 (or nova‑2)
- TLS certificates (Vercel/host-managed)

## Backend (FastAPI)

1. Set environment

```bash
# Providers
GLASS_LLM_PROVIDER=openai
GLASS_OPENAI_API_KEY=sk-...
GLASS_OPENAI_MODEL=gpt-4.1-mini

GLASS_ASR_PROVIDER=deepgram
GLASS_DEEPGRAM_KEY=dg-...
GLASS_DEEPGRAM_MODEL=nova-3   # or nova-2
GLASS_DEEPGRAM_LANGUAGE=en-US

GLASS_ELEVENLABS_API_KEY=sk-...
GLASS_ELEVENLABS_MODEL=eleven_flash_v2_5

# CORS (production)
GLASS_ALLOW_ORIGIN=https://app.example.com
GLASS_ALLOW_CREDENTIALS=false

# Misc
GLASS_LOG_LEVEL=INFO
```

2. Run the server

```bash
uv venv && source .venv/bin/activate
uv pip install -e .[dev]
uv run uvicorn glass.app:create_app --host 0.0.0.0 --port 8000
```

3. Health check

- HTTP: `GET https://api.example.com/` (FastAPI root)
- WS: `wss://api.example.com/ws/audio-multi?sid=test&events=true`

### Azure App Service (recommended, easiest to scale)

Backend on Azure App Service for Linux with WebSockets enabled.

```bash
# 0) Names
AZ_RESOURCE_GROUP=glass-rg
AZ_LOCATION=eastus
AZ_PLAN=glass-plan
AZ_WEBAPP=glass-api

# 1) Resource group + plan
az group create -n $AZ_RESOURCE_GROUP -l $AZ_LOCATION
az appservice plan create -g $AZ_RESOURCE_GROUP -n $AZ_PLAN --sku P1v3 --is-linux

# 2) Web App (Python)
az webapp create -g $AZ_RESOURCE_GROUP -p $AZ_PLAN -n $AZ_WEBAPP --runtime "PYTHON:3.11"

# 3) Enable WebSockets and Always On
az webapp config set -g $AZ_RESOURCE_GROUP -n $AZ_WEBAPP --web-sockets-enabled true --always-on true

# 4) App settings (env vars)
az webapp config appsettings set -g $AZ_RESOURCE_GROUP -n $AZ_WEBAPP --settings \
  GLASS_LLM_PROVIDER=openai \
  GLASS_OPENAI_API_KEY=sk-... \
  GLASS_OPENAI_MODEL=gpt-4.1-mini \
  GLASS_ASR_PROVIDER=deepgram \
  GLASS_DEEPGRAM_KEY=dg-... \
  GLASS_DEEPGRAM_MODEL=nova-3 \
  GLASS_DEEPGRAM_LANGUAGE=en-US \
  GLASS_ELEVENLABS_API_KEY=sk-... \
  GLASS_ELEVENLABS_MODEL=eleven_flash_v2_5 \
  GLASS_ALLOW_ORIGIN=https://app.example.com \
  GLASS_ALLOW_CREDENTIALS=false \
  GLASS_LOG_LEVEL=INFO

# 5) Deploy (Zip or Container)
# Zip deploy (simple)
zip -r api.zip src pyproject.toml uv.lock
az webapp deploy -g $AZ_RESOURCE_GROUP -n $AZ_WEBAPP --src-path api.zip --type zip

# Or container deploy (optional)
# Build/push your image, then:
# az webapp create ... --deployment-container-image-name <registry>/glass-api:latest
# az webapp config appsettings set ... --settings WEBSITES_PORT=8000

# 6) Configure custom domain + TLS in Portal (optional)
```

Autoscale: in the Azure Portal → your App Service Plan → Scale-out; set min/max instances and a CPU-based rule (e.g., >60% for 10 min).

## Frontend (Vercel)

1. Connect the `web/` directory as a Vercel project (Next.js 14)

2. Environment variables (Project → Settings → Environment Variables)

```bash
NEXT_PUBLIC_GLASS_WS_URL=wss://api.example.com
NEXT_PUBLIC_GLASS_API_URL=https://api.example.com
```

3. Build & deploy

- Framework Preset: Next.js
- Build Command: `next build`
- Output: default

4. Verify

- Open `https://app.example.com`
- Click Start and grant mic permissions

## Security & Ops (cloud)

- Edge/WAF
  - Use Azure Front Door (Standard/Premium) with a WAF policy: enable managed rules, bot protection, basic rate limiting.
  - Terminate TLS at Front Door and route to the Web App.
- AuthN/AuthZ
  - Public demo: issue short‑lived demo JWTs from the backend; require token on WS/HTTP; enforce per‑IP/session quotas.
  - Admin/ops endpoints: enable App Service Authentication (Entra ID) and restrict to your tenant; or host admin endpoints on a separate protected app.
- CORS/Origin
  - Set `GLASS_ALLOW_ORIGIN=https://app.example.com`; for WebSockets, validate `Origin` and close if mismatched.
- Secrets
  - Store provider keys in Azure Key Vault and reference them in App Settings; never expose to the browser.
- Limits & abuse control
  - Set WebSocket idle timeout, max session seconds, and message size limits.
  - Add server‑side rate limits (IP + session) and close on excess.
  - Optionally require hCaptcha/Turnstile after thresholds.
- Observability
  - Enable Application Insights for request logs, dependencies, errors, and live metrics.
  - Send alerts on error rate, 5xx, and CPU/memory.

## Troubleshooting

- WS fails to connect: confirm `NEXT_PUBLIC_GLASS_WS_URL` starts with `wss://` and points to your backend
- 403/CORS: check `GLASS_ALLOW_ORIGIN` matches exactly the frontend origin
- No TTS/ASR/LLM responses: verify provider keys and models

## Appendix: Example DNS

- `app.example.com` → Vercel project
- `api.example.com` → Backend load balancer/host

## Appendix: Local-hosted models

Planned adapters for local-hosted LLM/ASR/TTS. No production steps yet—keep the same web envs when added.
