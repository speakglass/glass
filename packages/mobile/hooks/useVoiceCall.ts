import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid, AVPlaybackStatusSuccess } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import InCallManager from 'react-native-incall-manager';
import { useAuth } from '@/contexts/auth-context';
import { useApi } from '@/contexts/api-context';
import { API_BASE_URL } from '@/lib/api-config';
import { createAudioWSURL, generateSessionId, base64ToArrayBuffer } from '@/lib/audio-utils';

export type VoiceCallStatus = 'idle' | 'connecting' | 'connected' | 'recording' | 'analyzing' | 'error';

export interface VoiceMessage {
  id: string;
  text: string;
  translation?: string;
  sender: 'user' | 'partner' | 'glass';
  timestamp: number;
}

export interface AISuggestion {
  id: string;
  text: string;
  translation?: string;
  pronunciation?: string;
  timestamp: number;
}

// TTS word-by-word timing segment
export interface TTSWordSegment {
  text: string;
  start_ms: number;
  end_ms: number;
  char_start: number;
  char_end: number;
}

// TTS highlight state for word-by-word highlighting
export interface TTSHighlightState {
  requestId: string;
  targetId: string; // utterance_id of the message being spoken
  segments: TTSWordSegment[];
  activeIndex: number; // -1 = not started, >= segments.length = finished
}

interface UseVoiceCallParams {
  partnerId: string;
  learningLang?: string;
  nativeLang?: string;
  partnerNativeLang?: string;
  onMessage?: (message: VoiceMessage) => void;
  onError?: (error: Error) => void;
}

