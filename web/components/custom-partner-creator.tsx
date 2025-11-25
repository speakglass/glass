import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { toast } from 'sonner';
import { cn } from '@/utils';
import {
  ConversationPartner,
  PartnerGenerationJob,
  PartnerGenerationStatus,
  PartnerGenerationStep,
  fetchPartnerGenerationJob,
  startPartnerGeneration,
  uploadPartnerAvatar,
  updatePartner,
} from '@/lib/account-api';
import { useQueryClient } from '@tanstack/react-query';
import { PartnerAvatar } from '@/components/partner-avatar';
import { Loader2, CheckCircle2, Briefcase, MapPin, Languages } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { LearningLevel } from '@/types/learning-level';
import { getLanguageName } from '@/lib/conversation-display';
import { useLocale } from '@/hooks/use-locale';

function GenderIcon({ gender, className }: { gender: string; className?: string }) {
  const iconClass = className || 'h-3.5 w-3.5';

  if (gender === 'male') {
    return (
      <svg
        className={iconClass}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10" cy="14" r="6" />
        <line x1="14.5" y1="9.5" x2="20" y2="4" />
        <line x1="20" y1="4" x2="20" y2="8" />
        <line x1="20" y1="4" x2="16" y2="4" />
      </svg>
    );
  }

  if (gender === 'female') {
    return (
      <svg
        className={iconClass}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="9" r="6" />
        <line x1="12" y1="15" x2="12" y2="21" />
        <line x1="9" y1="18" x2="15" y2="18" />
      </svg>
    );
  }

  // non-binary or other
  return (
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="6" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="2" y1="12" x2="6" y2="12" />
    </svg>
  );
}

// Universal topics that work for all languages
const universalTopics = [
  { id: 'daily_life', icon: '☀️', title: t`Daily life` },
  { id: 'travel', icon: '✈️', title: t`Travel` },
  { id: 'food', icon: '🍜', title: t`Food & Cooking` },
  { id: 'movies_tv', icon: '🎬', title: t`Movies & TV` },
  { id: 'music', icon: '🎵', title: t`Music` },
  { id: 'sports', icon: '⚽', title: t`Sports` },
];

// Language-specific topics
const languageSpecificTopics: Record<string, Array<{ id: string; icon: string; title: string }>> = {
  en: [
    { id: 'pop_culture', icon: '🎬', title: t`Pop culture` },
    { id: 'tech_startups', icon: '💻', title: t`Tech & Startups` },
    { id: 'american_culture', icon: '🗽', title: t`American culture` },
    { id: 'british_culture', icon: '☕', title: t`British culture` },
    { id: 'entertainment', icon: '🎭', title: t`Entertainment` },
  ],
  ko: [
    { id: 'kpop', icon: '🎤', title: t`K-pop` },
    { id: 'kdrama', icon: '📺', title: t`K-drama` },
    { id: 'korean_food', icon: '🍲', title: t`Korean food` },
    { id: 'korean_culture', icon: '🏯', title: t`Korean culture` },
    { id: 'kbeauty', icon: '💄', title: t`K-beauty` },
  ],
  ja: [
    { id: 'anime', icon: '🎌', title: t`Anime` },
    { id: 'manga', icon: '📖', title: t`Manga` },
    { id: 'japanese_food', icon: '🍣', title: t`Japanese food` },
    { id: 'japanese_culture', icon: '⛩️', title: t`Japanese culture` },
    { id: 'jrpg', icon: '🎮', title: t`Video games` },
  ],
  es: [
    { id: 'latino_music', icon: '💃', title: t`Latino music` },
    { id: 'football', icon: '⚽', title: t`Football` },
    { id: 'spanish_food', icon: '🥘', title: t`Spanish cuisine` },
    { id: 'latin_culture', icon: '🎊', title: t`Latin culture` },
    { id: 'telenovela', icon: '📺', title: t`Telenovelas` },
  ],
  fr: [
    { id: 'french_cuisine', icon: '🥐', title: t`French cuisine` },
    { id: 'wine', icon: '🍷', title: t`Wine & Cheese` },
    { id: 'french_cinema', icon: '🎬', title: t`French cinema` },
    { id: 'fashion', icon: '👗', title: t`Fashion` },
    { id: 'art', icon: '🎨', title: t`Art & Museums` },
  ],
  de: [
    { id: 'german_culture', icon: '🍺', title: t`German culture` },
    { id: 'oktoberfest', icon: '🎉', title: t`Beer & Festivals` },
    { id: 'cars', icon: '🚗', title: t`Cars & Engineering` },
    { id: 'hiking', icon: '⛰️', title: t`Hiking & Nature` },
    { id: 'philosophy', icon: '📚', title: t`Philosophy` },
  ],
  zh: [
    { id: 'chinese_food', icon: '🥟', title: t`Chinese food` },
    { id: 'chinese_culture', icon: '🐉', title: t`Chinese culture` },
    { id: 'tea', icon: '🍵', title: t`Tea culture` },
    { id: 'martial_arts', icon: '🥋', title: t`Martial arts` },
    { id: 'calligraphy', icon: '✍️', title: t`Calligraphy` },
  ],
  it: [
    { id: 'italian_cuisine', icon: '🍝', title: t`Italian cuisine` },
    { id: 'opera', icon: '🎭', title: t`Opera & Music` },
    { id: 'italian_culture', icon: '🏛️', title: t`Italian culture` },
    { id: 'coffee', icon: '☕', title: t`Coffee culture` },
    { id: 'design', icon: '🖼️', title: t`Design & Art` },
  ],
  pt: [
    { id: 'brazilian_music', icon: '🎶', title: t`Brazilian music` },
    { id: 'football', icon: '⚽', title: t`Football` },
    { id: 'brazilian_food', icon: '🍖', title: t`Brazilian food` },
    { id: 'carnival', icon: '🎭', title: t`Carnival` },
    { id: 'beach_culture', icon: '🏖️', title: t`Beach culture` },
  ],
};

