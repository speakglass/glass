'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/utils/toast';
import { t } from '@lingui/core/macro';
import { useAccountSession } from '@/contexts/account-session-context';
import type {
  ConversationFeedbackItem,
  ConversationMessage,
  ConversationPartnerRef,
  ConversationScores,
  Memory,
} from '@/lib/account-api';
import { createConversationSession } from '@/lib/account-api';
import type { LearningLevel } from '@/types/learning-level';
import { isLearningLevel } from '@/types/learning-level';

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
    error_type?: string;
  };
  // Ephemeral live text for ongoing utterance (partial transcript)
  partial?: string;
  // Backend utterance identifier (segment id for final, active id for partial)
  utteranceId?: string;
  // Deepgram timing information
  start?: number; // Start time in seconds
  duration?: number; // Duration in seconds
  end?: number; // End timestamp in seconds
  latencyMs?: number; // Latency in milliseconds
  completedBy?: string;
}

export interface VoiceStatus {
  value: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'analyzing';
}

export type FeedbackMode = 'always' | 'auto' | 'off';
export type SuggestMode = 'always' | 'auto' | 'off';
export type SuggestionLengthMode = 'auto' | 'short' | 'long';
type MicRestartReason = 'settings_change' | 'device_change' | 'track_ended' | 'manual';

type BufferedAudioPacket = {
  packet: ArrayBuffer;
  samples: number;
  cursor: number;
  source: 'mic' | 'system';
};

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
  languageLevel?: LearningLevel;
  pronunciationMode?: 'native' | 'romaji';
  aiMessageDurationSec?: number | null; // null = no time limit
  showManualSuggestButtons?: boolean;
}

export interface SessionConfig {
  languages: LanguageSettings;
  mode: 'roleplay' | 'live_call';
  partnerId?: string | null;
  partner?: RoleplayPartnerProfile | null;
  screenStream?: MediaStream | null;
  spokenLanguages?: { user: string; partner: string } | null;
  userNativeLanguage?: string | null;
}

export interface RoleplayPartnerProfile {
  id: string;
  name: string;
  description?: string | null;
  descriptionTranslation?: string | null;
  avatarUrl?: string | null;
  voiceId?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  personaBackground?: string | null;
  personaBackgroundTranslation?: string | null;
  personaInterests?: string | null;
  personaInterestsTranslation?: string | null;
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
  error_type?: string;
  timestamp: number;
};

export type AITranslation = {
  id: string;
  target_text: string;
  native_translation?: string;
  pronunciation?: string;
  timestamp: number;
};

export type TTSWordSegment = {
  text: string;
  start_ms: number;
  end_ms: number;
  char_start: number;
  char_end: number;
};

export interface TTSHighlightState {
  requestId: string;
  context: 'ai_message' | 'suggestion';
  targetId: string;
  segments: TTSWordSegment[];
  activeIndex: number;
}

const DEFAULT_CONVERSATION_SCORES: ConversationScores = {
  fluency: 0,
  accuracy: 0,
  comprehensibility: 0,
};

export interface ConversationAnalysis {
  sessionId: string;
  conversationId?: string; // DB conversation ID for fetching Zep memories
  scores: ConversationScores;
  feedback: string;
  messages: ConversationMessage[];
  feedbackItems: ConversationFeedbackItem[];
  memories: Memory[];
  durationSeconds?: number | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  partner?: ConversationPartnerRef | null;
}

interface GlassContextValue {
  status: VoiceStatus;
  messages: Message[];
  sessionMode: 'roleplay' | 'live_call';
  conversationPartner: RoleplayPartnerProfile | null;
  isMuted: boolean;
  micFft: number[];
  settings: VoiceSettings;
  suggestions: AISuggestion[];
  feedbacks: AIFeedback[];
  translations: AITranslation[];
  conversationAnalysis: ConversationAnalysis | null;
  showSummary: boolean;
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
  speakText: (text: string, opts?: { context?: 'suggestion'; targetId?: string }) => Promise<void>;
  isSpeaking: boolean;
  stopSpeaking: () => void;
  ttsHighlight: TTSHighlightState | null;
  closeSummary: () => void;
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
  const { token: authToken, status: accountStatus, snapshot, refresh: refreshAccountSession } = useAccountSession();
  const authTokenRef = useRef<string | null>(null);
  const accountStatusRef = useRef<string>('idle');
  useEffect(() => {
    authTokenRef.current = authToken ?? null;
    accountStatusRef.current = accountStatus;
  }, [authToken, accountStatus]);

  const ensureAuthToken = useCallback(async () => {
    if (authTokenRef.current) {
      return authTokenRef.current;
    }
    const refreshed = await refreshAccountSession();
    if (refreshed?.token) {
      authTokenRef.current = refreshed.token;
      return refreshed.token;
    }
    const error = new Error('Authentication token not available');
    (error as Error & { code?: string }).code = 'AUTH_TOKEN_UNAVAILABLE';
    throw error;
  }, [refreshAccountSession]);

