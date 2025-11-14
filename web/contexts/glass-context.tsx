'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { t } from '@lingui/core/macro';
import { useAccountSession } from '@/contexts/account-session-context';

export interface Message {
  type: 'user_message' | 'partner_message';
  message: {
    role: 'user' | 'partner';
    content: string;
  };
  receivedAt: Date;
  translation?: string;
  // Structured feedback attached to this utterance
  feedback?: {
    reason_native?: string;
    target_text?: string;
    pronunciation?: string;
    text?: string; // legacy/plain feedback
  };
  // Ephemeral live text for ongoing utterance (partial transcript)
  partial?: string;
  // Backend utterance identifier (segment id for final, active id for partial)
  utteranceId?: string;
  // Deepgram timing information
  start?: number; // Start time in seconds
  duration?: number; // Duration in seconds
}

export interface VoiceStatus {
  value: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'analyzing';
}

export type FeedbackMode = 'always' | 'auto' | 'off';
export type SuggestMode = 'always' | 'auto' | 'off';
export type SuggestionLengthMode = 'auto' | 'short' | 'long';

export interface LanguageSettings {
  learningLang: string; // Language user wants to learn
  nativeLang: string; // User's native language
}

export interface VoiceSettings {
  micDeviceId: string | null;
  feedbackMode: FeedbackMode;
  languages: LanguageSettings;
  suggestMode?: SuggestMode;
  suggestionLengthMode?: SuggestionLengthMode;
  countryCode?: string; // ISO country code
  proficiency?: 'cant_read' | 'can_read';
  pronunciationMode?: 'native' | 'romaji';
  aiMessageDurationSec?: number | null; // null = no time limit
  glassMode?: boolean;
  showManualSuggestButtons?: boolean;
}

export interface SessionConfig {
  languages: LanguageSettings;
  mode: 'practice' | 'real';
  scenario?: string; // For practice mode
}

export type StructuredSuggestion = {
  target_text: string;
  native_translation?: string;
  pronunciation?: string;
  target_lang?: string;
  native_lang?: string;
};

export type AISuggestion = {
  id: string;
  target_text: string;
  native_translation?: string;
  pronunciation?: string;
  timestamp: number;
};

export type AIFeedback = {
  id: string;
  text?: string;
  target_text?: string;
  pronunciation?: string;
  reason_native?: string;
  timestamp: number;
};

export type AITranslation = {
  id: string;
  target_text: string;
  native_translation?: string;
  pronunciation?: string;
  timestamp: number;
};

export interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
}

export interface ExtractedInfo {
  label: string;
  value: string;
  editable: boolean;
}

export interface ConversationAnalysis {
  sessionId: string;
  conversationId?: string; // DB conversation ID for fetching Zep memories
  scores: ConversationScores;
  extractedInfo: ExtractedInfo[];
  feedback: string;
  messages: Array<{
    speaker: string;
    source: string;
    text: string;
    utterance_id?: string;
    translation?: string;
  }>;
  feedbackItems: Array<{ utterance_id: string; text: string }>;
}

