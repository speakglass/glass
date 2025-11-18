<div align="center">
  <h1>Glass - AI Voice Interface</h1>
  <p>Real-time voice conversation with microphone and screen audio capture</p>
</div>

## Overview

Glass is a Next.js web application that connects to the Glass API backend for real-time voice conversations. It captures both microphone input and screen audio, streaming them simultaneously to the backend for processing.

## Features

- 🎤 **Microphone Capture**: High-quality audio input with echo cancellation and noise suppression
- 🖥️ **Screen Audio Capture**: Capture system audio from screen sharing
- 🔄 **Real-time Streaming**: WebSocket-based audio streaming to Glass API
- 📊 **Audio Visualization**: Real-time FFT visualization of microphone input
- 🌓 **Dark/Light Mode**: Built-in theme switching
- 💬 **Message Display**: Real-time transcription and conversation history

## Setup

### Prerequisites

- Node.js 18+
- Running Glass API backend (see main README)

### Installation

1. Install dependencies:

```bash
npm install
# or
pnpm install
```

2. Create `.env.local` file:

```bash
# Required
NEXT_PUBLIC_GLASS_API_URL=http://localhost:8000
NEXTAUTH_SECRET=your-secret-here
GLASS_AUTH_JWT_SECRET=your-jwt-secret
```

**Note:** WebSocket URL is automatically generated from API URL (http→ws, https→wss)

3. Start the development server:

```bash
npm run dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable                       | Description                         | Required | Default                |
| ------------------------------ | ----------------------------------- | -------- | ---------------------- |
| `NEXT_PUBLIC_GLASS_API_URL`    | Glass API URL (WebSocket auto)      | Yes      | `http://localhost:8000`|
| `NEXTAUTH_SECRET`              | NextAuth encryption secret          | Yes      | -                      |
| `GLASS_AUTH_JWT_SECRET`        | JWT secret (must match backend)     | Yes      | -                      |
| `GOOGLE_CLIENT_ID`             | Google OAuth client ID              | No       | -                      |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth client secret          | No       | -                      |

## Usage

1. Click the **"Start Call"** button
2. Grant microphone permissions when prompted
3. (Optional) Grant screen sharing permissions for system audio
4. Speak into your microphone to start the conversation
5. View real-time transcriptions in the message panel
6. Click **"End Call"** to stop the session

## Architecture

The application uses a custom `VoiceContext` provider that:

1. Establishes WebSocket connection to Glass API (`/ws/audio`)
2. Captures microphone audio via `getUserMedia()`
3. Optionally captures system audio via `getDisplayMedia()`
4. Multiplexes both audio streams with channel identifiers (0x01 for mic, 0x02 for system)
5. Converts audio to PCM16 format and streams to backend
6. Receives and displays transcriptions and responses

## Project Structure

```
web/
├── app/                    # Next.js app router
│   ├── layout.tsx         # Root layout with theme provider
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── chat.tsx          # Main chat container
│   ├── start-call.tsx    # Call initiation button
│   ├── controls.tsx      # Call controls (mute, end call)
│   ├── messages.tsx      # Message display
│   ├── nav.tsx           # Navigation bar
│   └── mic-fft.tsx       # Audio visualization
├── contexts/             # React contexts
│   └── VoiceContext.tsx  # Voice state and WebSocket management
└── utils/                # Utility functions
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Browser Compatibility

- Chrome/Edge 88+
- Firefox 94+
- Safari 15.4+

**Note**: Screen audio capture requires Chrome/Edge or Firefox. Safari does not support audio capture from `getDisplayMedia()`.