const getConversationTopics = (learningLang?: string) => {
  const specificTopics = learningLang ? languageSpecificTopics[learningLang] || [] : [];
  return [...universalTopics, ...specificTopics];
};

type PartnerType = 'new_friends' | 'someone_special' | 'professional' | 'figuring_out';
type GenderPreference = 'male' | 'female' | 'beyond_binary' | 'everyone';
type AgePreference = 'teens' | 'early20s' | 'late20s' | 'thirties' | 'forties';

const partnerTypeOptions: Array<{ id: PartnerType; icon: string; title: string; description: string }> = [
  {
    id: 'new_friends',
    icon: '👋',
    title: t`New friends`,
    description: t`Make connections and have fun conversations.`,
  },
  {
    id: 'someone_special',
    icon: '💝',
    title: t`Someone special`,
    description: t`Warm and meaningful connections through language.`,
  },
  {
    id: 'professional',
    icon: '💼',
    title: t`Professional practice`,
    description: t`Business scenarios and workplace language.`,
  },
  {
    id: 'figuring_out',
    icon: '🤔',
    title: t`Still figuring it out`,
    description: t`Explore different styles and find what works.`,
  },
];

const genderOptions: Array<{ id: GenderPreference; label: string }> = [
  { id: 'male', label: t`Male` },
  { id: 'female', label: t`Female` },
  { id: 'beyond_binary', label: t`Beyond Binary` },
  { id: 'everyone', label: t`Everyone` },
];

const ageOptions: Array<{ id: AgePreference; label: string }> = [
  { id: 'teens', label: t`Teens` },
  { id: 'early20s', label: t`Early 20s` },
  { id: 'late20s', label: t`Late 20s` },
  { id: 'thirties', label: t`30s` },
  { id: 'forties', label: t`40+` },
];

type CreateStep = 'topics' | 'partner_type' | 'basics' | 'finding' | 'meet';
type NarrativeStepId = PartnerGenerationStep | 'complete';
const NARRATIVE_STEP_ORDER: NarrativeStepId[] = ['persona', 'voice', 'partner', 'avatar', 'complete'];
const STEP_PACING_MS = [0, 6000, 14000, 24000, 32000]; // Minimum elapsed time targets for each step

const FALLBACK_STATUS_MESSAGES: Record<PartnerGenerationStatus, string> = {
  queued: t`Looking for an AI partner who matches your vibe...`,
  generating_persona: t`Meeting potential AI partners...`,
  selecting_voice: t`Your partner is tuning their voice a little...`,
  saving_partner: t`Your partner is polishing their profile...`,
  generating_avatar: t`Your partner is picking a friendly photo...`,
  completed: t`Ready to say hi!`,
  failed: t`We couldn't find the right partner`,
};

interface CustomPartnerCreatorProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  learningLang?: string;
  nativeLang?: string | null;
  languageLevel?: LearningLevel | null;
  partnerLimitBlocked: boolean;
  onQuotaBlocked: () => void;
  onPartnerCreated: (partner: ConversationPartner) => void;
  onGenerationJobUpdate?: (job: PartnerGenerationJob | null) => void;
}