interface GlassContextValue {
  status: VoiceStatus;
  messages: Message[];
  isMuted: boolean;
  micFft: number[];
  settings: VoiceSettings;
  suggestions: AISuggestion[];
  feedbacks: AIFeedback[];
  translations: AITranslation[];
  conversationAnalysis: ConversationAnalysis | null;
  showSummary: boolean;
  budgetStatus: 'unknown' | 'enabled' | 'disabled';
  remainingSeconds?: number;
  totalSeconds?: number;
  startRemainingSeconds?: number;
  elapsedSeconds?: number;
  updateSettings: (partial: Partial<VoiceSettings>) => void;
  updateFeedbackMode: (mode: FeedbackMode) => void;
  updateSuggestMode: (mode: SuggestMode) => void;
  updateSuggestionLengthMode: (mode: SuggestionLengthMode) => void;
  connect: (config: SessionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  mute: () => void;
  unmute: () => void;
  requestSuggestion: (text?: string) => Promise<StructuredSuggestion>;
  setOnAISuggestion: (callback: (payload: any) => void) => void;
  addSuggestion: (payload: any) => void;
  removeSuggestion: (id: string) => void;
  addFeedback: (payload: any) => void;
  removeFeedback: (id: string) => void;
  addTranslation: (payload: any) => void;
  removeTranslation: (id: string) => void;
  getSuggestionRemainingMs: (id: string) => number;
  getFeedbackRemainingMs: (id: string) => number;
  getTranslationRemainingMs: (id: string) => number;
  pauseSuggestionTimer: (id: string) => void;
  resumeSuggestionTimer: (id: string) => void;
  pauseFeedbackTimer: (id: string) => void;
  resumeFeedbackTimer: (id: string) => void;
  pauseTranslationTimer: (id: string) => void;
  resumeTranslationTimer: (id: string) => void;
  speakText: (text: string) => Promise<void>;
  isSpeaking: boolean;
  stopSpeaking: () => void;
  closeSummary: () => void;
  startNewCallWithContext: (contextInfo: ExtractedInfo[]) => void;
  // Onboarding helpers
  loadDemoConversation: (
    msgs: Array<{
      role: 'user' | 'partner';
      content: string;
      translation?: string;
    }>
  ) => void;
}

const GlassContext = createContext<GlassContextValue | null>(null);

export function GlassProvider({
  children,
  onMessage,
  onError,
}: {
  children: React.ReactNode;
  onMessage?: () => void;
  onError?: (error: Error) => void;
}) {
  const router = useRouter();
  const { token: authToken, status: accountStatus } = useAccountSession();
  const authTokenRef = useRef<string | null>(null);
  const accountStatusRef = useRef<string>('idle');
  useEffect(() => {
    authTokenRef.current = authToken ?? null;
    accountStatusRef.current = accountStatus;
  }, [authToken, accountStatus]);
  const [status, setStatus] = useState<VoiceStatus>({ value: 'idle' });
  const [messages, setMessages] = useState<Message[]>([]);

  // Debug: Log status changes
  useEffect(() => {
    console.log('[GlassContext] Status changed:', status.value);
  }, [status.value]);
  const [isMuted, setIsMuted] = useState(false);
  const [micFft, setMicFft] = useState<number[]>(new Array(24).fill(0));
  const [conversationAnalysis, setConversationAnalysis] = useState<ConversationAnalysis | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Debug: Log showSummary changes
  useEffect(() => {
    console.log('[GlassContext] showSummary changed:', showSummary, 'status:', status.value);
  }, [showSummary, status.value]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | undefined>(undefined);
  const [totalSeconds, setTotalSeconds] = useState<number | undefined>(undefined);
  const [startRemainingSeconds, setStartRemainingSeconds] = useState<number | undefined>(undefined);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | undefined>(undefined);
  const [budgetStatus, setBudgetStatus] = useState<'unknown' | 'enabled' | 'disabled'>('disabled');
  const serverRemainingRef = useRef<number | undefined>(undefined);
  const lastSyncTsRef = useRef<number | undefined>(undefined);
  const localTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRemainingRef = useRef<number | undefined>(undefined);
  const budgetProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    if (typeof window === 'undefined')
      return {
        micDeviceId: null,
        feedbackMode: 'auto',
        languages: { learningLang: 'en', nativeLang: 'ko' },
        suggestMode: 'off',
        suggestionLengthMode: 'auto',
        countryCode: undefined,
        proficiency: undefined,
        pronunciationMode: 'native',
        aiMessageDurationSec: null,
        glassMode: false,
        showManualSuggestButtons: false,
      };
    try {
      const raw = window.localStorage.getItem('glass:settings');
      if (raw) {
        const parsed = JSON.parse(raw) as VoiceSettings;
        return {
          micDeviceId: parsed.micDeviceId || null,
          feedbackMode: parsed.feedbackMode || 'auto',
          languages: parsed.languages || {
            learningLang: 'en',
            nativeLang: 'ko',
          },
          suggestMode: parsed.suggestMode || 'off',
          suggestionLengthMode: parsed.suggestionLengthMode || 'auto',
          countryCode: parsed.countryCode,
          proficiency: parsed.proficiency,
          pronunciationMode: parsed.pronunciationMode || 'native',
          aiMessageDurationSec: parsed.aiMessageDurationSec ?? null,
          glassMode: parsed.glassMode ?? false,
          showManualSuggestButtons: parsed.showManualSuggestButtons ?? false,
        };
      }
    } catch {}
    return {
      micDeviceId: null,
      feedbackMode: 'auto',
      languages: { learningLang: 'en', nativeLang: 'ko' },
      suggestMode: 'off',
      suggestionLengthMode: 'auto',
      countryCode: undefined,
      proficiency: undefined,
      pronunciationMode: 'native',
      aiMessageDurationSec: null,
      glassMode: false,
      showManualSuggestButtons: false,
    };
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [feedbacks, setFeedbacks] = useState<AIFeedback[]>([]);
  const [translations, setTranslations] = useState<AITranslation[]>([]);
  const pausedMapRef = useRef<Map<string, { paused: boolean; pausedAt: number; accumulated: number }>>(new Map());
  const feedbackPausedMapRef = useRef<Map<string, { paused: boolean; pausedAt: number; accumulated: number }>>(
    new Map()
  );
  const translationPausedMapRef = useRef<Map<string, { paused: boolean; pausedAt: number; accumulated: number }>>(
    new Map()
  );
  const onAISuggestionCallbackRef = useRef<((payload: any) => void) | undefined>();
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsAudioChunksRef = useRef<Uint8Array[]>([]);

  const setOnAISuggestion = useCallback((callback: (payload: any) => void) => {
    onAISuggestionCallbackRef.current = callback;
  }, []);

  const addSuggestion = useCallback((payload: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    const suggestion: AISuggestion = {
      id,
      target_text: String(payload?.target_text || ''),
      native_translation: payload?.native_translation ? String(payload.native_translation) : undefined,
      pronunciation: payload?.pronunciation ? String(payload.pronunciation) : undefined,
      timestamp,
    };
    // Clear previous suggestions and show only the new one
    setSuggestions([suggestion]);
  }, []);

  const addFeedback = useCallback((payload: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    const feedback: AIFeedback =
      typeof payload === 'object' && payload !== null
        ? {
            id,
            text: typeof payload.text === 'string' ? payload.text : undefined,
            target_text: typeof payload.target_text === 'string' ? payload.target_text : undefined,
            pronunciation: typeof payload.pronunciation === 'string' ? payload.pronunciation : undefined,
            reason_native: typeof payload.reason_native === 'string' ? payload.reason_native : undefined,
            timestamp,
          }
        : { id, text: String(payload || ''), timestamp };
    setFeedbacks((prev) => [...prev, feedback]);
  }, []);

  const addTranslation = useCallback((payload: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    const translation: AITranslation = {
      id,
      target_text: String(payload?.target_text || ''),
      native_translation: payload?.native_translation ? String(payload.native_translation) : undefined,
      pronunciation: payload?.pronunciation ? String(payload.pronunciation) : undefined,
      timestamp,
    };
    setTranslations((prev) => [...prev, translation]);
    // Clear all suggestions when translation result is added
    setSuggestions([]);
  }, []);

  const removeSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    pausedMapRef.current.delete(id);
  }, []);

  const removeFeedback = useCallback((id: string) => {
    setFeedbacks((prev) => prev.filter((f) => f.id !== id));
    feedbackPausedMapRef.current.delete(id);
  }, []);

  const removeTranslation = useCallback((id: string) => {
    setTranslations((prev) => prev.filter((t) => t.id !== id));
    translationPausedMapRef.current.delete(id);
  }, []);

  const getSuggestionRemainingMs = useCallback(
    (id: string): number => {
      const s = suggestions.find((x) => x.id === id);
      if (!s) return 0;
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const pausedInfo = pausedMapRef.current.get(id);
      const now = Date.now();
      const pausedDelta = pausedInfo
        ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
        : 0;
      const elapsed = now - (s.timestamp || 0) - pausedDelta;
      return Math.max(0, total - elapsed);
    },
    [suggestions, settings.aiMessageDurationSec]
  );

  const pauseSuggestionTimer = useCallback((id: string) => {
    const info = pausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (info.paused) return;
    info.paused = true;
    info.pausedAt = Date.now();
    pausedMapRef.current.set(id, info);
  }, []);

  const resumeSuggestionTimer = useCallback((id: string) => {
    const info = pausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (!info.paused) return;
    const now = Date.now();
    info.accumulated += Math.max(0, now - info.pausedAt);
    info.paused = false;
    info.pausedAt = 0;
    pausedMapRef.current.set(id, info);
  }, []);

  const getFeedbackRemainingMs = useCallback(
    (id: string): number => {
      const f = feedbacks.find((x) => x.id === id);
      if (!f) return 0;
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const pausedInfo = feedbackPausedMapRef.current.get(id);
      const now = Date.now();
      const pausedDelta = pausedInfo
        ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
        : 0;
      const elapsed = now - (f.timestamp || 0) - pausedDelta;
      return Math.max(0, total - elapsed);
    },
    [feedbacks, settings.aiMessageDurationSec]
  );