export function useVoiceCall({
  partnerId,
  learningLang,
  nativeLang,
  partnerNativeLang,
  onMessage,
  onError,
}: UseVoiceCallParams) {
  const { token, snapshot } = useAuth();
  const api = useApi();
  const [status, setStatus] = useState<VoiceCallStatus>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState<AISuggestion | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // TTS playback state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsHighlight, setTtsHighlight] = useState<TTSHighlightState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());
  const micAudioCursorRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isMutedRef = useRef(false);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioListenerSetupRef = useRef(false);
  const inCallManagerInitializedRef = useRef(false);

  // TTS refs
  const ttsAudioChunksRef = useRef<Uint8Array[]>([]);
  const ttsSegmentsRef = useRef<Map<string, TTSWordSegment[]>>(new Map());
  const ttsRequestContextRef = useRef<Map<string, { targetId: string }>>(new Map());
  const currentTtsRequestIdRef = useRef<string | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);
  const ttsPlaybackStartRef = useRef<number>(0);
  const ttsHighlightIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSpeakingRef = useRef(false);

  // Keep isSpeakingRef in sync
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Keep isMutedRef in sync with isMuted state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Initialize audio session and AudioRecord once (Gemini pattern!)
  useEffect(() => {
    if (audioListenerSetupRef.current) return;
    audioListenerSetupRef.current = true;

    // Configure audio FIRST (Gemini pattern - Line 766 in AudioOutputService)
    const configureAudio = async () => {
      try {
        console.log('[VoiceCall] Configuring audio session at initialization...');

        // First setAudioModeAsync (Gemini pattern)
        await Audio.setIsEnabledAsync(true);
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          allowsRecordingIOS: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
        console.log('[VoiceCall] Initial audio mode configured');

        // Initialize InCallManager at module level (Gemini pattern)
        if (!inCallManagerInitializedRef.current) {
          try {
            // Check if InCallManager is available (Gemini Line 38)
            if (!InCallManager) {
              console.log('[VoiceCall] InCallManager not available, will rely on expo-av only');
              // Continue without InCallManager - expo-av can still work
            } else {
              console.log('[VoiceCall] Initializing InCallManager with AEC...');
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Double-check after delay (Gemini Line 51)
              if (!InCallManager || typeof InCallManager.start !== 'function') {
                console.warn('[VoiceCall] InCallManager not available after delay');
              } else {
                (InCallManager as any).start({
                  media: 'audio',
                  auto: true,
                  ringback: '',
                  force: true,
                  forceSpeakerOn: true,
                  enableAEC: true,
                  enableAGC: true,
                  enableNS: true,
                  enableHWAEC: Platform.OS === 'android',
                });

                await new Promise((resolve) => setTimeout(resolve, 300));

                // Verify method exists before calling (Gemini Line 71)
                if (InCallManager && typeof InCallManager.setForceSpeakerphoneOn === 'function') {
                  InCallManager.setForceSpeakerphoneOn(true);
                  inCallManagerInitializedRef.current = true;
                  console.log('[VoiceCall] InCallManager initialized successfully at module level');
                } else {
                  console.warn('[VoiceCall] setForceSpeakerphoneOn not available');
                }
              }
            }
          } catch (error) {
            console.warn('[VoiceCall] InCallManager init failed:', error);
            // Continue anyway - expo-av should still work
          }
        }

        // iOS: Second setAudioModeAsync (Gemini pattern - Line 116)
        if (Platform.OS === 'ios') {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            allowsRecordingIOS: true,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: false,
          });
          console.log('[VoiceCall] iOS audio session configured for speaker');
        }

        console.log('[VoiceCall] Audio configured successfully at initialization');
      } catch (error) {
        console.error('[VoiceCall] Error configuring audio:', error);
      }
    };

    // Configure audio immediately (Gemini calls this at module load)
    configureAudio();

    const options = {
      sampleRate: 16000, // Backend requires 16kHz
      channels: 1, // Mono
      bitsPerSample: 16, // PCM16
      audioSource: Platform.OS === 'android' ? 6 : 0, // VOICE_RECOGNITION (Android) or DEFAULT (iOS)
      // Note: Changed from 7 (VOICE_COMMUNICATION) to avoid audio session conflicts with expo-av
      // 6 = VOICE_RECOGNITION still has noise suppression but is more compatible
      wavFile: 'audio.wav', // Temporary file name
    };

    AudioRecord.init(options);
    console.log('[VoiceCall] AudioRecord initialized');

    // Set up audio data listener for real-time streaming (only once)
    AudioRecord.on('data', (data: string) => {
      // Debug: check why audio might not be sent
      if (!isRecordingRef.current) {
        return;
      }
      if (isMutedRef.current) {
        return;
      }
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.log('[VoiceCall] WebSocket not ready, state:', wsRef.current?.readyState);
        return;
      }

      try {
        // data is base64 encoded PCM16 audio - send directly without unnecessary conversions
        const audioBuffer = base64ToArrayBuffer(data);

        // Calculate cursor for timing
        const sampleCount = audioBuffer.byteLength / 2; // 16-bit = 2 bytes per sample
        const startCursor = micAudioCursorRef.current;
        const durationSeconds = sampleCount / 16000;
        micAudioCursorRef.current = startCursor + durationSeconds;

        // Send raw PCM16 audio directly to WebSocket
        wsRef.current.send(audioBuffer);

        // Debug: log every second of audio
        if (Math.floor(micAudioCursorRef.current) !== Math.floor(startCursor)) {
          console.log(`[VoiceCall] Audio sent: ${micAudioCursorRef.current.toFixed(1)}s`);
        }
      } catch (error) {
        console.error('[VoiceCall] Failed to process audio chunk:', error);
      }
    });

    return () => {
      AudioRecord.stop();
    };
  }, []);

  // Request microphone permissions
  const requestPermissions = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Use expo-av for permission request
        const { status } = await Audio.requestPermissionsAsync();
        console.log('[VoiceCall] iOS permission status:', status);
        return status === 'granted';
      } else {
        // Android: Use PermissionsAndroid
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone Permission',
          message: 'Glass needs access to your microphone for voice calls.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        });
        console.log('[VoiceCall] Android permission status:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('[VoiceCall] Permission request failed:', error);
      onError?.(error as Error);
      return false;
    }
  }, [onError]);

  // Add message
  const addMessage = useCallback(
    (message: Omit<VoiceMessage, 'id' | 'timestamp'>) => {
      const newMessage: VoiceMessage = {
        ...message,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);
      onMessage?.(newMessage);
    },
    [onMessage]
  );

  // Update or add message by utterance ID (handles real-time updates)
  const upsertMessage = useCallback(
    (utteranceId: string, message: Omit<VoiceMessage, 'id' | 'timestamp'>) => {
      setMessages((prev) => {
        // Check if we already have a message for this utterance
        const existingIndex = prev.findIndex((m) => m.id.startsWith(`utt-${utteranceId}`));
        if (existingIndex >= 0) {
          // Update existing message
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            text: message.text,
            translation: message.translation || updated[existingIndex].translation,
          };
          return updated;
        }
        // Add new message
        const newMessage: VoiceMessage = {
          ...message,
          id: `utt-${utteranceId}-${Date.now()}`,
          timestamp: Date.now(),
        };
        onMessage?.(newMessage);
        return [...prev, newMessage];
      });
    },
    [onMessage]
  );

  // Handle WebSocket messages (matching server event types)
  const handleWSMessage = useCallback(
    (event: MessageEvent) => {
      try {
        // Handle binary data (TTS audio chunks)
        if (event.data instanceof ArrayBuffer) {
          const chunk = new Uint8Array(event.data);
          ttsAudioChunksRef.current.push(chunk);

          // DEBUG: Check first bytes to verify PCM vs MP3
          if (ttsAudioChunksRef.current.length === 1 && chunk.length > 0) {
            const first4 = Array.from(chunk.slice(0, Math.min(4, chunk.length)))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ');
            console.log(`[VoiceCall] 🔍 First chunk first bytes: ${first4}`);
            // MP3 starts with FF FB or 49 44 33 (ID3)
            // PCM is random values
          }

          console.log(
            `[VoiceCall] TTS audio chunk received: ${chunk.length} bytes (total: ${ttsAudioChunksRef.current.length} chunks)`
          );
          return;
        }
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buffer) => {
            const chunk = new Uint8Array(buffer);
            ttsAudioChunksRef.current.push(chunk);
            console.log(
              `[VoiceCall] TTS audio chunk (blob) received: ${chunk.length} bytes (total: ${ttsAudioChunksRef.current.length} chunks)`
            );
          });
          return;
        }

        // Handle JSON messages
        const data = JSON.parse(event.data);

        // Get message type (server uses both 't' and 'type' for different messages)
        const messageType = data.t || data.type;

        // Determine source type
        const isUserSource = (source?: string): boolean => {
          if (!source) return false;
          return source === 'mic' || source.startsWith('mic_');
        };

        const isAISource = (source?: string): boolean => {
          return source === 'ai';
        };

        switch (messageType) {
          // Live/partial transcript - show real-time as user speaks
          case 'transcript_interim': {
            const text = (data.text || '').trim();
            if (!text) return;

            const utteranceId = data.utterance_id;
            if (!utteranceId) return;

            const isUser = isUserSource(data.source);

            // Show interim transcript for user speech
            if (isUser) {
              upsertMessage(utteranceId, {
                text,
                sender: 'user',
              });
            }
            break;
          }

          // Final transcript - confirmed speech text (both user and AI partner)
          case 'transcript_final': {
            const text = (data.text || '').trim();
            if (!text) return;

            const utteranceId = data.utterance_id;
            if (!utteranceId) return;

            const isUser = isUserSource(data.source);
            const isAI = isAISource(data.source);

            if (isUser) {
              // User message
              upsertMessage(utteranceId, {
                text,
                translation: data.translation,
                sender: 'user',
              });
            } else if (isAI) {
              // AI partner message (roleplay mode)
              upsertMessage(utteranceId, {
                text,
                translation: data.translation,
                sender: 'partner',
              });

              // Auto-play TTS for AI responses when requested
              if (data.auto_tts && wsRef.current?.readyState === WebSocket.OPEN) {
                const requestId = `tts_ai_${utteranceId}_${Date.now()}`;

                // Store context BEFORE sending request (like web does!)
                if (utteranceId) {
                  ttsRequestContextRef.current.set(requestId, { targetId: utteranceId });
                }

                wsRef.current.send(
                  JSON.stringify({
                    type: 'request_tts',
                    text,
                    voice_id: data.voice_id,
                    language: data.lang || snapshot?.user.learningLang || 'en',
                    source: 'ai',
                    request_id: requestId,
                  })
                );
              }
            }
            break;
          }

          // Complete utterance - speech segment is fully done
          case 'utterance_completed': {
            const text = (data.text || '').trim();
            const utteranceId = data.utterance_id;
            if (!utteranceId) return;

            const isUser = isUserSource(data.source);
            const isAI = isAISource(data.source);

            if (isUser && text) {
              upsertMessage(utteranceId, {
                text,
                translation: data.translation,
                sender: 'user',
              });

              // Clear suggestion when user finishes speaking (like web version)
              setTimeout(() => {
                setCurrentSuggestion(null);
              }, 1000);
            } else if (isAI && text) {
              upsertMessage(utteranceId, {
                text,
                translation: data.translation,
                sender: 'partner',
              });
            }
            break;
          }

          // AI partner response (roleplay mode)
          case 'response': {
            const text = (data.text || data.content || '').trim();
            if (!text) return;

            addMessage({
              text,
              translation: data.translation,
              sender: 'partner',
            });
            break;
          }

          // Translation update for existing utterance
          case 'translation': {
            const utteranceId = data.utterance_id;
            const translation = (data.text || data.translation || '').trim();
            if (!utteranceId || !translation) return;

            // Update existing message with translation
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m.id.startsWith(`utt-${utteranceId}`));
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], translation };
                // Trigger scroll to show updated message
                onMessage?.(updated[idx]);
              }
              return updated;
            });
            break;
          }

          // Grammar/pronunciation feedback from Glass AI
          case 'feedback': {
            // Extract feedback text - prefer structured suggestion format
            const suggestion = data.suggestion || {};
            const feedbackText =
              suggestion.reason_native || suggestion.target_text || data.text || data.reason_native || data.target_text;

            // Get translation/pronunciation info
            const translation = suggestion.pronunciation || data.pronunciation;

            // Skip if no meaningful feedback or if error_type is 'none'
            const errorType = suggestion.error_type || data.error_type;
            if (!feedbackText || (errorType && errorType.toLowerCase() === 'none')) {
              return;
            }

            addMessage({
              text: feedbackText,
              translation,
              sender: 'glass',
            });
            break;
          }

          // AI suggestion (show as floating chip above input)
          case 'suggestion': {
            if (!data.auto) return; // Only show auto suggestions

            const suggestion = data.suggestion || {};
            const suggestionText = suggestion.target_text || data.text;
            if (!suggestionText) return;

            // Set as current suggestion (displayed above input, not in chat)
            setCurrentSuggestion({
              id: `sug-${Date.now()}`,
              text: suggestionText,
              translation: suggestion.native_translation,
              pronunciation: suggestion.pronunciation,
              timestamp: Date.now(),
            });
            break;
          }

          // Server error
          case 'error': {
            console.error('[VoiceCall] Server error:', data.message || data.error);
            onError?.(new Error(data.message || data.error || 'Unknown server error'));
            break;
          }

          // TTS timing data (word-by-word timing for highlighting)
          case 'tts_timing': {
            const requestId = data.request_id;
            if (!requestId || !Array.isArray(data.segments)) return;

            // Normalize and store timing segments
            const normalized: TTSWordSegment[] = [];
            for (const seg of data.segments) {
              if (!seg || typeof seg.text !== 'string') continue;
              normalized.push({
                text: seg.text,
                start_ms: Math.max(0, seg.start_ms || 0),
                end_ms: Math.max(seg.end_ms || 0, seg.start_ms || 0),
                char_start: Math.max(0, seg.char_start || 0),
                char_end: seg.char_end || (seg.char_start || 0) + seg.text.length,
              });
            }
            ttsSegmentsRef.current.set(requestId, normalized);
            break;
          }

          // TTS playback start
          case 'tts_start': {
            const requestId = data.request_id;
            if (!requestId) return;

            // Reset for new TTS session
            currentTtsRequestIdRef.current = requestId;
            ttsAudioChunksRef.current = [];
            setIsSpeaking(true);
            break;
          }

          // TTS playback complete - play audio
          case 'tts_end': {
            const requestId = data.request_id || currentTtsRequestIdRef.current;
            console.log(
              `[VoiceCall] TTS end: requestId=${requestId}, total chunks=${ttsAudioChunksRef.current.length}`
            );
            playTTSAudio(requestId);
            break;
          }

          // TTS error
          case 'tts_error': {
            console.error('[VoiceCall] TTS error:', data.error);
            setIsSpeaking(false);
            ttsAudioChunksRef.current = [];
            resetTtsHighlight();
            break;
          }

          // Pong response to ping
          case 'pong':
            break;

          default:
            // Only log truly unhandled types (ignore undefined/empty)
            if (messageType) {
              console.log('[VoiceCall] Unhandled message type:', messageType, data);
            }
        }
      } catch (error) {
        console.error('[VoiceCall] Failed to handle message:', error);
      }
    },
    [addMessage, upsertMessage, setMessages, onMessage, onError]
  );

  // Connect WebSocket
  const connectWebSocket = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Ensure we have authentication token before connecting
    if (!token) {
      console.error('[VoiceCall] No authentication token available');
      setStatus('error');
      onError?.(new Error('Authentication required. Please sign in again.'));
      return;
    }

    setStatus('connecting');

    // Resolve languages (matching web version logic)
    const resolvedLearningLang = learningLang || snapshot?.user.learningLang || 'en';
    const resolvedNativeLang = nativeLang || snapshot?.user.nativeLang || 'en';

    // For roleplay mode, both user and partner speak the same language (shared language)
    // Use partner's native language if available, otherwise fall back to user's native language
    const sharedLang = partnerNativeLang || resolvedNativeLang;

    const wsURL = createAudioWSURL(API_BASE_URL, {
      sid: sessionIdRef.current,
      authToken: token,
      learningLang: resolvedLearningLang,
      nativeLang: resolvedNativeLang,
      userSpokenLang: sharedLang,
      partnerSpokenLang: sharedLang,
      mode: 'roleplay',
      partnerId,
    });

    console.log('[VoiceCall] Connecting to:', wsURL.replace(/auth_token=[^&]+/, 'auth_token=***'));

    const ws = new WebSocket(wsURL);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[VoiceCall] WebSocket connected');
      setStatus('connected');
      wsRef.current = ws;

      // Send client initialization message (matching web version)
      ws.send(
        JSON.stringify({
          type: 'client_init',
          session_id: sessionIdRef.current,
          sample_rate: 16000,
          encoding: 'pcm16',
          vad_chunk_duration: 4096 / 16000,
        })
      );

      // Send session config (matching web version)
      ws.send(
        JSON.stringify({
          type: 'session_config',
          learning_lang: resolvedLearningLang,
          native_lang: resolvedNativeLang,
          mode: 'roleplay',
          partner_id: partnerId,
          user_spoken_lang: sharedLang,
          partner_spoken_lang: sharedLang,
        })
      );

      // Disable auto suggestions (user can request manually via hint button)
      ws.send(
        JSON.stringify({
          type: 'set_suggest_mode',
          mode: 'off',
        })
      );

      // Start heartbeat to keep connection alive
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };

    ws.onmessage = handleWSMessage;

    ws.onerror = (error: any) => {
      console.error('[VoiceCall] WebSocket error:', error);
      const errorMessage = error?.message || 'WebSocket connection failed';
      setStatus('error');
      onError?.(new Error(errorMessage));
    };

    ws.onclose = (event) => {
      console.log('[VoiceCall] WebSocket closed, code:', event.code, 'reason:', event.reason);
      wsRef.current = null;

      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Handle specific close codes with appropriate error messages
      switch (event.code) {
        case 4401:
          setStatus('error');
          onError?.(new Error('Authentication failed. Please sign in again.'));
          break;
        case 4403:
          setStatus('error');
          onError?.(new Error('Conversation limit reached. Please upgrade your plan.'));
          break;
        case 1008:
          setStatus('error');
          onError?.(new Error('Connection not allowed. Please try again.'));
          break;
        default:
          setStatus('idle');
      }
    };
  }, [token, snapshot, learningLang, nativeLang, partnerId, handleWSMessage, onError]);

  // Start audio recording
  const startRecording = useCallback(async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        throw new Error('No microphone permission');
      }

      await connectWebSocket();

      // Wait for WebSocket to be connected
      await new Promise<void>((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          } else if (status === 'error') {
            clearInterval(checkConnection);
            reject(new Error('Connection failed'));
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          reject(new Error('Connection timeout'));
        }, 10000);
      });

      // Re-confirm audio session before recording (Gemini pattern)
      // Note: InCallManager already initialized at module level
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Re-force speaker if InCallManager is available
      if (
        inCallManagerInitializedRef.current &&
        InCallManager &&
        typeof InCallManager.setForceSpeakerphoneOn === 'function'
      ) {
        try {
          InCallManager.setForceSpeakerphoneOn(true);
          console.log('[VoiceCall] Speaker re-confirmed for recording');
        } catch (error) {
          console.warn('[VoiceCall] Failed to re-confirm speaker:', error);
        }
      }

      // Start recording with AudioRecord
      AudioRecord.start();
      isRecordingRef.current = true;
      setStatus('recording');

      console.log('[VoiceCall] Recording started - streaming to WebSocket');
    } catch (error) {
      console.error('[VoiceCall] Failed to start recording:', error);
      setStatus('error');
      onError?.(error as Error);
    }
  }, [requestPermissions, connectWebSocket, status, onError]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      const currentSessionId = sessionIdRef.current;

      isRecordingRef.current = false;
      AudioRecord.stop();

      // Send end_call message before closing
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'end_call' }));
        } catch (err) {
          console.error('[VoiceCall] Failed to send end_call signal:', err);
        }
        wsRef.current.close();
      }

      micAudioCursorRef.current = 0;

      // Stop InCallManager (Gemini pattern)
      if (inCallManagerInitializedRef.current && InCallManager && typeof InCallManager.stop === 'function') {
        try {
          InCallManager.stop();
          inCallManagerInitializedRef.current = false;
          console.log('[VoiceCall] InCallManager stopped');
        } catch (error) {
          console.warn('[VoiceCall] Failed to stop InCallManager:', error);
        }
      }

      console.log('[VoiceCall] Recording stopped, starting conversation analysis...');

      // Start analyzing conversation (like web version)
      setStatus('analyzing');

      // Poll for conversation analysis
      const startPolling = async () => {
        const maxAttempts = 20;
        let attempts = 0;

        const poll = async () => {
          attempts++;

          try {
            const summaries = await api.fetchConversationSummaries({ limit: 10 });
            const conversation = summaries.conversations.find((c: any) => c.sessionId === currentSessionId);

            if (conversation?.id) {
              console.log('[VoiceCall] Analysis complete, conversation ID:', conversation.id);
              setConversationId(conversation.id);
              setStatus('idle');
            } else if (attempts < maxAttempts) {
              console.log(`[VoiceCall] Conversation not ready yet, attempt ${attempts}/${maxAttempts}`);
              setTimeout(poll, 1000);
            } else {
              console.log('[VoiceCall] Polling timeout, conversation may still be processing');
              setStatus('idle');
            }
          } catch (error) {
            console.error('[VoiceCall] Failed to poll conversation:', error);
            if (attempts < maxAttempts) {
              setTimeout(poll, 2000);
            } else {
              setStatus('idle');
            }
          }
        };

        poll();
      };

      startPolling();
    } catch (error) {
      console.error('[VoiceCall] Failed to stop recording:', error);
      setStatus('idle');
      onError?.(error as Error);
    }
  }, [api, onError]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Reset TTS highlight state
  const resetTtsHighlight = useCallback(() => {
    if (ttsHighlightIntervalRef.current) {
      clearInterval(ttsHighlightIntervalRef.current);
      ttsHighlightIntervalRef.current = null;
    }
    setTtsHighlight(null);
  }, []);

  // Stop speaking and cleanup TTS
  const stopSpeaking = useCallback(async () => {
    if (ttsSoundRef.current) {
      try {
        await ttsSoundRef.current.stopAsync();
        await ttsSoundRef.current.unloadAsync();
      } catch (e) {
        // Ignore errors
      }
      ttsSoundRef.current = null;
    }
    setIsSpeaking(false);
    ttsAudioChunksRef.current = [];
    resetTtsHighlight();
  }, [resetTtsHighlight]);

  // Start highlight animation loop
  const startHighlightLoop = useCallback((requestId: string) => {
    const context = ttsRequestContextRef.current.get(requestId);
    const segments = ttsSegmentsRef.current.get(requestId);

    if (!context || !segments || segments.length === 0) {
      return;
    }

    // Initialize highlight state
    setTtsHighlight({
      requestId,
      targetId: context.targetId,
      segments,
      activeIndex: -1,
    });

    // Clear any existing interval
    if (ttsHighlightIntervalRef.current) {
      clearInterval(ttsHighlightIntervalRef.current);
    }

    // Update highlight based on elapsed time
    ttsHighlightIntervalRef.current = setInterval(() => {
      const elapsedMs = Date.now() - ttsPlaybackStartRef.current;
      let nextIndex = -1;

      // Find current segment based on elapsed time
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (elapsedMs >= seg.start_ms && elapsedMs <= seg.end_ms) {
          nextIndex = i;
          break;
        }
      }

      // Check if finished
      if (nextIndex === -1 && segments.length > 0 && elapsedMs > segments[segments.length - 1].end_ms) {
        nextIndex = segments.length;
      }

      setTtsHighlight((prev) => {
        if (!prev || prev.requestId !== requestId) return prev;
        if (prev.activeIndex === nextIndex) return prev;
        return { ...prev, activeIndex: nextIndex };
      });
    }, 50); // Update every 50ms for smooth highlighting
  }, []);

  // WAV creation helpers (Gemini AudioOutputService Line 157-256)
  const createWavFromPcm = useCallback(
    (pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array => {
      const pcmBytes = pcmData;
      const header = createWavHeader(sampleRate, bitsPerSample, numChannels, pcmBytes.length);
      const wavData = combineWavData(header, pcmBytes);
      console.log(
        `[VoiceCall] WAV created: ${wavData.length} bytes from PCM ${pcmBytes.length} bytes at ${sampleRate}Hz`
      );
      return wavData;
    },
    []
  );

  const createWavHeader = useCallback(
    (sampleRate: number, bitsPerSample: number, numChannels: number, dataLength: number): Uint8Array => {
      const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const buffer = new Uint8Array(44); // WAV header is 44 bytes
      const view = new DataView(buffer.buffer);

      // RIFF header
      buffer.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
      view.setUint32(4, 36 + dataLength, true); // ChunkSize
      buffer.set([0x57, 0x41, 0x56, 0x45], 8); // 'WAVE'

      // fmt subchunk
      buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // 'fmt '
      view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
      view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
      view.setUint16(22, numChannels, true); // NumChannels
      view.setUint32(24, sampleRate, true); // SampleRate
      view.setUint32(28, byteRate, true); // ByteRate
      view.setUint16(32, blockAlign, true); // BlockAlign
      view.setUint16(34, bitsPerSample, true); // BitsPerSample

      // data subchunk
      buffer.set([0x64, 0x61, 0x74, 0x61], 36); // 'data'
      view.setUint32(40, dataLength, true); // SubChunk2Size

      return buffer;
    },
    []
  );

  const combineWavData = useCallback((header: Uint8Array, pcmData: Uint8Array): Uint8Array => {
    const combinedLength = header.length + pcmData.length;
    const combinedBuffer = new Uint8Array(combinedLength);
    combinedBuffer.set(header, 0);
    combinedBuffer.set(pcmData, header.length);
    return combinedBuffer;
  }, []);

  // Play accumulated TTS audio (expo-av with proper audio session management)
  const playTTSAudio = useCallback(
    async (requestId?: string) => {
      // Save state before try block so it's accessible in catch
      const wasMuted = isMutedRef.current;
      const wasRecording = isRecordingRef.current;

      try {
        console.log(
          `[VoiceCall] playTTSAudio called: requestId=${requestId}, chunks=${ttsAudioChunksRef.current.length}`
        );

        if (ttsAudioChunksRef.current.length === 0) {
          console.log('[VoiceCall] No TTS audio chunks to play');
          setIsSpeaking(false);
          return;
        }

        // Following Gemini pattern: DON'T stop recording during TTS playback
        // allowsRecordingIOS: true allows both simultaneously
        // Just auto-mute to prevent echo
        if (wasRecording && !wasMuted) {
          console.log('[VoiceCall] Auto-muting microphone during TTS (recording continues)');
          setIsMuted(true);
        }

        // Concatenate all MP3 chunks (simpler approach)
        const totalLength = ttsAudioChunksRef.current.reduce((sum: number, chunk: Uint8Array) => sum + chunk.length, 0);
        console.log(
          `[VoiceCall] Concatenating ${ttsAudioChunksRef.current.length} MP3 chunks, total ${totalLength} bytes`
        );

        const concatenatedMp3 = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of ttsAudioChunksRef.current) {
          concatenatedMp3.set(chunk, offset);
          offset += chunk.length;
        }

        // Save as MP3 file directly
        const tempPath = `${FileSystem.cacheDirectory}tts_audio_${Date.now()}.mp3`;

        // Convert to base64
        let binaryString = '';
        const chunkSize = 8192;
        for (let i = 0; i < concatenatedMp3.length; i += chunkSize) {
          const chunk = concatenatedMp3.slice(i, Math.min(i + chunkSize, concatenatedMp3.length));
          binaryString += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const base64Audio = btoa(binaryString);
        console.log(`[VoiceCall] Writing MP3 audio to ${tempPath}, base64 length: ${base64Audio.length}`);

        await FileSystem.writeAsStringAsync(tempPath, base64Audio, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('[VoiceCall] MP3 audio file written successfully');

        // Stop previous audio if playing
        if (ttsSoundRef.current) {
          try {
            console.log('[VoiceCall] Stopping previous audio');
            await ttsSoundRef.current.stopAsync();
            await ttsSoundRef.current.unloadAsync();
          } catch (e) {
            console.log('[VoiceCall] Previous audio cleanup error (ignoring)');
          }
          ttsSoundRef.current = null;
        }

        // EXACT Gemini pattern (AudioOutputService.js Line 455-485)
        // Step 1: Create new Sound object
        console.log('[VoiceCall] Creating new Sound object');
        const sound = new Audio.Sound();

        // Step 2: Enable audio BEFORE loading
        await Audio.setIsEnabledAsync(true);

        // Step 3: Load sound (don't play yet)
        console.log('[VoiceCall] Loading sound file');
        await sound.loadAsync({ uri: tempPath }, { shouldPlay: false, progressUpdateIntervalMillis: 50 });
        console.log('[VoiceCall] Sound loaded successfully');

        ttsSoundRef.current = sound;

        // Step 4: Set up playback listener BEFORE playing
        const playbackRequestId = requestId || currentTtsRequestIdRef.current || 'tts_request';
        sound.setOnPlaybackStatusUpdate((updateStatus) => {
          if (updateStatus.isLoaded) {
            if (updateStatus.isPlaying && updateStatus.positionMillis % 1000 < 100) {
              const durationSec = Math.floor((updateStatus.durationMillis || 0) / 1000);
              console.log(`[VoiceCall] Playing: ${Math.floor(updateStatus.positionMillis / 1000)}s / ${durationSec}s`);
            }
            if (updateStatus.didJustFinish) {
              console.log('[VoiceCall] TTS playback finished');
              setIsSpeaking(false);
              ttsSoundRef.current = null;
              resetTtsHighlight();

              // Restore microphone (recording never stopped!)
              if (!wasMuted && wasRecording) {
                console.log('[VoiceCall] Auto-unmuting microphone after TTS');
                setIsMuted(false);
              }

              // Cleanup
              FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
              ttsRequestContextRef.current.delete(playbackRequestId);
              ttsSegmentsRef.current.delete(playbackRequestId);
            }
            // Gemini checks for errors (TypeScript: use type guard)
            if ('error' in updateStatus && updateStatus.error) {
              console.error('[VoiceCall] Playback error:', updateStatus.error);
              setIsSpeaking(false);
              resetTtsHighlight();
            }
          }
        });

        // Step 5: _playSoundObject pattern - configure audio right before playback
        console.log('[VoiceCall] Configuring audio for playback (Gemini _playSoundObject)');

        // Re-activate audio
        await Audio.setIsEnabledAsync(true);

        // First setAudioModeAsync (Gemini Line 275-284)
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          allowsRecordingIOS: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });
        console.log('[VoiceCall] First audio mode set');

        // Force speaker with InCallManager (Gemini Line 287-291)
        if (
          inCallManagerInitializedRef.current &&
          InCallManager &&
          typeof InCallManager.setForceSpeakerphoneOn === 'function'
        ) {
          try {
            InCallManager.setForceSpeakerphoneOn(true);
            console.log('[VoiceCall] Speaker forced ON (1st)');
          } catch (error) {
            console.warn('[VoiceCall] Failed to force speaker (1st):', error);
          }
        }

        // Second setAudioModeAsync (Gemini Line 294-302)
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          allowsRecordingIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });

        // Force speaker again (Gemini Line 306-308)
        if (InCallManager && typeof InCallManager.setForceSpeakerphoneOn === 'function') {
          try {
            InCallManager.setForceSpeakerphoneOn(true);
            console.log('[VoiceCall] Speaker forced ON (2nd)');
          } catch (error) {
            console.warn('[VoiceCall] Failed to force speaker (2nd):', error);
          }
        }

        console.log('[VoiceCall] Audio session configured (Gemini pattern)');

        // Set volume (Gemini Line 319)
        await sound.setVolumeAsync(1.0);
        console.log('[VoiceCall] Sound volume set to 1.0');

        // Check device volume (debugging)
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          console.log('[VoiceCall] Sound status before play:', {
            volume: status.volume,
            isMuted: status.isMuted,
            duration: status.durationMillis,
          });
        }

        // Start highlight animation
        startHighlightLoop(playbackRequestId);

        // Step 6: Play (Gemini Line 326)
        console.log('[VoiceCall] Playing audio');
        await sound.playAsync();
        ttsPlaybackStartRef.current = Date.now();
        console.log('[VoiceCall] Playback started successfully');

        // Clear chunks (Gemini does this after starting playback)
        ttsAudioChunksRef.current = [];
      } catch (error) {
        console.error('[VoiceCall] Failed to play TTS audio:', error);
        setIsSpeaking(false);
        ttsAudioChunksRef.current = [];
        resetTtsHighlight();

        // Restore microphone on error (recording never stopped)
        if (!wasMuted && wasRecording) {
          console.log('[VoiceCall] Restoring microphone after TTS error');
          setIsMuted(false);
        }
      }
    },
    [resetTtsHighlight, startHighlightLoop]
  );

  // Clear current suggestion (called when user uses or dismisses it)
  const clearSuggestion = useCallback(() => {
    setCurrentSuggestion(null);
  }, []);

  // Request TTS for a given text (plays suggestion audio)
  const requestTTS = useCallback(
    (text: string, language?: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('[VoiceCall] Cannot request TTS - WebSocket not connected');
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'request_tts',
          text,
          language: language || snapshot?.user.learningLang || 'en',
          source: 'suggestion',
          request_id: `tts_${Date.now()}`,
        })
      );
    },
    [snapshot?.user.learningLang]
  );

  // Request suggestion via WebSocket (with optional hint text)
  const requestSuggestion = useCallback(
    (text?: string): Promise<{ target_text: string; native_translation?: string; pronunciation?: string }> => {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket not connected'));
          return;
        }

        const requestId = text ? `hint_${Date.now()}` : `auto_${Date.now()}`;

        // Set up one-time listener for suggestion event
        const handleSuggestion = (event: MessageEvent) => {
          try {
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
              return;
            }
            const data = JSON.parse(event.data);
            if (data.t === 'suggestion' && data.request_id === requestId) {
              ws.removeEventListener('message', handleSuggestion);
              const payload = data.suggestion || (data.text ? { target_text: data.text } : { target_text: '' });
              resolve(payload);

              // Show as floating suggestion chip (not in chat)
              if (payload.target_text) {
                setCurrentSuggestion({
                  id: `sug-${Date.now()}`,
                  text: payload.target_text,
                  translation: payload.native_translation,
                  pronunciation: payload.pronunciation,
                  timestamp: Date.now(),
                });
              }
            }
          } catch {
            // Ignore parsing errors, keep listening
          }
        };

        ws.addEventListener('message', handleSuggestion);

        // Send request
        ws.send(
          JSON.stringify({
            type: 'request_suggestion',
            text: text || '',
            request_id: requestId,
          })
        );

        // Timeout after 15 seconds
        setTimeout(() => {
          ws.removeEventListener('message', handleSuggestion);
          reject(new Error('Suggestion request timeout'));
        }, 15000);
      });
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      AudioRecord.stop();

      // Stop InCallManager on cleanup
      if (inCallManagerInitializedRef.current && InCallManager && typeof InCallManager.stop === 'function') {
        try {
          InCallManager.stop();
          inCallManagerInitializedRef.current = false;
        } catch (error) {
          console.warn('[VoiceCall] Failed to stop InCallManager on cleanup:', error);
        }
      }

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (ttsHighlightIntervalRef.current) {
        clearInterval(ttsHighlightIntervalRef.current);
        ttsHighlightIntervalRef.current = null;
      }
      if (ttsSoundRef.current) {
        ttsSoundRef.current.stopAsync().catch(() => {});
        ttsSoundRef.current.unloadAsync().catch(() => {});
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    messages,
    isMuted,
    currentSuggestion,
    isSpeaking,
    ttsHighlight,
    conversationId,
    startRecording,
    stopRecording,
    toggleMute,
    clearSuggestion,
    requestSuggestion,
    requestTTS,
    stopSpeaking,
  };
}
