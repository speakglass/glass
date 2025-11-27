/**
 * Audio utilities for WebSocket streaming
 */

// Convert Float32 to PCM16 (matching web implementation)
export function convertFloat32ToPCM16(float32Array: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(pcm16.buffer);
}

// Resample audio data
export function resampleAudioData(
  inputData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (originalSampleRate === targetSampleRate) {
    return inputData;
  }

  const resampleRatio = originalSampleRate / targetSampleRate;
  const targetLength = Math.floor(inputData.length / resampleRatio);
  const resampled = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    resampled[i] = inputData[Math.floor(i * resampleRatio)];
  }

  return resampled;
}

// Audio source identifiers (matching backend protocol)
export const SOURCE_MICROPHONE = 0x01;
export const SOURCE_SYSTEM = 0x02;

export interface AudioPacket {
  packet: ArrayBuffer;
  samples: number;
  cursor: number;
  source: 'mic' | 'system';
}

// Create WebSocket URL for mobile audio streaming
// Uses /ws/mobile endpoint which doesn't require source byte prefix
export function createAudioWSURL(
  baseUrl: string,
  params: {
    sid: string;
    authToken: string; // Required - must have auth token
    learningLang?: string;
    nativeLang?: string;
    userSpokenLang?: string;
    partnerSpokenLang?: string;
    mode?: string;
    partnerId?: string;
  }
): string {
  const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const wsBaseUrl = baseUrl.replace(/^https?/, wsProtocol);

  // Use mobile-specific endpoint (no source byte prefix required)
  const url = new URL(`${wsBaseUrl}/ws/mobile`);
  url.searchParams.set('sid', params.sid);
  url.searchParams.set('events', 'true'); // Enable server events
  url.searchParams.set('auth_token', params.authToken); // Required for authentication

  if (params.learningLang) {
    url.searchParams.set('learning_lang', params.learningLang);
  }
  if (params.nativeLang) {
    url.searchParams.set('native_lang', params.nativeLang);
  }
  if (params.userSpokenLang) {
    url.searchParams.set('user_spoken_lang', params.userSpokenLang);
  }
  if (params.partnerSpokenLang) {
    url.searchParams.set('partner_spoken_lang', params.partnerSpokenLang);
  }
  if (params.mode) {
    url.searchParams.set('mode', params.mode);
  }
  if (params.partnerId) {
    url.searchParams.set('partner_id', params.partnerId);
  }

  return url.toString();
}

// Generate session ID
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Convert base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert ArrayBuffer to Int16Array
export function arrayBufferToInt16Array(buffer: ArrayBuffer): Int16Array {
  return new Int16Array(buffer);
}