  const pauseFeedbackTimer = useCallback((id: string) => {
    const info = feedbackPausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (info.paused) return;
    info.paused = true;
    info.pausedAt = Date.now();
    feedbackPausedMapRef.current.set(id, info);
  }, []);

  const resumeFeedbackTimer = useCallback((id: string) => {
    const info = feedbackPausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (!info.paused) return;
    const now = Date.now();
    info.accumulated += Math.max(0, now - info.pausedAt);
    info.paused = false;
    info.pausedAt = 0;
    feedbackPausedMapRef.current.set(id, info);
  }, []);

  const getTranslationRemainingMs = useCallback(
    (id: string): number => {
      const t = translations.find((x) => x.id === id);
      if (!t) return 0;
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const pausedInfo = translationPausedMapRef.current.get(id);
      const now = Date.now();
      const pausedDelta = pausedInfo
        ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
        : 0;
      const elapsed = now - (t.timestamp || 0) - pausedDelta;
      return Math.max(0, total - elapsed);
    },
    [translations, settings.aiMessageDurationSec]
  );

  const pauseTranslationTimer = useCallback((id: string) => {
    const info = translationPausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (info.paused) return;
    info.paused = true;
    info.pausedAt = Date.now();
    translationPausedMapRef.current.set(id, info);
  }, []);

  const resumeTranslationTimer = useCallback((id: string) => {
    const info = translationPausedMapRef.current.get(id) || {
      paused: false,
      pausedAt: 0,
      accumulated: 0,
    };
    if (!info.paused) return;
    const now = Date.now();
    info.accumulated += Math.max(0, now - info.pausedAt);
    info.paused = false;
    info.pausedAt = 0;
    translationPausedMapRef.current.set(id, info);
  }, []);