  const runWithAuthToken = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      const execute = async (allowRetry: boolean): Promise<T> => {
        const token = await ensureAuthToken();
        try {
          return await operation(token);
        } catch (error) {
          const statusCode = typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : null;
          if (allowRetry && statusCode === 401) {
            const refreshed = await refreshAccountSession();
            if (refreshed?.token) {
              authTokenRef.current = refreshed.token;
              return execute(false);
            }
          }
          throw error;
        }
      };
      return execute(true);
    },
    [ensureAuthToken, refreshAccountSession]
  );
  const [status, setStatus] = useState<VoiceStatus>({ value: 'idle' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionMode, setSessionMode] = useState<'roleplay' | 'live_call'>('live_call');
  const sessionModeRef = useRef<'roleplay' | 'live_call'>(sessionMode);
  const [conversationPartner, setConversationPartner] = useState<RoleplayPartnerProfile | null>(null);

  // Debug: Log status changes
  useEffect(() => {
    console.log('[GlassContext] Status changed:', status.value);
  }, [status.value]);
  useEffect(() => {
    sessionModeRef.current = sessionMode;
  }, [sessionMode]);
  const [isMuted, setIsMuted] = useState(false);
  const [micFft, setMicFft] = useState<number[]>(new Array(24).fill(0));
  const [conversationAnalysis, setConversationAnalysis] = useState<ConversationAnalysis | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Debug: Log showSummary changes
  useEffect(() => {
    console.log('[GlassContext] showSummary changed:', showSummary, 'status:', status.value);
  }, [showSummary, status.value]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | undefined>(undefined);
  const elapsedTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    if (typeof window === 'undefined')
      return {
        micDeviceId: null,
        feedbackMode: 'auto',
        languages: { learningLang: 'en', nativeLang: 'ko' },
        suggestMode: 'off',
        suggestionLengthMode: 'auto',
        countryCode: undefined,
        languageLevel: undefined,
        pronunciationMode: 'native',
        aiMessageDurationSec: null,
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
          languageLevel: isLearningLevel(parsed.languageLevel) ? parsed.languageLevel : undefined,
          pronunciationMode: parsed.pronunciationMode || 'native',
          aiMessageDurationSec: parsed.aiMessageDurationSec ?? null,
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
      languageLevel: undefined,
      pronunciationMode: 'native',
      aiMessageDurationSec: null,
      showManualSuggestButtons: false,
    };
  });
  const profileLanguageLevel = snapshot?.user?.languageLevel ?? null;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
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
  const [ttsHighlight, setTtsHighlight] = useState<TTSHighlightState | null>(null);
  const ttsRequestContextRef = useRef(
    new Map<string, { context: 'ai_message' | 'suggestion'; targetId: string }>()
  );
  const ttsSegmentsRef = useRef(new Map<string, TTSWordSegment[]>());
  const currentTtsRequestIdRef = useRef<string | null>(null);
  const ttsPlaybackStateRef = useRef<
    | {
        requestId: string;
        startedAt: number;
        audioContextStart: number;
        audioContext: AudioContext;
        segments?: TTSWordSegment[];
        context?: { context: 'ai_message' | 'suggestion'; targetId: string };
      }
    | null
  >(null);
  const ttsHighlightRafRef = useRef<number | null>(null);
  const lastHighlightIndexRef = useRef<number>(-1);
  const ttsPlaybackEnabledRef = useRef(true);

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
    const errorType =
      typeof payload?.error_type === 'string' ? String(payload.error_type) : undefined;
    if (errorType && errorType.toLowerCase() === 'none') {
      return;
    }
    const feedback: AIFeedback =
      typeof payload === 'object' && payload !== null
        ? {
            id,
            text: typeof payload.text === 'string' ? payload.text : undefined,
            target_text: typeof payload.target_text === 'string' ? payload.target_text : undefined,
            pronunciation: typeof payload.pronunciation === 'string' ? payload.pronunciation : undefined,
            reason_native: typeof payload.reason_native === 'string' ? payload.reason_native : undefined,
            error_type: errorType,
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
  const micAudioCursorRef = useRef(0);
  const systemAudioCursorRef = useRef(0);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const screenShareTrackCleanupRef = useRef<(() => void) | null>(null);
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
  const micTrackCleanupRef = useRef<(() => void) | null>(null);
  const shouldAutoRecoverMicRef = useRef(false);
  const isRestartingMicRef = useRef(false);
  const micPreferenceRef = useRef<string | null>(settings.micDeviceId ?? null);
  const previousMicSettingRef = useRef<string | null>(settings.micDeviceId ?? null);
  const restartMicStreamRef = useRef<((targetDeviceId?: string | null, reason?: MicRestartReason) => void) | null>(
    null
  );
  const disconnectRef = useRef<(() => Promise<void>) | null>(null);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    micPreferenceRef.current = settings.micDeviceId ?? null;
  }, [settings.micDeviceId]);

  const updateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (partial.languageLevel !== undefined) {
        next.languageLevel = isLearningLevel(partial.languageLevel) ? partial.languageLevel : undefined;
      }
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('glass:settings', JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  }, []);
  useEffect(() => {
    const profileLearning = snapshot?.user?.learningLang || null;
    const profileNative = snapshot?.user?.nativeLang || null;
    if (!profileLearning && !profileNative) {
      return;
    }
    const currentLanguages = settings.languages || { learningLang: 'en', nativeLang: 'ko' };
    const nextLanguages = {
      learningLang: profileLearning || currentLanguages.learningLang,
      nativeLang: profileNative || currentLanguages.nativeLang,
    };
    if (
      nextLanguages.learningLang === currentLanguages.learningLang &&
      nextLanguages.nativeLang === currentLanguages.nativeLang
    ) {
      return;
    }
    updateSettings({ languages: nextLanguages });
  }, [settings.languages, snapshot?.user?.learningLang, snapshot?.user?.nativeLang, updateSettings]);

  useEffect(() => {
    if (!isLearningLevel(profileLanguageLevel)) return;
    if (settings.languageLevel === profileLanguageLevel) return;
    updateSettings({ languageLevel: profileLanguageLevel });
  }, [profileLanguageLevel, settings.languageLevel, updateSettings]);

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

  // Guard: if a WS error occurs, ignore any subsequent events
  const hasWsErrorRef = useRef(false);
  // Mark when WS has fully opened (used to differentiate initial connect vs active session)
  const hasOpenedRef = useRef(false);
  // Reconnect state
  const lastSessionConfigRef = useRef<SessionConfig | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowReconnectRef = useRef(false);
  const fatalWsErrorRef = useRef(false);
  const triggerReconnectRef = useRef<(() => void) | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;


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

  const acquireMicStream = useCallback(
    async (preferredDeviceId?: string | null) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Media devices API not available');
      }

      const buildConstraints = (deviceId?: string | null): MediaTrackConstraints => {
        const constraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        if (deviceId) {
          // Use exact device match when the user picked a specific microphone
          constraints.deviceId = { exact: deviceId } as ConstrainDOMString;
        }
        return constraints;
      };

      const tryAcquire = (deviceId?: string | null) =>
        navigator.mediaDevices.getUserMedia({ audio: buildConstraints(deviceId) });

      try {
        const stream = await tryAcquire(preferredDeviceId ?? null);
        const deviceId = stream.getAudioTracks()[0]?.getSettings()?.deviceId || preferredDeviceId || null;
        return { stream, deviceId };
      } catch (error: any) {
        if (preferredDeviceId) {
          console.warn('[GlassContext] Preferred microphone unavailable, falling back to default input', error);
          try {
            const fallbackStream = await tryAcquire(null);
            const fallbackDeviceId = fallbackStream.getAudioTracks()[0]?.getSettings()?.deviceId || null;
            updateSettings({ micDeviceId: null });
            micPreferenceRef.current = null;
            try {
              toast.info(t`Microphone changed`, {
                description: t`Selected mic is unavailable. Using the system default instead.`,
                duration: 4500,
              });
            } catch {}
            return { stream: fallbackStream, deviceId: fallbackDeviceId };
          } catch (fallbackError) {
            throw fallbackError;
          }
        }
        throw error;
      }
    },
    [updateSettings]
  );

  const rebuildMicAnalyser = useCallback(
    (stream: MediaStream) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const micSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      micSource.connect(analyser);
      analyserRef.current = analyser;

      updateFFT();
    },
    [updateFFT]
  );

  const transmitAudioChunk = useCallback((entry: BufferedAudioPacket, ws: WebSocket) => {
    const duration = entry.samples / 16000;
    ws.send(
      JSON.stringify({
        type: 'audio_chunk',
        cursor: entry.cursor,
        duration,
        sample_rate: 16000,
        encoding: 'pcm16',
        source: entry.source,
      })
    );
    ws.send(entry.packet);
  }, []);

  // Stream audio to WebSocket (continuous streaming; Deepgram handles VAD)
  const startAudioStreaming = useCallback(
    (ws: WebSocket, micStream: MediaStream, systemStream: MediaStream | null) => {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      streamingContextRef.current = audioContext;

      const actualSampleRate = audioContext.sampleRate;
      const micSource = audioContext.createMediaStreamSource(micStream);
      const micProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      const resampleRatio = actualSampleRate / 16000;
      const needsResampling = resampleRatio !== 1;

      micProcessor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
          let inputData = e.inputBuffer.getChannelData(0);
          if (needsResampling) {
            const targetLength = Math.floor(inputData.length / resampleRatio);
            const downsampled = new Float32Array(targetLength);
            for (let i = 0; i < targetLength; i++) {
              downsampled[i] = inputData[Math.floor(i * resampleRatio)];
            }
            inputData = downsampled;
          }
          const pcm16 = convertFloat32ToPCM16(inputData);
          const sampleCount = pcm16.length / 2;
          const startCursor = micAudioCursorRef.current;
          const durationSeconds = sampleCount / 16000;
          micAudioCursorRef.current = startCursor + durationSeconds;
          const payload = new Uint8Array(pcm16.length);
          payload.set(pcm16);
          const entry: BufferedAudioPacket = {
            packet: payload.buffer,
            samples: sampleCount,
            cursor: startCursor,
            source: 'mic',
          };
          try {
            transmitAudioChunk(entry, ws);
          } catch (err) {
            console.error('[GlassContext] Failed to send mic audio chunk', err);
          }
        }
      };

      micSource.connect(micProcessor);
      micProcessor.connect(audioContext.destination);
      processorNodesRef.current.push(micProcessor);

      if (systemStream) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        const systemProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        systemProcessor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            let inputData = e.inputBuffer.getChannelData(0);
            if (needsResampling) {
              const targetLength = Math.floor(inputData.length / resampleRatio);
              const downsampled = new Float32Array(targetLength);
              for (let i = 0; i < targetLength; i++) {
                downsampled[i] = inputData[Math.floor(i * resampleRatio)];
              }
              inputData = downsampled;
            }
            const pcm16 = convertFloat32ToPCM16(inputData);
            const sampleCount = pcm16.length / 2;
            const startCursor = systemAudioCursorRef.current;
            const durationSeconds = sampleCount / 16000;
            systemAudioCursorRef.current = startCursor + durationSeconds;
            const payload = new Uint8Array(pcm16.length);
            payload.set(pcm16);
            const entry: BufferedAudioPacket = {
              packet: payload.buffer,
              samples: sampleCount,
              cursor: startCursor,
              source: 'system',
            };
            transmitAudioChunk(entry, ws);
          }
        };
        systemSource.connect(systemProcessor);
        systemProcessor.connect(audioContext.destination);
        processorNodesRef.current.push(systemProcessor);
      }
    },
    [transmitAudioChunk]
  );


  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Handle TTS audio chunks
  const handleTTSAudioChunk = useCallback(async (data: ArrayBuffer | Blob) => {
    if (!ttsPlaybackEnabledRef.current) {
      return;
    }
    try {
      const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
      const uint8Array = new Uint8Array(arrayBuffer);
      ttsAudioChunksRef.current.push(uint8Array);
    } catch (error) {
      console.error('Failed to handle TTS audio chunk:', error);
    }
  }, []);

  const stopHighlightLoop = useCallback(() => {
    if (ttsHighlightRafRef.current !== null) {
      cancelAnimationFrame(ttsHighlightRafRef.current);
      ttsHighlightRafRef.current = null;
    }
  }, []);

  const resetTtsHighlight = useCallback(() => {
    stopHighlightLoop();
    lastHighlightIndexRef.current = -1;
    ttsPlaybackStateRef.current = null;
    setTtsHighlight(null);
  }, [stopHighlightLoop]);

  const cleanupTtsRequest = useCallback((requestId: string | null | undefined) => {
    if (!requestId) return;
    ttsRequestContextRef.current.delete(requestId);
    ttsSegmentsRef.current.delete(requestId);
    if (currentTtsRequestIdRef.current === requestId) {
      currentTtsRequestIdRef.current = null;
    }
  }, []);

  const startHighlightLoopForRequest = useCallback(
    (requestId: string) => {
      const playback = ttsPlaybackStateRef.current;
      if (!playback || playback.requestId !== requestId) {
        return;
      }
      const context = ttsRequestContextRef.current.get(requestId);
      const segments = ttsSegmentsRef.current.get(requestId);
      if (!context || !segments || segments.length === 0) {
        return;
      }

      playback.context = context;
      playback.segments = segments;
      lastHighlightIndexRef.current = -1;
      setTtsHighlight({
        requestId,
        context: context.context,
        targetId: context.targetId,
        segments,
        activeIndex: -1,
      });
      stopHighlightLoop();

      const tick = () => {
        const activePlayback = ttsPlaybackStateRef.current;
        if (!activePlayback || activePlayback.requestId !== requestId) {
          ttsHighlightRafRef.current = null;
          return;
        }
        const { audioContext, audioContextStart } = activePlayback;
        const elapsedMs = (audioContext.currentTime - audioContextStart) * 1000;
        const currentSegments = activePlayback.segments || segments;
        let nextIndex = -1;
        for (let i = 0; i < currentSegments.length; i += 1) {
          const seg = currentSegments[i];
          if (elapsedMs >= seg.start_ms && elapsedMs <= seg.end_ms) {
            nextIndex = i;
            break;
          }
        }
        if (
          nextIndex === -1 &&
          currentSegments.length > 0 &&
          elapsedMs > currentSegments[currentSegments.length - 1].end_ms
        ) {
          nextIndex = currentSegments.length;
        }
        if (nextIndex !== lastHighlightIndexRef.current) {
          lastHighlightIndexRef.current = nextIndex;
          setTtsHighlight((prev) => {
            if (!prev || prev.requestId !== requestId) {
              return {
                requestId,
                context: context.context,
                targetId: context.targetId,
                segments: currentSegments,
                activeIndex: nextIndex,
              };
            }
            if (prev.activeIndex === nextIndex) {
              return prev;
            }
            return { ...prev, activeIndex: nextIndex };
          });
        }
        ttsHighlightRafRef.current = requestAnimationFrame(tick);
      };

      ttsHighlightRafRef.current = requestAnimationFrame(tick);
    },
    [stopHighlightLoop]
  );

  // Handle messages from Glass API
  const handleServerMessage = useCallback(
    (data: any) => {
      // Handle TTS events
      if (data.t === 'tts_timing') {
        if (!ttsPlaybackEnabledRef.current) {
          return;
        }
        const requestId = typeof data.request_id === 'string' ? data.request_id : null;
        if (!requestId || !Array.isArray(data.segments)) {
          return;
        }
        const normalized: TTSWordSegment[] = [];
        for (const seg of data.segments) {
          if (!seg || typeof seg.text !== 'string') continue;
          const startMs = typeof seg.start_ms === 'number' ? seg.start_ms : 0;
          const endMs = typeof seg.end_ms === 'number' ? seg.end_ms : startMs;
          const charStart = typeof seg.char_start === 'number' ? seg.char_start : 0;
          const charEnd = typeof seg.char_end === 'number' ? seg.char_end : charStart + seg.text.length;
          normalized.push({
            text: seg.text,
            start_ms: Math.max(0, startMs),
            end_ms: Math.max(endMs, startMs),
            char_start: Math.max(0, charStart),
            char_end: Math.max(charEnd, charStart),
          });
        }
        if (normalized.length) {
          ttsSegmentsRef.current.set(requestId, normalized);
          startHighlightLoopForRequest(requestId);
        }
        return;
      }

      if (data.t === 'tts_start') {
        const requestId = typeof data.request_id === 'string' ? data.request_id : null;
        if (!ttsPlaybackEnabledRef.current) {
          cleanupTtsRequest(requestId);
          ttsAudioChunksRef.current = [];
          setIsSpeaking(false);
          return;
        }
        currentTtsRequestIdRef.current = requestId;
        resetTtsHighlight();
        setIsSpeaking(true);
        ttsAudioChunksRef.current = [];
        return;
      }

      if (data.t === 'tts_end') {
        const requestId = typeof data.request_id === 'string' ? data.request_id : undefined;
        if (!ttsPlaybackEnabledRef.current) {
          if (requestId) {
            cleanupTtsRequest(requestId);
          }
          ttsAudioChunksRef.current = [];
          setIsSpeaking(false);
          return;
        }
        playTTSAudio(requestId);
        return;
      }

      if (data.t === 'tts_error') {
        const requestId = typeof data.request_id === 'string' ? data.request_id : currentTtsRequestIdRef.current;
        if (!ttsPlaybackEnabledRef.current) {
          cleanupTtsRequest(requestId);
          ttsAudioChunksRef.current = [];
          setIsSpeaking(false);
          return;
        }
        console.error('TTS error:', data.error);
        setIsSpeaking(false);
        ttsAudioChunksRef.current = [];
        resetTtsHighlight();
        cleanupTtsRequest(requestId);
        return;
      }

      // Log all events for debugging
      if (data.t === 'utterance_completed' || data.t === 'translation') {
        console.log('Received event:', data.t, data);
      }

      // PARTIAL TRANSCRIPT: ephemeral overlay per utterance (simple overwrite)
      if (data.t === 'transcript_interim') {
        const text = (data.text || '').trim();
        if (!text) return;

        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        const start = typeof data.start === 'number' ? data.start : undefined;
        const duration =
          typeof data.duration === 'number'
            ? data.duration
            : typeof start === 'number' && typeof data.end === 'number'
              ? data.end - start
              : undefined;

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

        if (role === 'user' && sessionModeRef.current === 'roleplay' && isSpeakingRef.current) {
          // Stop AI voice immediately when the user interrupts during roleplay
          stopSpeaking();
        }

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.message.role === role);
          if (idx >= 0) {
            const existing = next[idx];
            next[idx] = {
              ...existing,
              partial: text,
              receivedAt: new Date(),
              start: start ?? existing.start,
              duration: duration ?? existing.duration,
            };
            return next;
          }

          next.push({
            type: role === 'user' ? 'user_message' : 'partner_message',
            message: { role, content: '' },
            receivedAt: new Date(),
            utteranceId,
            partial: text,
            start,
            duration,
          });
          return next;
        });
        onMessage?.();
        return;
      }

      // FINAL TRANSCRIPT: upsert final message for utterance (no concatenation)
      if (data.t === 'transcript_final') {
        const text = (data.text || '').trim();
        if (!text) return;

        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        const start = typeof data.start === 'number' ? data.start : undefined;
        const duration =
          typeof data.duration === 'number'
            ? data.duration
            : typeof start === 'number' && typeof data.end === 'number'
              ? data.end - start
              : undefined;
        const end =
          typeof data.end === 'number'
            ? data.end
            : typeof start === 'number' && typeof duration === 'number'
              ? start + duration
              : undefined;
        const latencyMs = typeof data.latency_ms === 'number' ? data.latency_ms : undefined;
        const completedBy = typeof data.completed_by === 'string' ? data.completed_by : undefined;

        // Auto-play TTS for AI responses when requested
        if (data.auto_tts && data.source === 'ai') {
          const voiceId = data.voice_id; // Use voice_id from event if available
          requestTTSForAI(text, voiceId, utteranceId);
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

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.utteranceId === utteranceId && m.message.role === role);
          const translation = typeof data.translation === 'string' ? data.translation : undefined;

          if (idx >= 0) {
            // Update existing message
            const existing = next[idx];
            next[idx] = {
              ...existing,
              message: { ...existing.message, content: text },
              translation: translation ?? existing.translation,
              partial: undefined,
              receivedAt: new Date(),
              // Update timing information
              start: start ?? existing.start,
              duration: duration ?? existing.duration,
              end: end ?? existing.end,
              latencyMs: latencyMs ?? existing.latencyMs,
              completedBy: completedBy ?? existing.completedBy,
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
            start,
            duration,
            end,
            latencyMs,
            completedBy,
          });
          return next;
        });

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

      // Handle utterance completion: finalize any remaining partial overlay and clear suggestions
      if (data.t === 'utterance_completed') {
        const utteranceId = data.utterance_id;
        if (!utteranceId) return;

        // Check if this is a user utterance by looking at the source
        const isUserUtterance =
          data.source === 'mic' || (typeof data.source === 'string' && data.source.startsWith('mic_'));

        const start = typeof data.start === 'number' ? data.start : undefined;
        const end = typeof data.end === 'number' ? data.end : undefined;
        const duration =
          typeof data.duration === 'number'
            ? data.duration
            : typeof start === 'number' && typeof end === 'number'
              ? end - start
              : undefined;
        const latencyMs = typeof data.latency_ms === 'number' ? data.latency_ms : undefined;
        const completedBy = typeof data.completed_by === 'string' ? data.completed_by : undefined;
        const fallbackText = typeof data.text === 'string' ? data.text : undefined;

        // Determine role from source for fallback creation
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

        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.utteranceId === utteranceId);
          if (idx >= 0) {
            const existing = next[idx];
            next[idx] = {
              ...existing,
              partial: undefined,
              latencyMs: latencyMs ?? existing.latencyMs,
              completedBy: completedBy ?? existing.completedBy,
              start: start ?? existing.start,
              duration: duration ?? existing.duration,
              end: end ?? existing.end,
              message:
                fallbackText && !existing.message.content
                  ? { ...existing.message, content: fallbackText }
                  : existing.message,
            };
            return next;
          }

          if (fallbackText) {
            next.push({
              type: role === 'user' ? 'user_message' : 'partner_message',
              message: { role, content: fallbackText },
              receivedAt: new Date(),
              utteranceId,
              start,
              duration,
              end,
              latencyMs,
              completedBy,
            });
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
              error_type?: string;
            }
          | undefined;
        const text = typeof data.text === 'string' ? data.text : undefined;
        const isAuto = data.auto === true;
        const errorType =
          suggestion && typeof suggestion.error_type === 'string' ? suggestion.error_type : undefined;
        const isNoneError = (errorType || '').toLowerCase() === 'none';

        // If auto feedback, show as feedback bubble
        if (isAuto && suggestion && !isNoneError) {
          addFeedback(suggestion);
        }

        // Also attach to message for transcript history
        if (utteranceId && (!isNoneError || text)) {
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
                    error_type: errorType,
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

  const stopStreaming = useCallback(() => {
    processorNodesRef.current.forEach((processor) => {
      try {
        processor.disconnect();
      } catch {}
    });
    processorNodesRef.current = [];
    if (streamingContextRef.current) {
      try {
        streamingContextRef.current.close();
      } catch {}
      streamingContextRef.current = null;
    }
    micAudioCursorRef.current = 0;
    systemAudioCursorRef.current = 0;
  }, []);

  // Connect to Glass API
  const connect = useCallback(
    async (config: SessionConfig, options?: { resume?: boolean }) => {
      const { languages, mode, partner, partnerId, screenStream, spokenLanguages, userNativeLanguage } = config;
      const resume = options?.resume ?? false;
      lastSessionConfigRef.current = { ...config, screenStream: undefined };
      allowReconnectRef.current = true;
      fatalWsErrorRef.current = false;
      ttsPlaybackEnabledRef.current = true;
      setSessionMode(mode);
      setConversationPartner(partner ?? null);

      if (accountStatusRef.current !== 'ready') {
        toast.error(t`Unable to connect`, {
          description: t`Please wait for session to load and try again.`,
        });
        return;
      }

      updateSettings({ languages });
      isIntentionalDisconnectRef.current = false;
      hasWsErrorRef.current = false;
      hasOpenedRef.current = false;

      try {
        const token = await ensureAuthToken();
        setStatus({ value: 'connecting' });
        if (!resume) {
          setMessages([]);
          setSuggestions([]);
          setFeedbacks([]);
          setTranslations([]);
        }

        let currentSettings = settings;
        try {
          if (typeof window !== 'undefined') {
            const raw = window.localStorage.getItem('glass:settings');
            if (raw) {
              currentSettings = JSON.parse(raw) as VoiceSettings;
            }
          }
        } catch {}

        try {
          if (!resume || !sessionIdRef.current) {
            sessionIdRef.current = await runWithAuthToken((tokenValue) => createConversationSession(tokenValue));
          }
        } catch (error) {
          console.error('[GlassContext] Failed to create conversation session', error);
          toast.error(t`Unable to start conversation`, {
            description: t`Please sign in again.`,
          });
          setStatus({ value: 'disconnected' });
          return;
        }

        if (
          !resume ||
          !micStreamRef.current ||
          micStreamRef.current.getAudioTracks().every((t) => t.readyState !== 'live')
        ) {
          const { stream: micStream } = await acquireMicStream(currentSettings.micDeviceId);
          micStreamRef.current = micStream;
          shouldAutoRecoverMicRef.current = true;
          attachMicTrackMonitor(micStream);
        }

        let systemStream: MediaStream | null = systemStreamRef.current;
        let screenShareSkipped = false;
        let screenShareError: string | null = null;

        if (mode === 'live_call') {
          const attachScreenShareStream = (incoming: MediaStream | null): MediaStream | null => {
            if (!incoming) {
              return null;
            }
            const audioTracks = incoming.getAudioTracks();
            if (audioTracks.length === 0) {
              console.warn('Screen share selected without audio track');
              incoming.getTracks().forEach((track) => track.stop());
              return null;
            }

            const videoTracks = incoming.getVideoTracks();
            videoTracks.forEach((track) => track.stop());
            const cleanupExisting = screenShareTrackCleanupRef.current;
            if (cleanupExisting) {
              cleanupExisting();
              screenShareTrackCleanupRef.current = null;
            }

            const handleScreenShareEnded = () => {
              console.log('[GlassContext] Screen share audio stopped - disconnecting call');
              const cleanup = screenShareTrackCleanupRef.current;
              if (cleanup) {
                screenShareTrackCleanupRef.current = null;
                cleanup();
              }
              toast.info(t`Screen share stopped`, {
                description: t`Ending the call because screen sharing ended.`,
              });
              const fn = disconnectRef.current;
              if (fn) {
                fn().catch((err) => {
                  console.error('[GlassContext] Failed to disconnect after screen share ended', err);
                });
              }
            };

            audioTracks.forEach((track) => {
              track.addEventListener('ended', handleScreenShareEnded);
            });

            screenShareTrackCleanupRef.current = () => {
              audioTracks.forEach((track) => {
                track.removeEventListener('ended', handleScreenShareEnded);
              });
            };

            systemStreamRef.current = incoming;
            return incoming;
          };

          if (screenStream) {
            const prepared = attachScreenShareStream(screenStream);
            if (prepared) {
              systemStream = prepared;
            } else {
              screenShareSkipped = true;
              screenShareError = 'no_audio';
            }
          }

          const isSystemStreamLive = systemStream?.getAudioTracks().some((track) => track.readyState === 'live');
          if (!isSystemStreamLive && !screenShareSkipped) {
            try {
              const capturedStream = await navigator.mediaDevices.getDisplayMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: true,
              });

              const prepared = attachScreenShareStream(capturedStream);
              if (prepared) {
                systemStream = prepared;
              } else {
                screenShareSkipped = true;
                screenShareError = 'no_audio';
              }
            } catch (err: any) {
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
          }

          if (screenShareSkipped) {
            shouldAutoRecoverMicRef.current = false;
            detachMicTrackMonitor();
            if (micStreamRef.current) {
              micStreamRef.current.getTracks().forEach((track) => track.stop());
              micStreamRef.current = null;
            }
            setStatus({ value: 'disconnected' });
            setTimeout(() => {
              toast.error(t`Screen audio sharing required`, {
                description: t`Please share your screen with audio from your call platform (Zoom, Google Meet, Teams).`,
                duration: 8000,
              });
            }, 100);
            return;
          }
        } else {
          console.log('Roleplay mode: skipping screen share');
        }

        if (micStreamRef.current) {
          rebuildMicAnalyser(micStreamRef.current);
        }

        const apiUrl = process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';
        const wsUrl = apiUrl.replace(/^http/, 'ws');
        const sessionNativeLang =
          userNativeLanguage ||
          languages.nativeLang ||
          snapshot?.user.nativeLang ||
          settings.languages?.nativeLang ||
          settings.languages?.learningLang ||
          'en';
        const partnerSpokenLang =
          spokenLanguages?.partner ||
          languages.learningLang ||
          snapshot?.user.learningLang ||
          sessionNativeLang;
        const userSpokenLang = spokenLanguages?.user || sessionNativeLang;
        const params = new URLSearchParams({
          sid: sessionIdRef.current,
          events: 'true',
          learning_lang: partnerSpokenLang,
          native_lang: sessionNativeLang,
          mode: mode,
        });
        const initialPartnerId = partnerId || partner?.id || null;
        if (initialPartnerId) {
          params.set('partner_id', initialPartnerId);
        }
        if (userSpokenLang) {
          params.set('user_spoken_lang', userSpokenLang);
        }
        if (partnerSpokenLang) {
          params.set('partner_spoken_lang', partnerSpokenLang);
        }
        params.set('auth_token', token);
        const ws = new WebSocket(`${wsUrl}/ws/audio?${params.toString()}`);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = async () => {
          try {
            console.log('WebSocket connected to Glass API');
            hasOpenedRef.current = true;
            reconnectAttemptsRef.current = 0;
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            setStatus({ value: 'connected' });
            micAudioCursorRef.current = 0;
            systemAudioCursorRef.current = 0;
            ws.send(
              JSON.stringify({
                type: 'client_init',
                session_id: sessionIdRef.current,
                sample_rate: 16000,
                encoding: 'pcm16',
                vad_chunk_duration: 4096 / 16000,
              })
            );
            if (micStreamRef.current) {
              startAudioStreaming(ws, micStreamRef.current, systemStream);
            }
            try {
              if (!resume) {
                setElapsedSeconds(0);
              }
              if (elapsedTickRef.current) clearInterval(elapsedTickRef.current);
              elapsedTickRef.current = setInterval(() => {
                setElapsedSeconds((prev) => (typeof prev === 'number' ? prev + 1 : 1));
              }, 1000);
            } catch {}

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
                learning_lang: partnerSpokenLang,
                native_lang: sessionNativeLang,
                mode: mode,
                partner_id: partnerId || partner?.id || null,
                user_spoken_lang: userSpokenLang,
                partner_spoken_lang: partnerSpokenLang,
              })
            );
            ws.send(
              JSON.stringify({
                type: 'set_profile',
                language_level: currentSettings.languageLevel || null,
                pronunciation_mode: currentSettings.pronunciationMode || 'native',
              })
            );

            heartbeatIntervalRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
              }
            }, 20000);
          } catch (err) {
            console.error('[GlassContext] Failed to initialize voice session', err);
            toast.error(t`Unable to connect`, {
              description: t`Voice stream failed to initialize. Please try again.`,
            });
            try {
              ws.close();
            } catch {}
          }
        };

        ws.onmessage = (event) => {
          if (hasWsErrorRef.current && fatalWsErrorRef.current) {
            return;
          }
          if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              handleServerMessage(data);
            } catch (err) {}
          } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
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

          if (event.code === 4401) {
            toast.error(t`Authentication failed`, {
              description: t`Please refresh the page and try again.`,
            });
            hasWsErrorRef.current = true;
            fatalWsErrorRef.current = true;
            try {
              router.push('/failure');
            } catch {}
          }
          if (event.code === 4403) {
            toast.error(t`Saved call limit reached`, {
              description: t`Delete older history or upgrade your plan to continue.`,
            });
            hasWsErrorRef.current = true;
            fatalWsErrorRef.current = true;
          }

          hasOpenedRef.current = false;
          if (!isIntentionalDisconnectRef.current && !fatalWsErrorRef.current) {
            console.log('[GlassContext] Attempting auto-reconnect (unintentional close)');
            setStatus({ value: 'disconnected' });
            stopStreaming();
            if (heartbeatIntervalRef.current) {
              clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = null;
            }
            if (elapsedTickRef.current) {
              clearInterval(elapsedTickRef.current);
              elapsedTickRef.current = null;
            }
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            if (triggerReconnectRef.current) {
              triggerReconnectRef.current();
            }
          } else {
            console.log('[GlassContext] Skipping status change (intentional disconnect or error)');
            if (heartbeatIntervalRef.current) {
              clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = null;
            }
            if (elapsedTickRef.current) {
              clearInterval(elapsedTickRef.current);
              elapsedTickRef.current = null;
            }
          }
        };
      } catch (error) {
        console.error('Failed to connect:', error);
        setStatus({ value: 'disconnected' });
        hasWsErrorRef.current = true;
        shouldAutoRecoverMicRef.current = false;
        detachMicTrackMonitor();
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
    [
      updateFFT,
      onError,
      acquireMicStream,
      rebuildMicAnalyser,
      startAudioStreaming,
      handleServerMessage,
      handleTTSAudioChunk,
      router,
      settings,
      stopStreaming,
      ensureAuthToken,
      runWithAuthToken,
    ]
  );

  const handleAutoReconnect = useCallback(() => {
    if (!allowReconnectRef.current || !lastSessionConfigRef.current) {
      return;
    }
    if (isIntentionalDisconnectRef.current || fatalWsErrorRef.current) {
      return;
    }

    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.warn('[GlassContext] Max reconnect attempts reached. Giving up.');
      setStatus({ value: 'disconnected' });
      return;
    }
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    console.log(`[GlassContext] Scheduling reconnect attempt ${attempt} in ${delay}ms`);
    setStatus({ value: 'connecting' });
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      connect(lastSessionConfigRef.current!, { resume: true }).catch((error) => {
        console.error('[GlassContext] Reconnect attempt failed', error);
        handleAutoReconnect();
      });
    }, delay);
  }, [clearReconnectTimer, connect]);

  useEffect(() => {
    triggerReconnectRef.current = handleAutoReconnect;
    return () => {
      clearReconnectTimer();
    };
  }, [handleAutoReconnect, clearReconnectTimer]);

  const restartMicStream = useCallback(
    async (targetDeviceId?: string | null, reason: MicRestartReason = 'manual') => {
      if (isRestartingMicRef.current) {
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      isRestartingMicRef.current = true;
      const preferredDeviceId = typeof targetDeviceId === 'undefined' ? micPreferenceRef.current : targetDeviceId;

      try {
        console.log(`[GlassContext] Restarting microphone stream (reason=${reason})`);
        const { stream: newMicStream } = await acquireMicStream(preferredDeviceId ?? null);
        shouldAutoRecoverMicRef.current = true;

        detachMicTrackMonitor();
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        micStreamRef.current = newMicStream;
        attachMicTrackMonitor(newMicStream);

        rebuildMicAnalyser(newMicStream);

        stopStreaming();
        startAudioStreaming(ws, newMicStream, systemStreamRef.current);
      } catch (err) {
        console.error('[GlassContext] Failed to restart microphone stream', err);
        toast.error(t`Unable to access microphone`, {
          description: t`Please re-enable microphone permissions or choose another input device.`,
        });
      } finally {
        isRestartingMicRef.current = false;
      }
    },
    [acquireMicStream, rebuildMicAnalyser, startAudioStreaming, stopStreaming]
  );

  restartMicStreamRef.current = restartMicStream;

  useEffect(() => {
    const nextPreference = settings.micDeviceId ?? null;
    if (previousMicSettingRef.current === nextPreference) {
      return;
    }
    previousMicSettingRef.current = nextPreference;
    if (status.value !== 'connected') {
      return;
    }
    restartMicStream(nextPreference, 'settings_change');
  }, [settings.micDeviceId, status.value, restartMicStream]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return;
    }

    const handleDeviceChange = () => {
      if (!shouldAutoRecoverMicRef.current || status.value !== 'connected') {
        return;
      }
      const track = micStreamRef.current?.getAudioTracks()[0];
      if (track && track.readyState === 'live') {
        return;
      }
      restartMicStream(micPreferenceRef.current ?? null, 'device_change');
    };

    if (typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }

    const previousHandler = navigator.mediaDevices.ondevicechange;
    navigator.mediaDevices.ondevicechange = (event: Event) => {
      previousHandler?.call(navigator.mediaDevices, event);
      handleDeviceChange();
    };

    return () => {
      navigator.mediaDevices.ondevicechange = previousHandler;
    };
  }, [restartMicStream, status.value]);

  function detachMicTrackMonitor() {
    if (micTrackCleanupRef.current) {
      micTrackCleanupRef.current();
      micTrackCleanupRef.current = null;
    }
  }

  function attachMicTrackMonitor(stream: MediaStream) {
    detachMicTrackMonitor();
    const track = stream.getAudioTracks()[0];
    if (!track) return;

    const handleTrackEnded = () => {
      if (!shouldAutoRecoverMicRef.current) return;
      const restart = restartMicStreamRef.current;
      if (!restart) return;
      restart(micPreferenceRef.current ?? null, 'track_ended');
    };

    track.addEventListener('ended', handleTrackEnded);
    micTrackCleanupRef.current = () => {
      track.removeEventListener('ended', handleTrackEnded);
    };
  }

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
  const playTTSAudio = useCallback(
    async (requestId?: string) => {
      try {
        if (!ttsPlaybackEnabledRef.current) {
          ttsAudioChunksRef.current = [];
          setIsSpeaking(false);
          return;
      }
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

      const playbackRequestId = requestId ?? currentTtsRequestIdRef.current ?? 'tts_request';

      source.onended = () => {
        setIsSpeaking(false);
        ttsAudioSourceRef.current = null;
        resetTtsHighlight();
        cleanupTtsRequest(playbackRequestId);
      };

      ttsAudioSourceRef.current = source;
      source.start(0);
      ttsPlaybackStateRef.current = {
        requestId: playbackRequestId,
        startedAt: performance.now(),
        audioContextStart: audioContext.currentTime,
        audioContext,
      };
      startHighlightLoopForRequest(playbackRequestId);

      // Clear chunks
      ttsAudioChunksRef.current = [];
    } catch (error) {
      console.error('Failed to play TTS audio:', error);
      setIsSpeaking(false);
      ttsAudioChunksRef.current = [];
      resetTtsHighlight();
    }
    },
    [cleanupTtsRequest, resetTtsHighlight, startHighlightLoopForRequest]
  );

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
    resetTtsHighlight();
    cleanupTtsRequest(currentTtsRequestIdRef.current);
  }, [cleanupTtsRequest, resetTtsHighlight]);

  useEffect(() => {
    if (showSummary) {
      stopSpeaking();
    }
  }, [showSummary, stopSpeaking]);

  // Request TTS for text
  const speakText = useCallback(
    async (text: string, opts?: { voiceId?: string; context?: 'suggestion'; targetId?: string }) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      if (isSpeaking) {
        stopSpeaking();
      }

      const requestId = Math.random().toString(36).substr(2, 9);
      const contextType: 'suggestion' | undefined = opts?.context ?? 'suggestion';
      if (contextType) {
        const targetId = opts?.targetId ?? requestId;
        ttsRequestContextRef.current.set(requestId, { context: contextType, targetId });
      }

      ws.send(
        JSON.stringify({
          type: 'request_tts',
          text: text,
          voice_id: opts?.voiceId,
          request_id: requestId,
        })
      );
    },
    [isSpeaking, stopSpeaking]
  );

  // Request TTS for AI voice (auto-play)
  const requestTTSForAI = useCallback((text: string, voiceId?: string, utteranceId?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Use provided voice_id or fallback to default AI voice (Male voice)
    const requestId = 'ai_' + Math.random().toString(36).substr(2, 9);
    if (utteranceId) {
      ttsRequestContextRef.current.set(requestId, { context: 'ai_message', targetId: utteranceId });
    }
    ws.send(
      JSON.stringify({
        type: 'request_tts',
        text: text,
        voice_id: voiceId || 'iP95p4xoKVk53GoZ742B', // Use provided voice_id or default Male AI voice
        request_id: requestId,
      })
    );
  }, []);

  // Close summary
  const closeSummary = useCallback(() => {
    stopSpeaking();
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
  }, [stopSpeaking]);

  // Disconnect
  const disconnect = useCallback(async () => {
    console.log('[GlassContext] disconnect() called');
    isIntentionalDisconnectRef.current = true;
    console.log('[GlassContext] Set isIntentionalDisconnectRef = true');
    allowReconnectRef.current = false;
    fatalWsErrorRef.current = false;
    clearReconnectTimer();
    shouldAutoRecoverMicRef.current = false;
    ttsPlaybackEnabledRef.current = false;
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end_call' }));
      }
    } catch (err) {
      console.error('[GlassContext] Failed to send end_call signal', err);
    }
    detachMicTrackMonitor();
    const cleanupScreenShareListener = screenShareTrackCleanupRef.current;
    if (cleanupScreenShareListener) {
      screenShareTrackCleanupRef.current = null;
      cleanupScreenShareListener();
    }

    if (elapsedTickRef.current) {
      clearInterval(elapsedTickRef.current);
      elapsedTickRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    stopStreaming();
    stopSpeaking();

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      console.log('[GlassContext] Closing WebSocket');
      wsRef.current.close();
      wsRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((track) => track.stop());
      systemStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setMicFft(new Array(24).fill(0));
    setSessionMode('live_call');
    setConversationPartner(null);

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

    if (currentSessionId && isIntentionalDisconnectRef.current) {
      console.log('[GlassContext] Call ended. Conversation is being analyzed:', currentSessionId);
      setStatus({ value: 'analyzing' });

      const startPolling = async () => {
        const maxAttempts = 20;
        let attempts = 0;

        const poll = async () => {
          attempts++;

          try {
            const { fetchConversationSummaries } = await import('@/lib/account-api');
            const response = await runWithAuthToken((tokenValue) =>
              fetchConversationSummaries(tokenValue, {
                limit: 5,
                offset: 0,
              })
            );

            const conversation = response.conversations.find((conv: any) => conv.sessionId === currentSessionId);

            if (conversation) {
              console.log('[GlassContext] Found saved conversation:', conversation.id);
              const { fetchConversationDetail } = await import('@/lib/account-api');
              const detail = await runWithAuthToken((tokenValue) =>
                fetchConversationDetail(tokenValue, conversation.id)
              );

              const resolvedScores = detail.scores ?? { ...DEFAULT_CONVERSATION_SCORES };
              const analysis: ConversationAnalysis = {
                sessionId: detail.sessionId,
                conversationId: conversation.id,
                scores: resolvedScores,
                feedback: detail.feedback || '',
                messages: detail.messages || [],
                feedbackItems: detail.feedbackItems ?? [],
                memories: detail.memories ?? [],
                durationSeconds: detail.durationSeconds ?? null,
                learningLang: detail.learningLang ?? null,
                nativeLang: detail.nativeLang ?? null,
                partner: detail.partner ?? null,
              };

              setConversationAnalysis(analysis);
              setShowSummary(true);
              isIntentionalDisconnectRef.current = false;
            } else if (attempts < maxAttempts) {
              console.log(`[GlassContext] Conversation not ready yet, attempt ${attempts}/${maxAttempts}`);
              setTimeout(poll, 1000);
            } else {
              console.log('[GlassContext] Polling timeout, conversation may still be processing');
              setStatus({ value: 'idle' });
              toast.success(t`Conversation saved`, {
                description: t`Your conversation has been saved and is now available in History.`,
              });
              isIntentionalDisconnectRef.current = false;
            }
          } catch (error) {
            if ((error as Error & { code?: string }).code === 'AUTH_TOKEN_UNAVAILABLE') {
              console.log('[GlassContext] No auth token while polling, will retry');
              if (attempts < maxAttempts) {
                setTimeout(poll, 1000);
              } else {
                setStatus({ value: 'idle' });
                toast.success(t`Conversation saved`, {
                  description: t`Your conversation has been saved and is now available in History.`,
                });
                isIntentionalDisconnectRef.current = false;
              }
              return;
            }
            console.error('[GlassContext] Error polling for conversation:', error);

            if (attempts < maxAttempts) {
              setTimeout(poll, 1000);
            } else {
              setStatus({ value: 'idle' });
              toast.success(t`Conversation saved`, {
                description: t`Your conversation has been saved and is now available in History.`,
              });
              isIntentionalDisconnectRef.current = false;
            }
          }
        };

        setTimeout(poll, 2000);
      };

      startPolling();
    } else {
      console.log('[GlassContext] Skipping analysis - returning to idle state');
      setStatus({ value: 'idle' });
      isIntentionalDisconnectRef.current = false;
    }
  }, [clearReconnectTimer, detachMicTrackMonitor, stopSpeaking, stopStreaming]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

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
    sessionMode,
    conversationPartner,
    isMuted,
    micFft,
    settings,
    suggestions,
    feedbacks,
    translations,
    conversationAnalysis,
    showSummary,
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
    ttsHighlight,
    closeSummary,
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