export function CustomPartnerCreator({
  open,
  onClose,
  token,
  learningLang,
  nativeLang,
  languageLevel,
  partnerLimitBlocked,
  onQuotaBlocked,
  onPartnerCreated,
  onGenerationJobUpdate,
}: CustomPartnerCreatorProps) {
  const locale = useLocale();
  const [flowStep, setFlowStep] = useState<CreateStep>('topics');
  const [generatedName, setGeneratedName] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [customTopicInputVisible, setCustomTopicInputVisible] = useState(false);
  const [partnerType, setPartnerType] = useState<PartnerType>('new_friends');
  const [gender, setGender] = useState<GenderPreference>('everyone');
  const [ageRange, setAgeRange] = useState<AgePreference>('late20s');
  const [isSaving, setIsSaving] = useState(false);
  const [createdPartner, setCreatedPartner] = useState<ConversationPartner | null>(null);
  const [generationJob, setGenerationJob] = useState<PartnerGenerationJob | null>(null);
  const [clientStepIndex, setClientStepIndex] = useState(0);
  const [findingStartedAt, setFindingStartedAt] = useState<number | null>(null);
  const [pacingTick, setPacingTick] = useState(0);
  const customTopicInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingJobIdRef = useRef<string | null>(null);
  const pollingInFlightRef = useRef(false);
  const queryClient = useQueryClient();

  const previewDetails = useMemo(() => {
    const persona = generationJob?.personaPreview;
    const partner = generationJob?.partner;
    const name = partner?.name || persona?.name || undefined;
    const city = persona?.personaCityTranslation || persona?.personaCity;
    const country = persona?.personaCountryTranslation || persona?.personaCountry;
    let location = [city, country].filter(Boolean).join(', ');
    if (location) {
      const splitOnInterests = location.split(/interests?:/i)[0];
      location = splitOnInterests.split('\n')[0].trim();
    }
    const interestSource =
      persona?.personaInterestsTranslation && persona.personaInterestsTranslation.length > 0
        ? persona.personaInterestsTranslation
        : persona?.personaInterests;
    const interestList = interestSource?.filter((item) => item && item.trim()) ?? [];
    const interest = interestList[0];
    return { name, location, interest };
  }, [generationJob]);

  const createdOccupation = createdPartner?.personaOccupationTranslation || createdPartner?.personaOccupation;
  const createdCity = createdPartner?.personaCityTranslation || createdPartner?.personaCity;
  const createdCountry = createdPartner?.personaCountryTranslation || createdPartner?.personaCountry;
  const createdLocation = [createdCity, createdCountry].filter(Boolean).join(', ');

  const targetStepIndex = useMemo(() => {
    if (flowStep !== 'finding' || !generationJob) {
      return 0;
    }
    const steps = new Set(generationJob.stepsCompleted ?? []);
    const status = generationJob.status;
    const { name, location, interest } = previewDetails;
    let dataTarget = 0;

    // Step 1: Persona generated
    const personaReady = Boolean(location) || steps.has('persona') || (status && status !== 'queued');
    if (personaReady) {
      dataTarget = Math.max(dataTarget, 1);
    }

    // Step 2: Voice selected (completed, not in progress)
    const matchAccepted = Boolean(name) || steps.has('voice');
    if (matchAccepted) {
      dataTarget = Math.max(dataTarget, 2);
    }

    // Step 3: Partner saved (completed, not in progress)
    const profileReady = Boolean(interest) || steps.has('partner') || generationJob.partner;
    if (profileReady) {
      dataTarget = Math.max(dataTarget, 3);
    }

    // Step 4: Avatar generated (completed, not in progress)
    const photoReady = steps.has('avatar');
    if (photoReady) {
      dataTarget = Math.max(dataTarget, 4);
    }

    // Step 5: All complete
    if (status === 'completed') {
      dataTarget = Math.max(dataTarget, NARRATIVE_STEP_ORDER.length);
    }

    let paceTarget = 1;
    if (photoReady) {
      paceTarget = NARRATIVE_STEP_ORDER.length;
    } else {
      const elapsed = findingStartedAt && pacingTick ? Math.max(pacingTick - findingStartedAt, 0) : 0;
      paceTarget = STEP_PACING_MS.reduce((count, threshold) => (elapsed >= threshold ? count + 1 : count), 0);
      paceTarget = Math.max(1, paceTarget);
    }

    return Math.min(dataTarget, paceTarget);
  }, [flowStep, generationJob, pacingTick, findingStartedAt, previewDetails]);

  const stopJobPolling = useCallback(() => {
    pollingJobIdRef.current = null;
    pollingInFlightRef.current = false;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const addPartnerToCache = useCallback(
    (partner: ConversationPartner) => {
      if (!token) return;
      queryClient.setQueryData<ConversationPartner[] | undefined>(['partners', token], (previous) => {
        const existing = previous || [];
        if (existing.some((existingPartner) => existingPartner.id === partner.id)) {
          return existing;
        }
        return [partner, ...existing];
      });
    },
    [queryClient, token]
  );

  const finalizePartner = useCallback(
    (partner: ConversationPartner) => {
      addPartnerToCache(partner);
      setCreatedPartner(partner);
      setGeneratedName(partner.name);
      setFlowStep('meet');
      setIsSaving(false);
      stopJobPolling();
      onGenerationJobUpdate?.(null);
    },
    [addPartnerToCache, stopJobPolling, onGenerationJobUpdate]
  );

  const handleJobProgress = useCallback(
    (job: PartnerGenerationJob) => {
      setGenerationJob(job);
      onGenerationJobUpdate?.(job);
      const previewName = job.partner?.name || job.personaPreview?.name;
      if (previewName) {
        setGeneratedName(previewName);
      }
      if (job.status === 'completed' && job.partner) {
        finalizePartner(job.partner);
        return true;
      }
      if (job.status === 'failed') {
        stopJobPolling();
        setIsSaving(false);
        setFlowStep('basics');
        toast.error(t`Unable to find partner`, {
          description: job.error || t`Please try again.`,
        });
        return true;
      }
      return false;
    },
    [finalizePartner, onGenerationJobUpdate, stopJobPolling]
  );

  const beginJobPolling = useCallback(
    (jobId: string) => {
      if (!token) return;
      pollingJobIdRef.current = jobId;

      const poll = async () => {
        if (!pollingJobIdRef.current) {
          return;
        }
        if (pollingInFlightRef.current) {
          pollTimeoutRef.current = setTimeout(poll, 1000);
          return;
        }
        pollingInFlightRef.current = true;
        let shouldStopAfterError = false;
        try {
          const next = await fetchPartnerGenerationJob(token, jobId);
          const finished = handleJobProgress(next);
          if (finished) {
            return;
          }
        } catch (error) {
          console.error('[CustomPartnerCreator] Failed to poll partner generation job', error);
          shouldStopAfterError = true;
          stopJobPolling();
          setIsSaving(false);
          setFlowStep('basics');
          const status = typeof error === 'object' && error && 'status' in (error as Record<string, unknown>)
            ? (error as { status?: number }).status
            : undefined;
          const description =
            status === 404
              ? t`The generation job expired. Please start again.`
              : t`We couldn't reach the server. Please try again.`;
          toast.error(t`Unable to find partner`, {
            description,
          });
          onGenerationJobUpdate?.(null);
        } finally {
          pollingInFlightRef.current = false;
          if (pollingJobIdRef.current && !shouldStopAfterError) {
            pollTimeoutRef.current = setTimeout(poll, 2000);
          }
        }
      };

      poll();
    },
    [handleJobProgress, onGenerationJobUpdate, setFlowStep, setIsSaving, stopJobPolling, token]
  );

  const getStepCompletedLabel = useCallback(
    (stepId: NarrativeStepId): string | undefined => {
      const { name, location, interest } = previewDetails;
      switch (stepId) {
        case 'persona':
          return location ? t`Found someone promising in ${location}.` : t`Found someone who shares your interests.`;
        case 'voice':
          return name ? t`${name} just accepted the match request.` : t`Your match just said yes.`;
        case 'partner':
          return name
            ? t`${name} just finished writing a profile for you.`
            : t`Your match just finished writing a profile for you.`;
        case 'avatar':
          return name ? t`${name} is picking a friendly photo for you.` : t`Your match is choosing a friendly photo.`;
        case 'complete':
          return name ? t`${name} is all set!` : FALLBACK_STATUS_MESSAGES.completed;
        default:
          return undefined;
      }
    },
    [previewDetails]
  );

  const activeNarrativeIndex = Math.min(clientStepIndex, NARRATIVE_STEP_ORDER.length - 1);
  const statusNarration = useMemo(() => {
    if (flowStep !== 'finding') {
      return undefined;
    }
    const { name, location } = previewDetails;
    const activeStepId = NARRATIVE_STEP_ORDER[activeNarrativeIndex];
    switch (activeStepId) {
      case 'persona':
        return location
          ? t`Looking around ${location} for an AI partner to chat with...`
          : FALLBACK_STATUS_MESSAGES.generating_persona;
      case 'voice':
        return t`Sending a match request to our AI partner...`;
      case 'partner':
        return name
          ? t`${name} is putting together a quick profile for you...`
          : FALLBACK_STATUS_MESSAGES.saving_partner;
      case 'avatar':
        return name ? t`${name} is snapping a friendly photo...` : FALLBACK_STATUS_MESSAGES.generating_avatar;
      case 'complete':
        return name ? t`${name} is ready to say hi!` : FALLBACK_STATUS_MESSAGES.completed;
      default:
        return FALLBACK_STATUS_MESSAGES.queued;
    }
  }, [activeNarrativeIndex, flowStep, previewDetails]);

  const resetState = useCallback(() => {
    stopJobPolling();
    setFlowStep('topics');
    setGeneratedName('');
    setSelectedTopicIds([]);
    setCustomTopics([]);
    setCustomTopicInput('');
    setCustomTopicInputVisible(false);
    setPartnerType('new_friends');
    setGender('everyone');
    setAgeRange('late20s');
    setIsSaving(false);
    setCreatedPartner(null);
    setGenerationJob(null);
    setClientStepIndex(0);
    setFindingStartedAt(null);
    setPacingTick(0);
  }, [stopJobPolling]);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (customTopicInputVisible) {
      customTopicInputRef.current?.focus();
    }
  }, [customTopicInputVisible]);

  useEffect(() => {
    return () => stopJobPolling();
  }, [stopJobPolling]);

  useEffect(() => {
    if (flowStep !== 'finding') {
      setClientStepIndex(0);
      setFindingStartedAt(null);
      setPacingTick(0);
    }
  }, [flowStep]);
  useEffect(() => {
    if (generationJob?.id && flowStep === 'finding') {
      setClientStepIndex(0);
      setFindingStartedAt(Date.now());
      setPacingTick(Date.now());
    }
  }, [generationJob?.id, flowStep]);
  useEffect(() => {
    if (flowStep !== 'finding') {
      return;
    }
    const interval = setInterval(() => {
      setPacingTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [flowStep]);

  useEffect(() => {
    if (flowStep !== 'finding') {
      return;
    }
    if (clientStepIndex >= targetStepIndex) {
      return;
    }
    const delay = 1800 + clientStepIndex * 500 + Math.random() * 600;
    const timeout = setTimeout(() => {
      setClientStepIndex((previous) => Math.min(previous + 1, targetStepIndex));
    }, delay);
    return () => clearTimeout(timeout);
  }, [clientStepIndex, targetStepIndex, flowStep]);

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((previous) =>
      previous.includes(topicId) ? previous.filter((id) => id !== topicId) : [...previous, topicId]
    );
  };

  const handleAddCustomTopic = () => {
    const trimmed = customTopicInput.trim();
    if (!trimmed) {
      return;
    }
    setCustomTopics((previous) => (previous.includes(trimmed) ? previous : [...previous, trimmed]));
    setCustomTopicInput('');
    setCustomTopicInputVisible(false);
  };

  const handleCustomTopicKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddCustomTopic();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setCustomTopicInputVisible(false);
      setCustomTopicInput('');
    }
  };

  const conversationTopics = getConversationTopics(learningLang);

  const mergedTopics = [
    ...conversationTopics.filter((topic) => selectedTopicIds.includes(topic.id)).map((topic) => topic.title),
    ...customTopics,
  ].filter(Boolean);

  const primaryButtonDisabled = flowStep === 'topics' && mergedTopics.length === 0;

  const handleNext = async () => {
    if (flowStep === 'basics') {
      // Start the "finding" process
      if (!token) {
        toast.error(t`Unable to find partner`, {
          description: t`Authentication token not available. Please refresh the page.`,
        });
        return;
      }
      if (!learningLang) {
        toast.error(t`Missing learning language for your profile`);
        return;
      }
      if (partnerLimitBlocked) {
        onQuotaBlocked();
        return;
      }

      setIsSaving(true);
      setFlowStep('finding');
      setClientStepIndex(0);
      const startTime = Date.now();
      setFindingStartedAt(startTime);
      setPacingTick(startTime);
      try {
        const job = await startPartnerGeneration(token, {
          learningLang,
          nativeLang: nativeLang || undefined,
          languageLevel: languageLevel || undefined,
          topics: mergedTopics,
          partnerType,
          gender,
          ageRange,
        });
        const finishedImmediately = handleJobProgress(job);
        if (!finishedImmediately) {
          beginJobPolling(job.id);
        }
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : null;
        if (statusCode === 403) {
          onQuotaBlocked();
        } else {
          console.error('[CustomPartnerCreator] Failed to start partner generation', error);
          toast.error(t`Unable to find partner`);
        }
        setFlowStep('basics');
        setIsSaving(false);
      }
      return;
    }

    const flowOrder: CreateStep[] = ['topics', 'partner_type', 'basics'];
    const currentIndex = flowOrder.indexOf(flowStep);
    const nextStep = flowOrder[currentIndex + 1];
    if (nextStep) {
      setFlowStep(nextStep);
    }
  };

  const handleBack = () => {
    if (flowStep === 'topics') {
      onClose();
      return;
    }
    if (flowStep === 'meet' || flowStep === 'finding') {
      // Can't go back from these screens
      return;
    }
    const flowOrder: CreateStep[] = ['topics', 'partner_type', 'basics'];
    const currentIndex = flowOrder.indexOf(flowStep);
    if (currentIndex <= 0) {
      return;
    }
    setFlowStep(flowOrder[currentIndex - 1]);
  };

  const handleMeetPartner = () => {
    if (createdPartner) {
      toast.success(t`New friend added!`);
      onPartnerCreated(createdPartner);
      onClose();
    }
  };

  const renderContent = () => {
    if (flowStep === 'topics') {
      return (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            <Trans>Select topics to find AI partners with similar interests.</Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            {conversationTopics.map((topic) => {
              const isSelected = selectedTopicIds.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/15 text-primary shadow-sm'
                      : 'border-border bg-muted/40 hover:bg-muted/60 hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-base leading-none">{topic.icon}</span>
                  <span>{topic.title}</span>
                </button>
              );
            })}
            {customTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setCustomTopics((previous) => previous.filter((item) => item !== topic))}
                className="group flex items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:border-destructive hover:bg-destructive/10 hover:text-destructive active:scale-95 cursor-pointer"
              >
                <span>{topic}</span>
                <span className="text-base leading-none opacity-60 group-hover:opacity-100">×</span>
              </button>
            ))}
            {!customTopicInputVisible ? (
              <button
                type="button"
                onClick={() => setCustomTopicInputVisible(true)}
                className="flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <span className="text-base leading-none">+</span>
                <span>
                  <Trans>Add your own</Trans>
                </span>
              </button>
            ) : (
              <div className="relative inline-flex items-center">
                <Input
                  ref={customTopicInputRef}
                  value={customTopicInput}
                  onChange={(event) => setCustomTopicInput(event.target.value)}
                  onKeyDown={handleCustomTopicKeyDown}
                  onBlur={() => {
                    if (!customTopicInput.trim()) {
                      setCustomTopicInputVisible(false);
                    }
                  }}
                  placeholder={t`Type and press Enter...`}
                  disabled={isSaving}
                  className="h-9 w-48 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (flowStep === 'partner_type') {
      return (
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            <Trans>What kind of AI partner are you looking for?</Trans>
          </p>
          <div className="grid grid-cols-2 gap-3">
            {partnerTypeOptions.map((option) => {
              const isSelected = partnerType === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPartnerType(option.id)}
                  className={cn(
                    'rounded-xl border px-4 py-4 text-left transition hover:border-primary/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    isSelected ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none">{option.icon}</span>
                    <p className="font-semibold text-sm">{option.title}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (flowStep === 'basics') {
      return (
        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            <Trans>Tell us your preferences for your AI partner.</Trans>
          </p>
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  <Trans>Gender preference</Trans>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {genderOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setGender(option.id)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition hover:border-primary/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                      gender === option.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted/30'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  <Trans>Age range</Trans>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ageOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAgeRange(option.id)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm font-medium transition hover:border-primary/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                      ageRange === option.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted/30'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (flowStep === 'finding') {
      const partnerImages = [
        'alex.png',
        'camila.png',
        'claire.png',
        'diego.png',
        'emma.png',
        'haruto.png',
        'jiwoo.png',
        'liwei.png',
        'luc.png',
        'mei.png',
        'minjun.png',
        'yui.png',
      ];

      const progressSteps: Array<{ id: NarrativeStepId; label: string; icon: string }> = [
        {
          id: 'persona',
          label: t`Finding a great match`,
          icon: '🔍',
        },
        {
          id: 'voice',
          label: t`Sending a match request`,
          icon: '💬',
        },
        {
          id: 'partner',
          label: t`Getting their story`,
          icon: '📝',
        },
        {
          id: 'avatar',
          label: t`Grabbing a friendly photo`,
          icon: '📸',
        },
        {
          id: 'complete',
          label: t`Final touches`,
          icon: '✨',
        },
      ];

      const activeIndex = Math.min(clientStepIndex, progressSteps.length - 1);
      const jobMessage = generationJob?.message;
      const fallbackTitle = jobMessage || progressSteps[activeIndex].label;
      const currentTitle = statusNarration || fallbackTitle;

      return (
        <div className="space-y-8 py-6">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold transition-all duration-300">{currentTitle}</h3>
          </div>

          {/* Animated partner images carousel */}
          <div className="relative h-32 overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              <div className="flex gap-4 animate-[scrollPartners_20s_linear_infinite]">
                {[...partnerImages, ...partnerImages].map((image, idx) => (
                  <div
                    key={idx}
                    className="flex-shrink-0 w-20 h-20 rounded-full overflow-hidden border-2 border-primary/30 shadow-lg"
                  >
                    <img src={`/partners/${image}`} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none z-10" />
          </div>

          {/* Progress steps */}
          <div className="max-w-sm mx-auto space-y-2.5">
            {progressSteps.map((step, idx) => {
              const isCompleted = idx < clientStepIndex;
              const isActive = idx === Math.min(clientStepIndex, progressSteps.length - 1) && !isCompleted;
              const displayLabel = isCompleted ? getStepCompletedLabel(step.id) ?? step.label : step.label;
              return (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-500',
                    isActive && 'bg-primary/5',
                    isCompleted && 'opacity-60'
                  )}
                >
                  <div className="relative flex items-center justify-center">
                    {isCompleted ? (
                      <div className="h-6 w-6 rounded-full bg-emerald-500/90 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} />
                      </div>
                    ) : isActive ? (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" strokeWidth={2.5} />
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center">
                        <span className="text-sm opacity-60">{step.icon}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p
                      className={cn(
                        'text-sm transition-all',
                        isActive && 'text-foreground font-medium',
                        isCompleted && 'text-muted-foreground',
                        !isActive && !isCompleted && 'text-muted-foreground'
                      )}
                    >
                      {displayLabel}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <style jsx>{`
            @keyframes scrollPartners {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-50%);
              }
            }
          `}</style>
        </div>
      );
    }

    if (flowStep === 'meet') {
      const relationshipTypeLabels = {
        new_friends: t`New friends`,
        someone_special: t`Someone special`,
        professional: t`Professional practice`,
        figuring_out: t`Still figuring it out`,
      };

      return (
        <div className="flex flex-col max-h-[600px]">
          {/* Scrollable content including image */}
          <div className="overflow-y-auto space-y-4">
            {/* Avatar image - compact square */}
            <div className="relative w-full aspect-square overflow-hidden rounded-lg">
              <PartnerAvatar
                className="h-full w-full rounded-lg"
                fallbackSize="lg"
                name={createdPartner?.name}
                src={createdPartner?.avatarUrl || undefined}
              />
            </div>

            {/* Name and age with verified badge */}
            <div className="space-y-1">
              <h3 className="text-3xl font-bold flex items-center gap-2">
                {createdPartner?.name || generatedName}
                <span className="text-2xl font-normal">{createdPartner?.personaAge || '25'}</span>
                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </h3>

              {/* Gender, profession, location */}
              <div className="text-sm text-muted-foreground space-y-0.5">
                {(createdPartner?.nativeLang || createdPartner?.learningLang) && (
                  <div className="flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5" />
                    <span>
                      {getLanguageName(createdPartner.nativeLang, locale)} →{' '}
                      {getLanguageName(createdPartner.learningLang, locale)}
                    </span>
                  </div>
                )}
                {createdPartner?.personaGender && (
                  <div className="flex items-center gap-1.5">
                    <GenderIcon gender={createdPartner.personaGender} />
                    <span className="capitalize">{createdPartner.personaGender}</span>
                  </div>
                )}
                {createdOccupation && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="capitalize">{createdOccupation}</span>
                  </div>
                )}
                {createdLocation && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{createdLocation}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Looking for */}
            {createdPartner?.personaRelationship && (
              <div className="bg-muted/80 rounded-lg px-4 py-3">
                <p className="text-sm flex items-center gap-2">
                  <span className="text-base">😊</span>
                  <span className="font-medium">
                    <Trans>Looking for</Trans>
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {relationshipTypeLabels[createdPartner.personaRelationship as keyof typeof relationshipTypeLabels] ||
                    createdPartner.personaRelationship}
                </p>
              </div>
            )}

            {/* About Me */}
            <div className="space-y-3">
              <h4 className="text-lg font-semibold">
                <Trans>About Me</Trans>
              </h4>
              {(createdPartner?.descriptionTranslation || createdPartner?.description) && (
                <p className="text-sm text-foreground leading-relaxed">
                  {createdPartner?.descriptionTranslation || createdPartner?.description}
                </p>
              )}
              {(createdPartner?.personaBackgroundTranslation || createdPartner?.personaBackground) && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {createdPartner?.personaBackgroundTranslation || createdPartner?.personaBackground}
                </p>
              )}
              {(createdPartner?.personaInterestsTranslation || createdPartner?.personaInterests) && (
                <div className="flex flex-wrap gap-2">
                  {(createdPartner.personaInterestsTranslation || createdPartner.personaInterests || '')
                    .split(',')
                    .map((interest, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs capitalize">
                        {interest.trim()}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons - fixed at bottom */}
          <div className="flex gap-2 border-t pt-4 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setFlowStep('basics');
              }}
              className="flex-1 cursor-pointer"
            >
              <Trans>Find another</Trans>
            </Button>
            <Button onClick={handleMeetPartner} className="flex-1 cursor-pointer">
              <Trans>Start chatting</Trans>
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  const stepInfo = {
    topics: { emoji: '💬', title: t`What interests you?` },
    partner_type: { emoji: '✨', title: t`What type of partner?` },
    basics: { emoji: '👤', title: t`Any preferences?` },
    finding: { emoji: '🔍', title: t`Finding a match` },
    meet: { emoji: '🎉', title: t`Meet your partner` },
  };

  const currentStep = stepInfo[flowStep];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className={cn('sm:max-w-[540px]', flowStep === 'meet' && 'sm:max-w-[440px]')}>
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-3">
            {flowStep !== 'meet' && <span className="text-3xl leading-none">{currentStep.emoji}</span>}
            <div className="flex-1">
              <DialogTitle className={cn('text-xl', flowStep === 'meet' && 'text-lg')}>{currentStep.title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>
        {renderContent()}
        {flowStep !== 'finding' && flowStep !== 'meet' && (
          <DialogFooter className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button
                variant="ghost"
                type="button"
                onClick={handleBack}
                disabled={isSaving}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                {flowStep === 'topics' ? <Trans>Cancel</Trans> : <Trans>Back</Trans>}
              </Button>
              <Button
                type="button"
                onClick={handleNext}
                disabled={primaryButtonDisabled || isSaving}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                {flowStep === 'basics' ? <Trans>Find partner</Trans> : <Trans>Next</Trans>}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CustomPartnerEditorProps {
  open: boolean;
  onClose: () => void;
  partner: ConversationPartner | null;
  token: string | null;
  onPartnerUpdated: (partner: ConversationPartner) => void;
}

export function CustomPartnerEditor({ open, onClose, partner, token, onPartnerUpdated }: CustomPartnerEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && partner) {
      setName(partner.name || '');
      setDescription(partner.description || '');
      setAvatarPreview(partner.avatarUrl || null);
      setAvatarFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else if (!open) {
      setAvatarFile(null);
      setAvatarPreview((previous) => {
        if (previous && previous.startsWith('blob:')) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
    }
  }, [open, partner]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const handleSave = async () => {
    if (!partner || !token) {
      toast.error(t`Unable to save partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    if (!name.trim()) {
      toast.error(t`Enter a name for your partner`);
      return;
    }
    setIsSaving(true);
    try {
      let updatedPartner = await updatePartner(token, partner.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      if (avatarFile) {
        updatedPartner = await uploadPartnerAvatar(token, partner.id, avatarFile);
      }
      queryClient.setQueryData<ConversationPartner[] | undefined>(['partners', token], (previous) =>
        (previous || []).map((existing) => (existing.id === updatedPartner.id ? updatedPartner : existing))
      );
      toast.success(t`Partner updated`);
      onPartnerUpdated(updatedPartner);
      onClose();
    } catch (error) {
      console.error('[CustomPartnerEditor] Failed to save partner', error);
      toast.error(t`Unable to save partner`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit partner</Trans>
          </DialogTitle>
          <DialogDescription className="text-sm">
            <Trans>Update your custom partner details.</Trans>
          </DialogDescription>
        </DialogHeader>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="group relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              aria-label={t`Change partner photo`}
            >
              <PartnerAvatar
                className="pointer-events-none h-20 w-20"
                fallbackSize="lg"
                name={partner?.name || undefined}
                src={avatarPreview || undefined}
              />
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                  isSaving && 'opacity-100'
                )}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
              </span>
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>Photo</Trans>
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Name</Trans>
              </Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t`Enter a name`}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Description</Trans>
              </Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t`Add a short description`}
                disabled={isSaving}
                rows={3}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            <Trans>Close</Trans>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