  // Auto-remove expired suggestions in a loop that respects pause/resume
  useEffect(() => {
    const intervalId = setInterval(() => {
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const now = Date.now();
      setSuggestions((prev) => {
        let changed = false;
        const next = prev.filter((s) => {
          const pausedInfo = pausedMapRef.current.get(s.id);
          const pausedDelta = pausedInfo
            ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
            : 0;
          const elapsed = now - (s.timestamp || 0) - pausedDelta;
          const remaining = total - elapsed;
          if (remaining <= 0) {
            pausedMapRef.current.delete(s.id);
            changed = true;
            return false;
          }
          return true;
        });
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(intervalId);
  }, [settings.aiMessageDurationSec]);

  // Auto-remove expired feedbacks
  useEffect(() => {
    const intervalId = setInterval(() => {
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const now = Date.now();
      setFeedbacks((prev) => {
        let changed = false;
        const next = prev.filter((f) => {
          const pausedInfo = feedbackPausedMapRef.current.get(f.id);
          const pausedDelta = pausedInfo
            ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
            : 0;
          const elapsed = now - (f.timestamp || 0) - pausedDelta;
          const remaining = total - elapsed;
          if (remaining <= 0) {
            feedbackPausedMapRef.current.delete(f.id);
            changed = true;
            return false;
          }
          return true;
        });
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(intervalId);
  }, [settings.aiMessageDurationSec]);

  // Auto-remove expired translations
  useEffect(() => {
    const intervalId = setInterval(() => {
      const total = settings.aiMessageDurationSec ? Math.max(1, settings.aiMessageDurationSec) * 1000 : Infinity;
      const now = Date.now();
      setTranslations((prev) => {
        let changed = false;
        const next = prev.filter((t) => {
          const pausedInfo = translationPausedMapRef.current.get(t.id);
          const pausedDelta = pausedInfo
            ? pausedInfo.accumulated + (pausedInfo.paused ? Math.max(0, now - pausedInfo.pausedAt) : 0)
            : 0;
          const elapsed = now - (t.timestamp || 0) - pausedDelta;
          const remaining = total - elapsed;
          if (remaining <= 0) {
            translationPausedMapRef.current.delete(t.id);
            changed = true;
            return false;
          }
          return true;
        });
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(intervalId);
  }, [settings.aiMessageDurationSec]);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamingContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string>('');
  const processorNodesRef = useRef<ScriptProcessorNode[]>([]);
  const isMutedRef = useRef<boolean>(false);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIntentionalDisconnectRef = useRef<boolean>(false);
  const messagesRef = useRef<Message[]>([]);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const updateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('glass:settings', JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  }, []);

  const updateFeedbackMode = useCallback(
    (mode: FeedbackMode) => {
      updateSettings({ feedbackMode: mode });

      // Send update to backend if connected
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'set_feedback_mode',
            mode,
          })
        );
      }
    },
    [updateSettings]
  );

  const updateSuggestMode = useCallback(
    (mode: SuggestMode) => {
      updateSettings({ suggestMode: mode });

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'set_suggest_mode',
            mode,
          })
        );
      }
    },
    [updateSettings]
  );

  const updateSuggestionLengthMode = useCallback(
    (mode: SuggestionLengthMode) => {
      updateSettings({ suggestionLengthMode: mode });

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'set_suggest_length',
            mode,
          })
        );
      }
    },
    [updateSettings]
  );

  // Guard: if a WS error occurs, ignore any subsequent budget/time events
  const hasWsErrorRef = useRef(false);
  // Mark when WS has fully opened (used to differentiate initial connect vs active session)
  const hasOpenedRef = useRef(false);

  // Generate session ID
  const generateSessionId = useCallback(() => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Update FFT visualization
  const updateFFT = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const fftValues: number[] = [];
    const barCount = 24;
    const samplesPerBar = Math.floor(dataArray.length / barCount);

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < samplesPerBar; j++) {
        sum += dataArray[i * samplesPerBar + j];
      }
      fftValues.push(sum / samplesPerBar / 255);
    }

    setMicFft(fftValues);
    animationFrameRef.current = requestAnimationFrame(updateFFT);
  }, []);

  // Connect to Glass API
  const connect = useCallback(
    async (config: SessionConfig) => {
      const { languages, mode, scenario } = config;

      // Check if account session is ready
      if (accountStatusRef.current !== 'ready') {
        toast.error(t`Unable to connect`, {
          description: t`Please wait for session to load and try again.`,
        });
        return;
      }

      const token = authTokenRef.current;
      if (!token) {
        toast.error(t`Unable to connect`, {
          description: t`Authentication token not available. Please refresh the page.`,
        });
        return;
      }
      // Update settings with selected languages
      updateSettings({ languages });

      // Reset disconnect flag for new connection
      isIntentionalDisconnectRef.current = false;
      hasWsErrorRef.current = false;
      hasOpenedRef.current = false;

      try {
        setStatus({ value: 'connecting' });
        // Reset conversation state for a fresh session
        setMessages([]);
        // Clear any lingering AI overlays from previous sessions
        setSuggestions([]);
        setFeedbacks([]);
        setTranslations([]);

        // Load latest settings from localStorage
        let currentSettings = settings;
        try {
          if (typeof window !== 'undefined') {
            const raw = window.localStorage.getItem('glass:settings');
            if (raw) {
              currentSettings = JSON.parse(raw) as VoiceSettings;
            }
          }
        } catch {}

        // Generate session ID
        sessionIdRef.current = generateSessionId();

        // Request microphone access with selected device if provided
        const micConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        if (currentSettings.micDeviceId) {
          micConstraints.deviceId = {
            exact: currentSettings.micDeviceId,
          } as unknown as ConstrainDOMString;
        }
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints,
        });
        micStreamRef.current = micStream;

        // Request screen share with audio (only for Real Talk mode)
        let systemStream: MediaStream | null = null;
        let screenShareSkipped = false;
        let screenShareError: string | null = null;

        if (mode === 'real') {
          try {
            systemStream = await navigator.mediaDevices.getDisplayMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
              video: true, // video must be true for screen capture
            });

            // Check if audio track is present
            const audioTracks = systemStream.getAudioTracks();
            if (audioTracks.length === 0) {
              console.warn('Screen share selected without audio track');
              systemStream.getTracks().forEach((track) => track.stop());
              systemStream = null;
              screenShareSkipped = true;
              screenShareError = 'no_audio';
            } else {
              // Stop video tracks as we only need audio
              const videoTracks = systemStream.getVideoTracks();
              videoTracks.forEach((track) => track.stop());
              systemStreamRef.current = systemStream;
            }
          } catch (err: any) {
            // User cancelled or denied permission - don't retry
            screenShareSkipped = true;
            if (err.name === 'NotAllowedError') {
              console.log('Screen share permission denied by user');
              screenShareError = 'denied';
            } else if (err.name === 'AbortError') {
              console.log('Screen share cancelled by user');
              screenShareError = 'cancelled';
            } else {
              console.warn('Screen share not available:', err);
              screenShareError = 'failed';
            }
          }

          // If screen share was skipped in Real Talk mode, disconnect and show clear instructions
          if (screenShareSkipped) {
            // Clean up microphone stream
            if (micStreamRef.current) {
              micStreamRef.current.getTracks().forEach((track) => track.stop());
              micStreamRef.current = null;
            }
            setStatus({ value: 'disconnected' });

            // Show clear instruction message
            setTimeout(() => {
              toast.error(t`Screen audio sharing required`, {
                description: t`Please share your screen with audio from your call platform (Zoom, Google Meet, Teams).`,
                duration: 8000,
              });
            }, 100);
            return;
          }
        } else {
          // Practice mode: no screen share needed
          console.log('Practice mode: skipping screen share');
        }

        // Setup audio context for FFT visualization
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const micSource = audioContext.createMediaStreamSource(micStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        micSource.connect(analyser);
        analyserRef.current = analyser;

        // Start FFT animation
        updateFFT();

        // Connect WebSocket to Glass API with language parameters
        const wsUrl = process.env.NEXT_PUBLIC_GLASS_WS_URL || 'ws://localhost:8000';
        const params = new URLSearchParams({
          sid: sessionIdRef.current,
          events: 'true',
          learning_lang: languages.learningLang,
          native_lang: languages.nativeLang,
          mode: mode,
        });
        // Pass scenario at connect time so backend greets with the correct context
        if (scenario) {
          params.set('scenario', scenario);
        }
        params.set('auth_token', token);
        const ws = new WebSocket(`${wsUrl}/ws/audio-multi?${params.toString()}`);
        wsRef.current = ws;

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          console.log('WebSocket connected to Glass API');
          hasOpenedRef.current = true;
          setStatus({ value: 'connected' });
          // Assume budget unknown at connect; show skeleton for a short probe window
          setBudgetStatus('unknown');
          if (budgetProbeTimerRef.current) clearTimeout(budgetProbeTimerRef.current);
          budgetProbeTimerRef.current = setTimeout(() => {
            // If no time event arrived during probe, hide timer UI (no limit)
            setBudgetStatus((prev) => (prev === 'unknown' ? 'disabled' : prev));
          }, 2000);
          startAudioStreaming(ws, micStream, systemStream);
          // Initialize elapsed timer (client-side, 1s tick)
          try {
            // Reset start-remaining baseline at the beginning of a session
            setStartRemainingSeconds(undefined);
            startRemainingRef.current = undefined;
            setElapsedSeconds(0);
            if (elapsedTickRef.current) clearInterval(elapsedTickRef.current);
            elapsedTickRef.current = setInterval(() => {
              setElapsedSeconds((prev) => (typeof prev === 'number' ? prev + 1 : 1));
            }, 1000);
          } catch {}

          // Send settings to backend
          ws.send(
            JSON.stringify({
              type: 'set_feedback_mode',
              mode: currentSettings.feedbackMode,
            })
          );

          ws.send(
            JSON.stringify({
              type: 'set_suggest_mode',
              mode: currentSettings.suggestMode || 'off',
            })
          );

          ws.send(
            JSON.stringify({
              type: 'set_suggest_length',
              mode: currentSettings.suggestionLengthMode || 'auto',
            })
          );

          ws.send(
            JSON.stringify({
              type: 'session_config',
              learning_lang: languages.learningLang,
              native_lang: languages.nativeLang,
              mode: mode,
              scenario: scenario || null,
            })
          );

          // Send user profile (country, proficiency) so backend can tailor suggestions
          ws.send(
            JSON.stringify({
              type: 'set_profile',
              proficiency: currentSettings.proficiency || null,
              pronunciation_mode: currentSettings.pronunciationMode || 'native',
            })
          );

          // Send heartbeat every 20 seconds to keep connection alive
          heartbeatIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          // If we've already encountered a WS error, ignore any late events (e.g., budget/time)
          if (hasWsErrorRef.current) {
            return;
          }
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              // Limits (time-based only)
              if (data.t === 'limit_reached') {
                if (hasWsErrorRef.current) return;
                const reason = data.reason as 'time' | undefined;
                const receivedAnyTime = startRemainingRef.current !== undefined;
                if (reason === 'time') {
                  // Treat time limit as graceful end ONLY if we actually received time_remaining before
                  setBudgetStatus('enabled');
                  if (receivedAnyTime) {
                    try {
                      toast.info(t`Trial session ended due to time limit.`);
                    } catch {}
                    // Run End Call flow (analyze and show summary)
                    disconnect().catch(() => {});
                  } else {
                    // No time was available from the start → redirect to time-limit page
                    setStatus({ value: 'idle' });
                    try {
                      toast.info(t`You've used your free time`);
                    } catch {}
                    try {
                      ws.close();
                    } catch {}
                    try {
                      window.location.href = '/time-limit';
                    } catch {}
                  }
                }
                return;
              }
              handleServerMessage(data);
            } catch (err) {
              // Ignore non-JSON messages (could be ping/pong)
            }
          } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            // Handle TTS audio chunks
            handleTTSAudioChunk(event.data);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          hasWsErrorRef.current = true;
          onError?.(new Error('WebSocket connection error'));
        };

        ws.onclose = (event) => {
          console.log('[GlassContext] WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            isIntentional: isIntentionalDisconnectRef.current,
            hasError: hasWsErrorRef.current,
          });

          // Handle authentication failures
          if (event.code === 4401) {
            toast.error(t`Authentication failed`, {
              description: t`Please refresh the page and try again.`,
            });
            hasWsErrorRef.current = true;
            try {
              router.push('/failure');
            } catch {}
          }

          hasOpenedRef.current = false;
          // Only set disconnected status if this wasn't an intentional disconnect
          if (!isIntentionalDisconnectRef.current && !hasWsErrorRef.current) {
            console.log('[GlassContext] Setting status to disconnected (unintentional close)');
            setStatus({ value: 'disconnected' });
          } else {
            console.log('[GlassContext] Skipping status change (intentional disconnect or error)');
          }
          // Clear budget probe timer
          if (budgetProbeTimerRef.current) {
            clearTimeout(budgetProbeTimerRef.current);
            budgetProbeTimerRef.current = null;
          }
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          if (elapsedTickRef.current) {
            clearInterval(elapsedTickRef.current);
            elapsedTickRef.current = null;
          }
        };
      } catch (error) {
        console.error('Failed to connect:', error);
        setStatus({ value: 'disconnected' });
        hasWsErrorRef.current = true;
        onError?.(error as Error);
        try {
          router.push('/failure');
        } catch {}
        try {
          wsRef.current?.close();
        } catch {}
        throw error;
      }
    },
    [generateSessionId, updateFFT, onError]
  );

  // Handle TTS audio chunks
  const handleTTSAudioChunk = useCallback(async (data: ArrayBuffer | Blob) => {
    try {
      const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
      const uint8Array = new Uint8Array(arrayBuffer);
      ttsAudioChunksRef.current.push(uint8Array);
    } catch (error) {
      console.error('Failed to handle TTS audio chunk:', error);
    }
  }, []);

  // Handle messages from Glass API
  const handleServerMessage = useCallback(
    (data: any) => {
      // Handle TTS events
      if (data.t === 'tts_start') {
        setIsSpeaking(true);
        ttsAudioChunksRef.current = [];
        return;
      }

      if (data.t === 'tts_end') {
        playTTSAudio();
        return;
      }

      if (data.t === 'tts_error') {
        console.error('TTS error:', data.error);
        setIsSpeaking(false);
        ttsAudioChunksRef.current = [];
        return;
      }

      // Log all events for debugging
      if (data.t === 'utterance_end' || data.t === 'translation') {
        console.log('Received event:', data.t, data);
      }

      // Time remaining events
      if (data.t === 'time_remaining') {
        const secs = typeof data.seconds === 'number' ? data.seconds : undefined;
        const total = typeof data.total === 'number' ? data.total : undefined;
        setBudgetStatus('enabled');
        // On first receipt during a session, capture the starting remaining seconds (guarded by ref)
        if (typeof secs === 'number' && startRemainingRef.current === undefined) {
          startRemainingRef.current = secs;
          setStartRemainingSeconds(secs);
        }
        if (typeof secs === 'number') {
          serverRemainingRef.current = secs;
          lastSyncTsRef.current = Date.now();
          setRemainingSeconds(secs);
        }
        if (typeof total === 'number') setTotalSeconds(total);
        return;
      }

      // PARTIAL TRANSCRIPT: ephemeral overlay per utterance (simple overwrite)
      if (data.t === 'partial_transcript') {
        const text = (data.text || '').trim();
        if (!text) return;

        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        // Determine role from source
        let role: 'user' | 'partner' = 'partner';
        if (data.role) {
          role = data.role === 'user' ? 'user' : 'partner';
        } else if (data.source) {
          role =
            data.source === 'mic' || (typeof data.source === 'string' && data.source.startsWith('mic_'))
              ? 'user'
              : 'partner';
        } else if (data.speaker) {
          role = data.speaker === 'user' ? 'user' : 'partner';
        }

        const isSpeechFinal = Boolean(data.speech_final);

        setMessages((prev) => {
          const next = [...prev];
          if (isSpeechFinal) {
            const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.partial);
            if (idx >= 0) next.splice(idx, 1);

            // Clear all suggestions when user's speech is final
            if (role === 'user') {
              setTimeout(() => {
                setSuggestions([]);
              }, 1000);
            }

            return next;
          }

          const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.message.role === role);
          if (idx >= 0) {
            const existing = next[idx];
            next[idx] = {
              ...existing,
              partial: text,
              receivedAt: new Date(),
              start: typeof data.start === 'number' ? data.start : existing.start,
              duration: typeof data.duration === 'number' ? data.duration : existing.duration,
            };
            return next;
          }

          next.push({
            type: role === 'user' ? 'user_message' : 'partner_message',
            message: { role, content: '' },
            receivedAt: new Date(),
            utteranceId,
            partial: text,
            start: typeof data.start === 'number' ? data.start : undefined,
            duration: typeof data.duration === 'number' ? data.duration : undefined,
          });
          return next;
        });
        onMessage?.();
        return;
      }

      // FINAL TRANSCRIPT: upsert final message for utterance (no concatenation)
      if (data.t === 'transcript') {
        const text = (data.text || '').trim();
        if (!text) return;

        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        // Auto-play TTS for AI responses when requested
        if (data.auto_tts && data.source === 'ai') {
          requestTTSForAI(text);
        }

        // Determine role from source
        let role: 'user' | 'partner' = 'partner';
        if (data.role) {
          role = data.role === 'user' ? 'user' : 'partner';
        } else if (data.source) {
          role =
            data.source === 'mic' || (typeof data.source === 'string' && data.source.startsWith('mic_'))
              ? 'user'
              : 'partner';
        } else if (data.speaker) {
          role = data.speaker === 'user' ? 'user' : 'partner';
        }

        const isSpeechFinal = Boolean(data.speech_final);

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.message.role === role);
          const translation = typeof data.translation === 'string' ? data.translation : undefined;

          if (idx >= 0) {
            // Update existing message
            const existing = next[idx];
            const prevText = (existing.message.content || '').trim();
            const newText = (text || '').trim();

            // If speech_final, replace to handle utterance boundary changes from ASR
            let finalContent: string;
            if (!isSpeechFinal && prevText) {
              // Continuing utterance - merge with appropriate spacing
              const needsSpace = !/[\.!?\u3002\uFF01\uFF1F]$/.test(prevText);
              finalContent = needsSpace ? `${prevText} ${newText}` : `${prevText} ${newText}`;
            } else {
              // Speech final or first segment - use new text as-is
              finalContent = newText;
            }

            next[idx] = {
              ...existing,
              message: { ...existing.message, content: finalContent },
              translation: translation ?? existing.translation,
              partial: undefined,
              receivedAt: new Date(),
              // Update timing information
              start: typeof data.start === 'number' ? data.start : existing.start,
              duration: typeof data.duration === 'number' ? data.duration : existing.duration,
            };
            return next;
          }

          // Create new message for this utterance
          next.push({
            type: role === 'user' ? 'user_message' : 'partner_message',
            message: { role, content: text },
            translation,
            receivedAt: new Date(),
            utteranceId,
            start: typeof data.start === 'number' ? data.start : undefined,
            duration: typeof data.duration === 'number' ? data.duration : undefined,
          });
          return next;
        });

        // Clear all suggestions when user's speech is final
        if (isSpeechFinal && role === 'user') {
          setTimeout(() => {
            setSuggestions([]);
          }, 1000);
        }

        onMessage?.();
        return;
      }

      // Handle translation events
      if (data.t === 'translation') {
        const utteranceId = data.utterance_id;
        const translation = data.text;

        if (!utteranceId || !translation) {
          return;
        }

        setMessages((prev) => {
          const next = [...prev];
          // Find message with this utterance_id
          const existingIndex = next.findIndex((msg) => msg.utteranceId === utteranceId);

          if (existingIndex >= 0) {
            // Update message with translation
            const existing = next[existingIndex];
            next[existingIndex] = {
              ...existing,
              translation: translation,
            };
            return next;
          }
          return next;
        });

        onMessage?.();
        return;
      }

      // Handle utterance end: clear any remaining partial overlay for that utterance
      if (data.t === 'utterance_end') {
        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        // Check if this is a user utterance by looking at the source
        const isUserUtterance =
          data.source === 'mic' || (typeof data.source === 'string' && data.source.startsWith('mic_'));

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.partial);
          if (idx >= 0) {
            next.splice(idx, 1);
          }
          return next;
        });

        // Clear all suggestions when user's utterance ends
        if (isUserUtterance) {
          setTimeout(() => {
            setSuggestions([]);
          }, 1000);
        }

        return;
      }

      // Handle feedback events - attach to the corresponding message (like translation)
      if (data.t === 'feedback') {
        const utteranceId = data.utterance_id as string | undefined;
        const suggestion = data.suggestion as
          | {
              reason_native?: string;
              target_text?: string;
              pronunciation?: string;
            }
          | undefined;
        const text = typeof data.text === 'string' ? data.text : undefined;
        const isAuto = data.auto === true;

        // If auto feedback, show as feedback bubble
        if (isAuto && suggestion) {
          addFeedback(suggestion);
        }

        // Also attach to message for transcript history
        if (utteranceId) {
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.utteranceId === utteranceId);
            if (idx >= 0) {
              const existing = next[idx];
              const feedback = suggestion
                ? {
                    reason_native: typeof suggestion.reason_native === 'string' ? suggestion.reason_native : undefined,
                    target_text: typeof suggestion.target_text === 'string' ? suggestion.target_text : undefined,
                    pronunciation: typeof suggestion.pronunciation === 'string' ? suggestion.pronunciation : undefined,
                  }
                : { text };
              next[idx] = {
                ...existing,
                feedback,
              };
              return next;
            }
            return next;
          });
        }
        return;
      }

      // Auto suggestions from backend
      if (data.t === 'suggestion' && data.auto) {
        const payload = data.suggestion || (data.text ? { target_text: data.text } : null);
        if (payload) addSuggestion(payload);
        if (payload && onAISuggestionCallbackRef.current) onAISuggestionCallbackRef.current(payload);
        return;
      }

      // Optional: Surface LLM responses as partner messages
      if (data.t === 'response') {
        const message: Message = {
          type: 'partner_message',
          message: {
            role: 'partner',
            content: data.text || data.content || '',
          },
          receivedAt: new Date(),
        };
        setMessages((prev) => [...prev, message]);
        onMessage?.();
        return;
      }
    },
    [onMessage]
  );

  // Stream audio to WebSocket
  const startAudioStreaming = useCallback((ws: WebSocket, micStream: MediaStream, systemStream: MediaStream | null) => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    streamingContextRef.current = audioContext;
    const micSource = audioContext.createMediaStreamSource(micStream);
    const micProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    micProcessor.onaudioprocess = (e) => {
      if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = convertFloat32ToPCM16(inputData);
        const payload = new Uint8Array(pcm16.length + 1);
        payload[0] = 0x01; // mic channel
        payload.set(pcm16, 1);
        ws.send(payload.buffer);
      }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(audioContext.destination);
    processorNodesRef.current.push(micProcessor);

    // Stream system audio if available
    if (systemStream) {
      const systemSource = audioContext.createMediaStreamSource(systemStream);
      const systemProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      systemProcessor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = convertFloat32ToPCM16(inputData);
          const payload = new Uint8Array(pcm16.length + 1);
          payload[0] = 0x02; // system channel
          payload.set(pcm16, 1);
          ws.send(payload.buffer);
        }
      };

      systemSource.connect(systemProcessor);
      systemProcessor.connect(audioContext.destination);
      processorNodesRef.current.push(systemProcessor);
    }
  }, []);

  // Convert Float32 to PCM16
  const convertFloat32ToPCM16 = (float32Array: Float32Array): Uint8Array => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(pcm16.buffer);
  };

  // ---------------- Onboarding helpers ----------------
  const loadDemoConversation = useCallback(
    (
      msgs: Array<{
        role: 'user' | 'partner';
        content: string;
        translation?: string;
      }>
    ) => {
      const now = Date.now();
      const mapped: Message[] = msgs.map((m, i) => ({
        type: m.role === 'user' ? 'user_message' : 'partner_message',
        message: { role: m.role, content: m.content },
        translation: m.translation,
        receivedAt: new Date(now - (msgs.length - i) * 1000),
      }));
      setMessages(mapped);
    },
    []
  );

  // Disconnect
  const disconnect = useCallback(async () => {
    console.log('[GlassContext] disconnect() called');
    // Mark this as an intentional disconnect
    isIntentionalDisconnectRef.current = true;
    console.log('[GlassContext] Set isIntentionalDisconnectRef = true');

    // Stop elapsed timer
    if (localTickRef.current) {
      clearInterval(localTickRef.current);
      localTickRef.current = null;
    }
    // Also stop elapsed client-side ticker
    if (elapsedTickRef.current) {
      clearInterval(elapsedTickRef.current);
      elapsedTickRef.current = null;
    }

    // Stop FFT animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect processor nodes
    processorNodesRef.current.forEach((processor) => {
      processor.disconnect();
    });
    processorNodesRef.current = [];

    // Stop heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      console.log('[GlassContext] Closing WebSocket');
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop media streams
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((track) => track.stop());
      systemStreamRef.current = null;
    }

    // Close audio contexts
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamingContextRef.current) {
      streamingContextRef.current.close();
      streamingContextRef.current = null;
    }

    setMicFft(new Array(24).fill(0));

    // Backend auto-saves conversation when WebSocket disconnects
    // Set to analyzing state and poll for results
    const currentSessionId = sessionIdRef.current;
    const currentMessages = messagesRef.current;
    const userMessages = currentMessages.filter((m) => m.message.role === 'user');
    const hasUserUtterances = userMessages.length > 0;

    console.log('[GlassContext] Disconnect analysis check:', {
      currentSessionId,
      isIntentional: isIntentionalDisconnectRef.current,
      totalMessages: currentMessages.length,
      userMessages: userMessages.length,
      hasUserUtterances,
    });

    // Always analyze if intentional disconnect, even without user utterances
    // Backend will handle the case of no user speech with appropriate message
    if (currentSessionId && isIntentionalDisconnectRef.current) {
      console.log('[GlassContext] Call ended. Conversation is being analyzed:', currentSessionId);

      // Set to analyzing state to show loading screen
      console.log('[GlassContext] Setting status to analyzing');
      setStatus({ value: 'analyzing' });

      // Poll for conversation analysis results
      const startPolling = async () => {
        const maxAttempts = 20; // 20 attempts * 1 second = 20 seconds max
        let attempts = 0;

        const poll = async () => {
          attempts++;

          try {
            // Check if we have auth token
            if (!authTokenRef.current) {
              console.log('[GlassContext] No auth token, skipping poll');
              if (attempts < maxAttempts) {
                setTimeout(poll, 1000);
              } else {
                // Timeout - just show toast and return to idle
                setStatus({ value: 'idle' });
                toast.success(t`Conversation saved`, {
                  description: t`Your conversation has been saved and is now available in History.`,
                });
                // Reset the flag on no-auth timeout
                isIntentionalDisconnectRef.current = false;
              }
              return;
            }

            // Fetch recent conversations to find our session
            const { fetchConversationSummaries } = await import('@/lib/account-api');
            const response = await fetchConversationSummaries(authTokenRef.current, {
              limit: 5,
              offset: 0,
            });

            // Find conversation with matching session_id
            const conversation = response.conversations.find((conv: any) => conv.sessionId === currentSessionId);

            if (conversation) {
              console.log('[GlassContext] Found saved conversation:', conversation.id);

              // Fetch full conversation details including memories
              const { fetchConversationDetail } = await import('@/lib/account-api');
              const detail = await fetchConversationDetail(authTokenRef.current, conversation.id);

              // Build ConversationAnalysis from the saved conversation
              const analysis: ConversationAnalysis = {
                sessionId: detail.sessionId,
                conversationId: conversation.id, // Add DB conversation ID for Zep memory fetch
                scores: (detail.scores as any) || { fluency: 0, accuracy: 0, comprehensibility: 0 },
                extractedInfo: (detail.extractedInfo as any) || [],
                feedback: detail.feedback || '',
                messages: (detail.messages as any) || [],
                feedbackItems: [], // Not stored in DB currently
              };

              setConversationAnalysis(analysis);
              setShowSummary(true);
              // Keep status as 'analyzing' so the conversation screen remains visible behind the modal
              // The modal will overlay on top of the conversation screen

              // Reset the intentional disconnect flag now that analysis is complete
              isIntentionalDisconnectRef.current = false;
            } else if (attempts < maxAttempts) {
              // Not found yet, continue polling
              console.log(`[GlassContext] Conversation not ready yet, attempt ${attempts}/${maxAttempts}`);
              setTimeout(poll, 1000);
            } else {
              // Timeout - just show toast and return to idle
              console.log('[GlassContext] Polling timeout, conversation may still be processing');
              setStatus({ value: 'idle' });
              toast.success(t`Conversation saved`, {
                description: t`Your conversation has been saved and is now available in History.`,
              });
              // Reset the flag on timeout
              isIntentionalDisconnectRef.current = false;
            }
          } catch (error) {
            console.error('[GlassContext] Error polling for conversation:', error);

            if (attempts < maxAttempts) {
              // Retry on error
              setTimeout(poll, 1000);
            } else {
              // Give up after max attempts
              setStatus({ value: 'idle' });
              toast.success(t`Conversation saved`, {
                description: t`Your conversation has been saved and is now available in History.`,
              });
              // Reset the flag on error timeout
              isIntentionalDisconnectRef.current = false;
            }
          }
        };

        // Start polling after a short delay to give backend time to start processing
        setTimeout(poll, 2000);
      };

      startPolling();
    } else {
      // No conversation to analyze (e.g., instant disconnect or no messages)
      console.log('[GlassContext] Skipping analysis - returning to idle state');
      setStatus({ value: 'idle' });
      // Reset the flag only when not analyzing
      isIntentionalDisconnectRef.current = false;
    }

    // Don't reset isIntentionalDisconnectRef here if we're analyzing
    // It will be reset when summary is closed or after polling times out
  }, []);

  // Mute/Unmute
  const mute = useCallback(() => {
    setIsMuted(true);
    isMutedRef.current = true;
  }, []);
  const unmute = useCallback(() => {
    setIsMuted(false);
    isMutedRef.current = false;
  }, []);

  // Request suggestion via WebSocket (with or without hint)
  const requestSuggestion = useCallback((text?: string): Promise<StructuredSuggestion> => {
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
          const data = JSON.parse(event.data);
          if (data.t === 'suggestion' && data.request_id === requestId) {
            ws.removeEventListener('message', handleSuggestion);
            const payload = data.suggestion || (data.text ? { target_text: data.text } : { target_text: '' });
            resolve(payload);
          }
        } catch (e) {
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
  }, []);

  // Play accumulated TTS audio
  const playTTSAudio = useCallback(async () => {
    try {
      if (ttsAudioChunksRef.current.length === 0) {
        setIsSpeaking(false);
        return;
      }

      // Concatenate all chunks
      const totalLength = ttsAudioChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
      const concatenated = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of ttsAudioChunksRef.current) {
        concatenated.set(chunk, offset);
        offset += chunk.length;
      }

      // Initialize audio context if needed
      if (!ttsAudioContextRef.current) {
        // Handle prefixed webkitAudioContext without using 'any'
        const Ctor: typeof AudioContext = (() => {
          if (typeof window !== 'undefined' && 'AudioContext' in window && window.AudioContext) {
            return window.AudioContext;
          }
          // @ts-expect-error - webkitAudioContext is not in TS lib typings
          if (typeof window !== 'undefined' && window.webkitAudioContext) {
            // @ts-expect-error - webkitAudioContext is not in TS lib typings
            return window.webkitAudioContext as typeof AudioContext;
          }
          return AudioContext;
        })();
        ttsAudioContextRef.current = new Ctor();
      }

      const audioContext = ttsAudioContextRef.current;

      // Decode audio data (ElevenLabs returns MP3)
      const audioBuffer = await audioContext.decodeAudioData(concatenated.buffer);

      // Stop previous audio if playing
      if (ttsAudioSourceRef.current) {
        try {
          ttsAudioSourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
      }

      // Create and play audio source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
      };

      ttsAudioSourceRef.current = source;
      source.start(0);

      // Clear chunks
      ttsAudioChunksRef.current = [];
    } catch (error) {
      console.error('Failed to play TTS audio:', error);
      setIsSpeaking(false);
      ttsAudioChunksRef.current = [];
    }
  }, []);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (ttsAudioSourceRef.current) {
      try {
        ttsAudioSourceRef.current.stop();
        ttsAudioSourceRef.current = null;
      } catch (e) {
        // Ignore if already stopped
      }
    }
    setIsSpeaking(false);
    ttsAudioChunksRef.current = [];
  }, []);

  // Smooth local countdown between server updates
  useEffect(() => {
    // Start ticking when connected and we have a server baseline
    if (status.value === 'connected' && serverRemainingRef.current !== undefined) {
      if (localTickRef.current) clearInterval(localTickRef.current);
      localTickRef.current = setInterval(() => {
        const base = serverRemainingRef.current ?? 0;
        const t0 = lastSyncTsRef.current ?? Date.now();
        const elapsed = Math.max(0, Math.floor((Date.now() - t0) / 1000));
        const smooth = Math.max(0, base - elapsed);
        setRemainingSeconds((prev) => {
          // Only update if it actually changes to avoid extra renders
          return prev !== smooth ? smooth : prev;
        });
      }, 1000);
    }
    return () => {
      if (localTickRef.current) {
        clearInterval(localTickRef.current);
        localTickRef.current = null;
      }
    };
  }, [status.value]);

  // Request TTS for text
  const speakText = useCallback(
    async (text: string, voiceId?: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      if (isSpeaking) {
        stopSpeaking();
      }

      ws.send(
        JSON.stringify({
          type: 'request_tts',
          text: text,
          voice_id: voiceId,
          request_id: Math.random().toString(36).substr(2, 9),
        })
      );
    },
    [isSpeaking, stopSpeaking]
  );

  // Request TTS for AI voice (auto-play)
  const requestTTSForAI = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Use AI voice ID (Male voice)
    ws.send(
      JSON.stringify({
        type: 'request_tts',
        text: text,
        voice_id: 'iP95p4xoKVk53GoZ742B', // Male AI voice
        request_id: 'ai_' + Math.random().toString(36).substr(2, 9),
      })
    );
  }, []);

  // Close summary
  const closeSummary = useCallback(() => {
    setShowSummary(false);
    setConversationAnalysis(null);
    // Return to idle status to show start screen
    setStatus({ value: 'idle' });
    // Clear ephemeral AI overlays when returning to idle
    setSuggestions([]);
    setFeedbacks([]);
    setTranslations([]);
    // Reset the flag
    isIntentionalDisconnectRef.current = false;
  }, []);

  // Start new call after saving to waitlist
  const startNewCallWithContext = useCallback((contextInfo: ExtractedInfo[]) => {
    // Close summary and return to start screen
    // (Context is not actually saved, just sent to waitlist API for Discord notification)
    setShowSummary(false);
    setConversationAnalysis(null);
    // Return to idle status to show start screen
    setStatus({ value: 'idle' });
    // Reset the flag
    isIntentionalDisconnectRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Call disconnect without awaiting (fire and forget)
      disconnect().catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: GlassContextValue = {
    status,
    messages,
    isMuted,
    micFft,
    settings,
    suggestions,
    feedbacks,
    translations,
    conversationAnalysis,
    showSummary,
    budgetStatus,
    updateSettings,
    updateFeedbackMode,
    updateSuggestMode,
    updateSuggestionLengthMode,
    connect,
    disconnect,
    mute,
    unmute,
    requestSuggestion,
    setOnAISuggestion,
    addSuggestion,
    removeSuggestion,
    addFeedback,
    removeFeedback,
    addTranslation,
    removeTranslation,
    getSuggestionRemainingMs,
    getFeedbackRemainingMs,
    getTranslationRemainingMs,
    pauseSuggestionTimer,
    resumeSuggestionTimer,
    pauseFeedbackTimer,
    resumeFeedbackTimer,
    pauseTranslationTimer,
    resumeTranslationTimer,
    speakText,
    isSpeaking,
    stopSpeaking,
    closeSummary,
    startNewCallWithContext,
    remainingSeconds,
    totalSeconds,
    startRemainingSeconds,
    elapsedSeconds,
    loadDemoConversation,
  };

  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}

export function useGlass() {
  const context = useContext(GlassContext);
  if (!context) {
    throw new Error('useGlass must be used within GlassProvider');
  }
  return context;
}
