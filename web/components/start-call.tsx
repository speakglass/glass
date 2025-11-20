import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/glass-context';
import { useAccountSession } from '@/contexts/account-session-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone, UserRound, MoreHorizontal, AlertTriangle, Trash2 } from 'lucide-react';
import LiquidGlass from './liquid-glass';
import { toast } from 'sonner';
import { useRef, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConversationPartner,
  fetchPartners,
  createPartner,
  uploadPartnerAvatar,
  updatePartner,
  deletePartner,
  createCheckoutSession,
} from '@/lib/account-api';
import { PartnerVoiceSelector } from '@/components/partner-voice-selector';
import { ROLEPLAY_VOICE_OPTIONS } from '@/lib/roleplay-voices';
import { useVoicePreviewPlayer } from '@/hooks/use-voice-preview';
import { PartnerAvatar } from '@/components/partner-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type SetupStep = 'start' | 'languages' | 'level' | 'mode' | 'scenario' | 'instructions' | 'connecting';
type DisplayMediaVideoOptions = MediaTrackConstraints & {
  displaySurface?: 'monitor' | 'window' | 'application' | 'browser';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
};
interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

interface ExamplePhrase {
  target: string; // Text in learning language
  pronunciation?: string; // Romanization/pronunciation guide
  translation: string; // Translation in native language
}

interface LanguageExample {
  withPronunciation: {
    words: { target: string; pronunciation: string }[];
  };
  withoutPronunciation: {
    target: string;
  };
}

// Example phrases for each language with translations
const LANGUAGE_EXAMPLES: Record<string, Record<string, ExamplePhrase>> = {
  en: {
    ko: {
      target: 'Thank you very much',
      pronunciation: '땡큐 베리 머치',
      translation: '정말 감사합니다',
    },
    ja: {
      target: 'Thank you very much',
      pronunciation: 'サンキュー ベリー マッチ',
      translation: '本当にありがとうございます',
    },
    es: { target: 'Thank you very much', pronunciation: 'zenk yu beri mach', translation: 'Muchas gracias' },
    fr: { target: 'Thank you very much', pronunciation: 'sank iou vèri meutch', translation: 'Merci beaucoup' },
  },
  ko: {
    en: { target: '정말 감사합니다', pronunciation: 'jeong-mal gam-sa-ham-ni-da', translation: 'Thank you very much' },
    ja: {
      target: '정말 감사합니다',
      pronunciation: 'チョンマル カムサハムニダ',
      translation: '本当にありがとうございます',
    },
    es: { target: '정말 감사합니다', pronunciation: 'jeong-mal gam-sa-jam-ni-da', translation: 'Muchas gracias' },
    fr: { target: '정말 감사합니다', pronunciation: 'djeong-mal gam-sa-ham-ni-da', translation: 'Merci beaucoup' },
  },
  ja: {
    en: {
      target: 'ありがとうございます',
      pronunciation: 'a-ri-ga-tou go-za-i-ma-su',
      translation: 'Thank you very much',
    },
    ko: { target: 'ありがとうございます', pronunciation: '아리가토 고자이마스', translation: '정말 감사합니다' },
    es: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-sai-ma-su', translation: 'Muchas gracias' },
    fr: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-zaï-ma-su', translation: 'Merci beaucoup' },
  },
  es: {
    en: { target: 'Muchas gracias', pronunciation: 'moo-chahs grah-see-ahs', translation: 'Thank you very much' },
    ko: { target: 'Muchas gracias', pronunciation: '무차스 그라시아스', translation: '정말 감사합니다' },
    ja: { target: 'Muchas gracias', pronunciation: 'ムーチャス グラシアス', translation: '本当にありがとうございます' },
    fr: { target: 'Muchas gracias', pronunciation: 'moo-tchas gra-si-as', translation: 'Merci beaucoup' },
  },
  fr: {
    en: { target: 'Merci beaucoup', pronunciation: 'mehr-see boh-koo', translation: 'Thank you very much' },
    ko: { target: 'Merci beaucoup', pronunciation: '메르시 보쿠', translation: '정말 감사합니다' },
    ja: { target: 'Merci beaucoup', pronunciation: 'メルシー ボクー', translation: '本当にありがとうございます' },
    es: { target: 'Merci beaucoup', pronunciation: 'mersi boku', translation: 'Muchas gracias' },
  },
};

const DEFAULT_ROLEPLAY_VOICE_ID = ROLEPLAY_VOICE_OPTIONS[0]?.id ?? '';

// Get example for language pair, fallback to Japanese->English if not found
const getLanguageExample = (learningLang: string, nativeLang: string): ExamplePhrase | undefined => {
  return LANGUAGE_EXAMPLES[learningLang]?.[nativeLang] || LANGUAGE_EXAMPLES['ja']?.['en'];
};

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const { onboardingStatus, snapshot, token, refresh } = useAccountSession();
  const { playPreview, stopPreview, loadingVoiceId, playingVoiceId } = useVoicePreviewPlayer(token);
  const router = useRouter();
  const pathname = usePathname();
  const langSegment = pathname.split('/')[1] || 'en';
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<SetupStep>('start');

  // Initialize languages from user profile (from onboarding)
  const [languages, setLanguages] = useState<LanguageSettings>({
    learningLang: snapshot?.user.learningLang || settings.languages?.learningLang || '',
    nativeLang: snapshot?.user.nativeLang || settings.languages?.nativeLang || '',
  });
  const currentLearningLang = languages.learningLang || snapshot?.user.learningLang || 'en';
  const [selectedMode, setSelectedMode] = useState<'roleplay' | 'live_call' | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [isCreatePartnerModalOpen, setIsCreatePartnerModalOpen] = useState(false);
  const [createPartnerNameDraft, setCreatePartnerNameDraft] = useState<string>('');
  const [createPartnerDescriptionDraft, setCreatePartnerDescriptionDraft] = useState<string>('');
  const [createPartnerAvatarPreview, setCreatePartnerAvatarPreview] = useState<string | null>(null);
  const [createPartnerAvatarFile, setCreatePartnerAvatarFile] = useState<File | null>(null);
  const [createPartnerVoiceId, setCreatePartnerVoiceId] = useState<string>(DEFAULT_ROLEPLAY_VOICE_ID);
  const createPartnerAvatarInputRef = useRef<HTMLInputElement>(null);
  const [isSavingCreatePartner, setIsSavingCreatePartner] = useState(false);

  const [isEditPartnerModalOpen, setIsEditPartnerModalOpen] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<ConversationPartner | null>(null);
  const [editPartnerNameDraft, setEditPartnerNameDraft] = useState<string>('');
  const [editPartnerDescriptionDraft, setEditPartnerDescriptionDraft] = useState<string>('');
  const [editPartnerAvatarPreview, setEditPartnerAvatarPreview] = useState<string | null>(null);
  const [editPartnerAvatarFile, setEditPartnerAvatarFile] = useState<File | null>(null);
  const [editPartnerVoiceId, setEditPartnerVoiceId] = useState<string>(DEFAULT_ROLEPLAY_VOICE_ID);
  const editPartnerAvatarInputRef = useRef<HTMLInputElement>(null);
  const [isSavingEditPartner, setIsSavingEditPartner] = useState(false);

  const [isDeletePartnerDialogOpen, setIsDeletePartnerDialogOpen] = useState(false);
  const [partnerPendingDelete, setPartnerPendingDelete] = useState<ConversationPartner | null>(null);
  const [isDeletingPartner, setIsDeletingPartner] = useState(false);
  const clearCreatePartnerAvatarPreview = useCallback(() => {
    setCreatePartnerAvatarFile(null);
    setCreatePartnerAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
    if (createPartnerAvatarInputRef.current) {
      createPartnerAvatarInputRef.current.value = '';
    }
  }, []);

  const clearEditPartnerAvatarPreview = useCallback(() => {
    setEditPartnerAvatarFile(null);
    setEditPartnerAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
    if (editPartnerAvatarInputRef.current) {
      editPartnerAvatarInputRef.current.value = '';
    }
  }, []);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [screenSharePreviewStream, setScreenSharePreviewStream] = useState<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [screenShareError, setScreenShareError] = useState<'denied' | 'cancelled' | 'failed' | 'no_audio' | null>(null);
  const conversationLimit = snapshot?.limits?.conversations || null;
  const limitEnabled = Boolean(conversationLimit?.enabled && conversationLimit?.limit);
  const limitMax = conversationLimit?.limit ?? null;
  const limitUsed = conversationLimit?.used ?? 0;
  const limitDisplayUsed = limitMax !== null ? Math.min(limitUsed, limitMax) : limitUsed;
  const limitUsageLabel = limitMax !== null ? `${limitDisplayUsed}/${limitMax}` : null;
  const limitBlocked = Boolean(limitEnabled && conversationLimit?.blocked);
  const stopOwnedScreenShare = useCallback(() => {
    const stream = screenShareStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
    }
    setScreenSharePreviewStream(null);
  }, []);

  const isConnecting = status.value === 'connecting' || step === 'connecting';
  const glassMode = settings.glassMode ?? false;
  const canStartCall =
    selectedMode === 'roleplay'
      ? Boolean(selectedPartnerId)
      : selectedMode === 'live_call'
        ? Boolean(screenSharePreviewStream)
        : false;
  const partnersQueryEnabled = !!token && !!currentLearningLang;
  const {
    data: partnersData,
    isLoading: partnersQueryLoading,
    isFetching: partnersFetching,
  } = useQuery({
    queryKey: ['partners', token, currentLearningLang],
    queryFn: () => fetchPartners(token!, currentLearningLang),
    enabled: partnersQueryEnabled,
    staleTime: 60 * 1000,
  });
  const partnersLoading = partnersQueryEnabled ? partnersQueryLoading || partnersFetching : true;
  const roleplayPartners: ConversationPartner[] = (partnersData ?? []).filter((partner) => partner.kind === 'roleplay');
  const selectedRoleplayPartner = roleplayPartners.find((partner) => partner.id === selectedPartnerId);
  const [hoveredPartner, setHoveredPartner] = useState<ConversationPartner | null>(null);
  const partnerListRef = useRef<HTMLDivElement | null>(null);
  const [showPartnerListGradient, setShowPartnerListGradient] = useState(false);
  const updatePartnerListGradient = useCallback(() => {
    const el = partnerListRef.current;
    if (!el) {
      setShowPartnerListGradient(false);
      return;
    }

    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (!canScroll) {
      setShowPartnerListGradient(false);
      return;
    }

    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    setShowPartnerListGradient(!atBottom);
  }, []);
  useEffect(() => {
    const el = partnerListRef.current;
    if (!el) {
      setShowPartnerListGradient(false);
      return;
    }

    updatePartnerListGradient();
    const handleScroll = () => updatePartnerListGradient();
    el.addEventListener('scroll', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [roleplayPartners, partnersLoading, updatePartnerListGradient]);

  useEffect(() => {
    return () => {
      const stream = screenShareStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        screenShareStreamRef.current = null;
      }
    };
  }, []);

  // Removed: Auto-start language selection moved to onboarding flow

  // Helper functions for conditional styling
  const getTextClass = (type: 'title' | 'subtitle' | 'body' | 'muted') => {
    if (glassMode) {
      switch (type) {
        case 'title':
          return 'text-white';
        case 'subtitle':
          return 'text-white/90';
        case 'body':
          return 'text-white/70';
        case 'muted':
          return 'text-white/60';
      }
    } else {
      switch (type) {
        case 'title':
          return 'text-foreground';
        case 'subtitle':
          return 'text-foreground';
        case 'body':
          return 'text-muted-foreground';
        case 'muted':
          return 'text-muted-foreground';
      }
    }
  };

  const getCardClass = () => {
    return glassMode
      ? 'backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/15 hover:border-white/30'
      : 'bg-card border border-border hover:bg-accent/50 hover:border-border';
  };

  const getScaleClass = () => {
    return glassMode ? 'hover:scale-105 active:scale-95' : 'hover:scale-[1.01] active:scale-[0.99]';
  };

  const getBackButtonClass = () => {
    return glassMode
      ? 'text-white/70 hover:text-white text-sm transition-colors'
      : 'text-muted-foreground hover:text-foreground text-sm transition-colors';
  };

  useEffect(() => {
    return () => {
      if (createPartnerAvatarPreview && createPartnerAvatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(createPartnerAvatarPreview);
      }
    };
  }, [createPartnerAvatarPreview]);

  useEffect(() => {
    return () => {
      if (editPartnerAvatarPreview && editPartnerAvatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(editPartnerAvatarPreview);
      }
    };
  }, [editPartnerAvatarPreview]);

  useEffect(() => {
    if (
      selectedPartnerId &&
      roleplayPartners.length > 0 &&
      !roleplayPartners.some((partner) => partner.id === selectedPartnerId)
    ) {
      setSelectedPartnerId('');
    }
  }, [roleplayPartners, selectedPartnerId]);

  useEffect(() => {
    if (!selectedPartnerId && roleplayPartners.length > 0) {
      setSelectedPartnerId(roleplayPartners[0].id);
    }
  }, [roleplayPartners, selectedPartnerId]);

  // Sync languages from user profile when snapshot loads
  useEffect(() => {
    if (snapshot?.user.learningLang && snapshot?.user.nativeLang) {
      const userLanguages = {
        learningLang: snapshot.user.learningLang,
        nativeLang: snapshot.user.nativeLang,
      };
      setLanguages(userLanguages);
      // Also update settings
      updateSettings({ languages: userLanguages });
    }
  }, [snapshot, updateSettings]);

  // Reset step when disconnected
  useEffect(() => {
    console.log('[StartCall] Status effect triggered:', status.value);
    if (status.value === 'disconnected' || status.value === 'idle') {
      console.log('[StartCall] Resetting to start screen');
      setStep('start');
      // Keep languages from user profile
      if (snapshot?.user.learningLang && snapshot?.user.nativeLang) {
        setLanguages({
          learningLang: snapshot.user.learningLang,
          nativeLang: snapshot.user.nativeLang,
        });
      }
      setSelectedMode(null);
      setSelectedPartnerId('');
      stopOwnedScreenShare();
      setScreenShareError(null);
    }
  }, [status.value, snapshot, stopOwnedScreenShare]);

  const handleLanguageSelect = (type: 'learning' | 'native', code: string) => {
    const newLanguages = {
      ...languages,
      [type === 'learning' ? 'learningLang' : 'nativeLang']: code,
    };
    setLanguages(newLanguages);

    // Update settings
    updateSettings({ languages: newLanguages });
  };

  // Removed: Level completion logic moved to onboarding flow

  const handleModeSelect = (mode: 'roleplay' | 'live_call') => {
    setSelectedMode(mode);
    if (mode === 'roleplay') {
      setStep('scenario');
    } else {
      setStep('instructions');
    }
  };

  useEffect(() => {
    if (selectedMode !== 'live_call') {
      stopOwnedScreenShare();
      setScreenShareError(null);
    }
  }, [selectedMode, stopOwnedScreenShare]);

  useEffect(() => {
    const video = screenShareVideoRef.current;
    if (!video) {
      return;
    }
    if (screenSharePreviewStream) {
      video.srcObject = screenSharePreviewStream;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } else {
      video.pause?.();
      video.srcObject = null;
    }
  }, [screenSharePreviewStream]);

  const handleVoicePreview = useCallback(
    async (voiceId: string, sampleText: string) => {
      try {
        const fallbackText =
          sampleText && sampleText.trim().length > 0
            ? sampleText
            : "Hi! I'm your Glass roleplay partner. Let's practice together.";
        await playPreview({ voiceId, sampleText: fallbackText });
      } catch (error) {
        console.error('[StartCall] Voice preview failed', error);
        toast.error(t`Unable to play preview`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [playPreview]
  );

  const handleScreenShareSelect = useCallback(async () => {
    if (isRequestingScreenShare) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error(t`Screen sharing is not supported in this browser`, {
        description: t`Try using the latest version of Chrome, Edge, or Firefox.`,
      });
      return;
    }
    setIsRequestingScreenShare(true);
    setScreenShareError(null);
    try {
      const videoConstraints: DisplayMediaVideoOptions = {
        frameRate: 15,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        displaySurface: 'monitor',
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
      };

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: videoConstraints,
      });
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        setScreenShareError('no_audio');
        toast.error(t`Add your call audio`, {
          description: t`Select the window/tab that plays your call and enable "Share system audio".`,
        });
        return;
      }
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      screenShareStreamRef.current = stream;
      setScreenSharePreviewStream(stream);
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') {
        setScreenShareError('denied');
      } else if (error?.name === 'AbortError') {
        setScreenShareError('cancelled');
      } else {
        setScreenShareError('failed');
        console.error('[StartCall] Failed to capture screen', error);
      }
    } finally {
      setIsRequestingScreenShare(false);
    }
  }, [isRequestingScreenShare]);

  const handleRemoveScreenShare = useCallback(() => {
    stopOwnedScreenShare();
    setScreenShareError(null);
  }, [stopOwnedScreenShare]);

  const openCreatePartnerModal = () => {
    if (!token) {
      toast.error(t`Unable to create a partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    setCreatePartnerNameDraft('');
    setCreatePartnerDescriptionDraft('');
    clearCreatePartnerAvatarPreview();
    setCreatePartnerVoiceId(DEFAULT_ROLEPLAY_VOICE_ID);
    stopPreview();
    setIsCreatePartnerModalOpen(true);
  };

  const openEditPartnerModal = (partner: ConversationPartner) => {
    if (partner.isSystem) {
      return;
    }
    setPartnerToEdit(partner);
    setEditPartnerNameDraft(partner.name || '');
    setEditPartnerDescriptionDraft(partner.description || '');
    clearEditPartnerAvatarPreview();
    setEditPartnerAvatarPreview(partner.avatarUrl || null);
    setEditPartnerVoiceId(partner.voiceId || DEFAULT_ROLEPLAY_VOICE_ID);
    stopPreview();
    setIsEditPartnerModalOpen(true);
  };

  const handleCloseCreatePartnerModal = () => {
    setIsCreatePartnerModalOpen(false);
    setIsSavingCreatePartner(false);
    clearCreatePartnerAvatarPreview();
    setCreatePartnerVoiceId(DEFAULT_ROLEPLAY_VOICE_ID);
    stopPreview();
  };

  const handleCloseEditPartnerModal = () => {
    setIsEditPartnerModalOpen(false);
    setPartnerToEdit(null);
    setIsSavingEditPartner(false);
    clearEditPartnerAvatarPreview();
    setEditPartnerAvatarFile(null);
    setEditPartnerVoiceId(DEFAULT_ROLEPLAY_VOICE_ID);
    stopPreview();
  };

  const handleCreateAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setCreatePartnerAvatarFile(file);
    setCreatePartnerAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const handleEditAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setEditPartnerAvatarFile(file);
    setEditPartnerAvatarPreview((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });
  };

  const handleCreatePartnerSave = async () => {
    if (!token) {
      toast.error(t`Unable to save partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    const trimmedName = createPartnerNameDraft.trim();
    if (!trimmedName) {
      toast.error(t`Enter a name for your partner`);
      return;
    }
    setIsSavingCreatePartner(true);
    try {
      if (limitBlocked) {
        setQuotaDialogOpen(true);
        return false;
      }
      let partner = await createPartner(token, {
        name: trimmedName,
        description: createPartnerDescriptionDraft.trim() || undefined,
        learningLang: currentLearningLang,
        nativeLang: languages.nativeLang || undefined,
        voiceId: createPartnerVoiceId || undefined,
      });
      if (createPartnerAvatarFile) {
        partner = await uploadPartnerAvatar(token, partner.id, createPartnerAvatarFile);
      }
      queryClient.setQueryData<ConversationPartner[] | undefined>(
        ['partners', token, currentLearningLang],
        (previous) => {
          const existing = previous || [];
          if (existing.some((item) => item.id === partner.id)) {
            return existing;
          }
          return [partner, ...existing];
        }
      );
      setSelectedPartnerId(partner.id);
      toast.success(t`Custom partner ready`);
      handleCloseCreatePartnerModal();
    } catch (error) {
      console.error('[StartCall] Failed to save partner', error);
      toast.error(t`Unable to save partner`);
    } finally {
      setIsSavingCreatePartner(false);
    }
  };

  const handleEditPartnerSave = async () => {
    if (!token || !partnerToEdit) {
      toast.error(t`Unable to save partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    const trimmedName = editPartnerNameDraft.trim();
    if (!trimmedName) {
      toast.error(t`Enter a name for your partner`);
      return;
    }
    setIsSavingEditPartner(true);
    try {
      let partner = await updatePartner(token, partnerToEdit.id, {
        name: trimmedName,
        description: editPartnerDescriptionDraft.trim() || null,
        voiceId: editPartnerVoiceId || null,
      });
      if (editPartnerAvatarFile) {
        partner = await uploadPartnerAvatar(token, partner.id, editPartnerAvatarFile);
      }
      queryClient.setQueryData<ConversationPartner[] | undefined>(
        ['partners', token, currentLearningLang],
        (previous) => (previous || []).map((item) => (item.id === partner.id ? partner : item))
      );
      if (selectedPartnerId === partner.id) {
        setSelectedPartnerId(partner.id);
      }
      toast.success(t`Partner updated`);
      handleCloseEditPartnerModal();
    } catch (error) {
      console.error('[StartCall] Failed to update partner', error);
      toast.error(t`Unable to save partner`);
    } finally {
      setIsSavingEditPartner(false);
    }
  };

  const openDeletePartnerDialog = (partner: ConversationPartner) => {
    setPartnerPendingDelete(partner);
    setIsDeletePartnerDialogOpen(true);
  };

  const handleCancelDeletePartner = () => {
    setIsDeletePartnerDialogOpen(false);
    setPartnerPendingDelete(null);
    setIsDeletingPartner(false);
  };

  const handleConfirmDeletePartner = async () => {
    if (!token || !partnerPendingDelete) {
      return;
    }
    setIsDeletingPartner(true);
    try {
      await deletePartner(token, partnerPendingDelete.id);
      queryClient.setQueryData<ConversationPartner[] | undefined>(
        ['partners', token, currentLearningLang],
        (previous) => (previous || []).filter((item) => item.id !== partnerPendingDelete.id)
      );
      if (selectedPartnerId === partnerPendingDelete.id) {
        setSelectedPartnerId('');
      }
      toast.success(t`Partner deleted`);
    } catch (error) {
      console.error('[StartCall] Failed to delete partner', error);
      toast.error(t`Unable to delete partner`);
    } finally {
      setIsDeletingPartner(false);
      handleCancelDeletePartner();
    }
  };

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
  };

  const ensureConversationCapacity = useCallback(async () => {
    if (!limitEnabled) {
      return true;
    }
    try {
      const latestSnapshot = (await refresh()) ?? snapshot;
      const latestLimit = latestSnapshot?.limits?.conversations ?? conversationLimit;
      if (latestLimit?.limit && latestLimit.used >= latestLimit.limit) {
        setQuotaDialogOpen(true);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[StartCall] Failed to refresh before proceeding', error);
      toast.error(t`Unable to start call`, {
        description: t`Please try again in a moment.`,
      });
      return false;
    }
  }, [limitEnabled, refresh, snapshot, conversationLimit]);

  const handleInitialStart = () => {
    if (limitEnabled) {
      if (limitBlocked) {
        setQuotaDialogOpen(true);
        return;
      }
      const hasLocalCapacity = !(conversationLimit?.limit && conversationLimit.used >= conversationLimit.limit);
      if (!hasLocalCapacity) {
        setQuotaDialogOpen(true);
        return;
      }
    }
    setStep('mode');
  };

  const handleStartCall = async () => {
    if (!selectedMode) {
      toast.error(t`Select a mode to continue`);
      return;
    }

    const partnerIdForSession = selectedMode === 'roleplay' ? selectedPartnerId : null;
    let partnerForSession: ConversationPartner | null = null;

    if (selectedMode === 'roleplay') {
      if (!partnerIdForSession) {
        toast.error(t`Select a conversation partner`);
        return;
      }
      partnerForSession = roleplayPartners.find((partner) => partner.id === partnerIdForSession) || null;
      if (!partnerForSession) {
        toast.error(t`Select a conversation partner`);
        return;
      }
    }

    let screenStreamForSession: MediaStream | null = null;
    if (selectedMode === 'live_call') {
      const pendingScreenStream = screenShareStreamRef.current;
      if (!pendingScreenStream) {
        toast.error(t`Share your call first`, {
          description: t`Use "Select screen" in Step 2 so Glass can capture the call audio.`,
        });
        return;
      }
      screenStreamForSession = pendingScreenStream;
      screenShareStreamRef.current = null;
      setScreenSharePreviewStream(null);
      setScreenShareError(null);
    }

    const config: SessionConfig = {
      languages,
      mode: selectedMode,
      partnerId: partnerForSession?.id || partnerIdForSession || null,
      partner: partnerForSession,
      screenStream: screenStreamForSession,
    };

    if (limitEnabled) {
      const hasCapacity = await ensureConversationCapacity();
      if (!hasCapacity) {
        return;
      }
    }

    // Proceed with connection (onboarding should already be completed at this point)
    setStep('connecting');
    try {
      await connect(config);
    } catch {
      toast.error(t`Unable to start call`);
      setStep('instructions');
    }
  };

  const handleUpgradeClick = async () => {
    if (!token) {
      toast.error(t`Please sign in again`);
      return;
    }
    setCheckoutLoading(true);
    try {
      const session = await createCheckoutSession(token);
      if (typeof window !== 'undefined') {
        window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[StartCall] Failed to initiate checkout', error);
      toast.error(t`Unable to open checkout`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageHistoryClick = () => {
    setQuotaDialogOpen(false);
    router.push(`/${langSegment}/history`);
  };

  const CALL_PLATFORM_ICONS = [
    {
      alt: 'Zoom',
      src: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg',
    },
    {
      alt: 'Discord',
      src: 'https://upload.wikimedia.org/wikipedia/en/9/98/Discord_logo.svg',
    },
    {
      alt: 'Google Meet',
      src: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg',
    },
    {
      alt: 'Teams',
      src: 'https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg',
    },
  ];

  const renderLiveCallSteps = () => {
    const stepCardBase = cn(
      'rounded-2xl border p-3 sm:p-4 space-y-2.5 transition-colors text-xs sm:text-sm',
      glassMode ? 'bg-white/10 border-white/20' : 'bg-muted/60 border-border/60'
    );
    const stepLabelClass = glassMode ? 'text-white/60' : 'text-muted-foreground/70';
    const step2CardClass = cn(
      stepCardBase,
      !screenSharePreviewStream &&
        (glassMode
          ? 'border-emerald-300/70 shadow-[0_0_0_1px_rgba(16,185,129,0.45)]'
          : 'border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]')
    );
    const previewContainerClass = cn(
      'rounded-xl border border-dashed overflow-hidden flex items-center justify-center h-28 sm:h-32',
      glassMode ? 'border-white/25 bg-white/5 text-white/70' : 'border-border/70 bg-muted/40 text-muted-foreground'
    );
    const screenShareStatus =
      screenShareError === 'denied'
        ? t`Screen sharing permission was blocked. Allow access to continue.`
        : screenShareError === 'cancelled'
          ? t`Screen share was cancelled. Try again when you're ready.`
          : screenShareError === 'failed'
            ? t`We couldn't capture your screen. Try a different window or browser.`
            : screenShareError === 'no_audio'
              ? t`No audio detected. Share the window that plays your call and enable audio.`
              : null;
    const StepHeader = ({
      step,
      title,
      extra,
    }: {
      step: number;
      title: ReactNode;
      extra?: ReactNode;
    }) => (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('text-[10px] font-semibold uppercase tracking-[0.25em] mb-0.5', stepLabelClass)}>
            <Trans>Step {step}</Trans>
          </p>
          <div className={`${getTextClass('title')} text-sm font-semibold`}>{title}</div>
        </div>
        {extra}
      </div>
    );

    return (
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 w-full">
        <div className={stepCardBase}>
          <StepHeader
            step={1}
            title={<Trans>Join your call</Trans>}
            extra={
              <div className="hidden sm:flex items-center gap-1.5 opacity-80">
                {CALL_PLATFORM_ICONS.map((icon) => (
                  <div
                    key={icon.alt}
                    className={cn(
                      'h-6 w-6 rounded-full bg-background/60 border border-border/60 flex items-center justify-center',
                      glassMode ? 'bg-white/15 border-white/25' : ''
                    )}
                  >
                    <img src={icon.src} alt={icon.alt} className="h-4 w-4 object-contain" />
                  </div>
                ))}
              </div>
            }
          />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>Open Zoom, Discord, Meet, or any call app, join the room, and keep Glass open beside it.</Trans>
          </p>
        </div>

        <div className={step2CardClass}>
          <StepHeader step={2} title={<Trans>Share your whole screen with audio</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>Select "Entire screen" (or "Screen + audio") when the browser prompt appears, so your call audio is
            captured.</Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleScreenShareSelect}
              disabled={isRequestingScreenShare}
              className={cn('cursor-pointer', glassMode ? 'bg-white text-foreground hover:bg-white/90' : '')}
            >
              {isRequestingScreenShare && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {screenSharePreviewStream ? <Trans>Change screen</Trans> : <Trans>Select screen</Trans>}
            </Button>
            {screenSharePreviewStream && (
              <Button
                size="sm"
                variant={glassMode ? 'ghost' : 'outline'}
                onClick={handleRemoveScreenShare}
                className="cursor-pointer"
              >
                <Trans>Remove</Trans>
              </Button>
            )}
          </div>
          <div className={previewContainerClass}>
            {screenSharePreviewStream ? (
              <video
                ref={screenShareVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 px-4 text-center text-xs">
                <Trans>Your shared window will appear here once selected.</Trans>
              </div>
            )}
          </div>
          {screenSharePreviewStream && (
            <p className="text-[11px] font-semibold text-emerald-500">
              <Trans>Screen sharing ready. Keep that window unmuted so Glass can listen in.</Trans>
            </p>
          )}
          {screenShareStatus && (
            <p className="text-[11px] text-amber-400">
              {screenShareStatus}
            </p>
          )}
        </div>

        <div className={stepCardBase}>
          <StepHeader step={3} title={<Trans>Clear your view</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>Move or hide the "You're sharing" bar so it doesn't cover Glass or your notes.</Trans>
          </p>
        </div>

        <div className={stepCardBase}>
          <StepHeader step={4} title={<Trans>Start the live call</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            {screenSharePreviewStream ? (
              <Trans>Press Start Call below to connect. Glass will use your mic plus the shared audio.</Trans>
            ) : (
              <Trans>Once your screen is shared, the Start Call button will unlock.</Trans>
            )}
          </p>
        </div>
      </div>
    );
  };

  // Redirect to onboarding if not completed
  if (onboardingStatus !== null && !onboardingStatus.completed) {
    router.push(`/${langSegment}/onboarding`);
    return null;
  }

  // Debug: Log when StartCall UI should show
  const shouldShow = status.value === 'idle' || status.value === 'connecting' || status.value === 'disconnected';
  console.log('[StartCall] Should show UI:', shouldShow, 'status:', status.value);

  return (
    <>
      <AnimatePresence>
        {shouldShow ? (
          <motion.div
            key="overlay"
            ref={containerRef}
            className={'fixed inset-0 p-3 sm:p-4 flex items-center justify-center bg-background'}
            style={
              glassMode
                ? {
                    backgroundImage: 'url(/background.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }
                : undefined
            }
            initial="initial"
            animate="enter"
            exit="exit"
            variants={{
              initial: { opacity: 0 },
              enter: { opacity: 1 },
              exit: { opacity: 0 },
            }}
          >
            {/* Start Call Button */}
            {step === 'start' && (
              <>
                <div className={'flex flex-col items-center gap-3'}>
                  {glassMode ? (
                    <LiquidGlass
                      mouseContainer={containerRef}
                      className={'z-50'}
                      onClick={handleInitialStart}
                      style={{ position: 'fixed', top: '50%', left: '50%' }}
                      displacementScale={64}
                      blurAmount={0.2}
                      saturation={130}
                      aberrationIntensity={2}
                      elasticity={0.35}
                      cornerRadius={100}
                      padding="16px 32px"
                    >
                      <div className={'flex items-center gap-2 min-w-[140px] justify-center'}>
                        <Phone className={'size-4 text-green-400'} />
                        <span className="text-white font-medium whitespace-nowrap">
                          <Trans>Start Call</Trans>
                        </span>
                      </div>
                    </LiquidGlass>
                  ) : (
                    <motion.div
                      variants={{
                        initial: { scale: 0.5 },
                        enter: { scale: 1 },
                        exit: { scale: 0.5 },
                      }}
                    >
                      <Button className={'z-50 flex items-center gap-1.5 rounded-full'} onClick={handleInitialStart}>
                        <span>
                          <Phone className={'size-4 opacity-50 fill-current'} strokeWidth={0} />
                        </span>
                        <span>
                          <Trans>Start Call</Trans>
                        </span>
                      </Button>
                    </motion.div>
                  )}
                </div>
              </>
            )}

            {/* Removed: Language and Level selection moved to onboarding */}

            {/* Mode Selection */}
            {step === 'mode' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={'flex flex-col items-center gap-6 sm:gap-8 px-1.5'}
              >
                <div className={'text-center'}>
                  <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                    <Trans>How would you like to use Glass?</Trans>
                  </h2>
                  <p className={`${getTextClass('body')} text-sm`}>
                    <Trans>Choose your preferred mode</Trans>
                  </p>
                </div>

                <div className={'flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start'}>
                  <button
                    onClick={() => handleModeSelect('roleplay')}
                    className={cn(
                      'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
                      getCardClass(),
                      getScaleClass()
                    )}
                  >
                    <div className={'flex flex-col items-center gap-3'}>
                      <img
                        src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80"
                        alt="AI Roleplay person"
                        className={'h-[24px] w-[24px] sm:h-[28px] sm:w-[28px] object-cover rounded-full'}
                      />
                      <div className={'text-center'}>
                        <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                          <Trans>AI Roleplay</Trans>
                        </div>
                        <div className={`${getTextClass('body')} text-xs`}>
                          <Trans>Practice Conversations</Trans>
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleModeSelect('live_call')}
                    className={cn(
                      'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0 relative',
                      getCardClass(),
                      getScaleClass(),
                      // Disable interactions and subtly dim on mobile
                      'pointer-events-none opacity-60 sm:pointer-events-auto sm:opacity-100'
                    )}
                  >
                    {/* Recommended Badge */}
                    <div
                      className={
                        'absolute -top-2 -right-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold shadow-lg'
                      }
                    >
                      <Trans>RECOMMENDED</Trans>
                    </div>

                    <div className={'flex flex-col items-center gap-3'}>
                      {/* Call platform logos */}
                      <div className={'flex gap-2 items-center justify-center'}>
                        <svg
                          className={'h-6 w-6 opacity-80'}
                          viewBox="0 0 71 55"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
                            fill="#5865F2"
                          />
                        </svg>
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg"
                          alt="Zoom"
                          className={'h-6 w-6 object-contain opacity-80'}
                        />
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg"
                          alt="Google Meet"
                          className={'h-6 w-6 object-contain opacity-80'}
                        />
                        <img
                          src="https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg"
                          alt="Microsoft Teams"
                          className={'h-6 w-6 object-contain opacity-80'}
                        />
                      </div>
                      <div className={'text-center'}>
                        <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                          <Trans>Live Call</Trans>
                        </div>
                        <div className={`${getTextClass('body')} text-xs`}>
                          <Trans>Language Exchange • Calls</Trans>
                        </div>
                        {/* Mobile unavailability notice */}
                        <div
                          className={
                            'sm:hidden inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-1 rounded-full border ' +
                            (glassMode ? 'border-white/30 text-white/70' : 'border-border text-muted-foreground')
                          }
                        >
                          <span className={'leading-none text-xs'}>
                            <Trans>Unavailable on mobile</Trans>
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                <div className={'flex justify-between items-center w-full'}>
                  <button onClick={() => setStep('start')} className={cn(getBackButtonClass(), 'cursor-pointer')}>
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    onClick={() => setStep(selectedMode === 'roleplay' ? 'scenario' : 'instructions')}
                    disabled={!selectedMode}
                    variant={glassMode ? 'translucent' : 'default'}
                    size="sm"
                    className={cn('text-sm cursor-pointer', !selectedMode && 'opacity-50 cursor-not-allowed')}
                  >
                    <Trans>Next →</Trans>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Partner Selection (Roleplay Mode Only) */}
            {step === 'scenario' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={'flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5'}
              >
                <div className={'text-center'}>
                  <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                    <Trans>Choose who to call</Trans>
                  </h2>
                  <p className={`${getTextClass('body')} text-sm`}>
                    <Trans>Select a conversation partner</Trans>
                  </p>
                </div>
                <div className="relative w-full max-w-md mx-auto">
                  <div
                    ref={partnerListRef}
                    className="flex flex-col gap-2 w-full max-h-[60vh] overflow-y-auto pr-1 pb-3 sm:pr-2"
                  >
                    {partnersLoading ? (
                      <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
                        <Trans>Loading partners...</Trans>
                      </div>
                    ) : roleplayPartners.length === 0 ? (
                      <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
                        <Trans>No partners available</Trans>
                      </div>
                    ) : (
                      roleplayPartners.map((partner) => (
                        <div
                          key={partner.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handlePartnerSelect(partner.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handlePartnerSelect(partner.id);
                            }
                          }}
                          onMouseEnter={() => setHoveredPartner(partner)}
                          onMouseLeave={() => setHoveredPartner(null)}
                          className={cn(
                            'group px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                            getCardClass(),
                            'hover:scale-[1.01]',
                            selectedPartnerId === partner.id &&
                              (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent/50 border-foreground/30')
                          )}
                        >
                          <div className="relative flex items-center gap-3">
                            {partner.avatarUrl && (
                              <div
                                className={cn(
                                  'hidden sm:block absolute -left-48 top-1/2 -translate-y-1/2 w-40 h-40 rounded-[36px] overflow-hidden shadow-2xl border pointer-events-none transition-all duration-200',
                                  hoveredPartner?.id === partner.id
                                    ? 'opacity-100 translate-x-0'
                                    : 'opacity-0 -translate-x-3'
                                )}
                              >
                                <img
                                  src={partner.avatarUrl}
                                  alt={partner.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <PartnerAvatar
                              className={cn(
                                'h-12 w-12 flex-shrink-0',
                                glassMode
                                  ? 'border-white/30 bg-white/10 text-white/80 shadow-none'
                                  : 'bg-muted text-foreground/80'
                              )}
                              fallbackClassName={glassMode ? 'bg-transparent text-white/80' : undefined}
                              fallbackSize="md"
                              name={partner.name}
                              src={partner.avatarUrl || undefined}
                              alt={partner.name}
                            />
                            <div className={'flex-1 min-w-0 flex items-start gap-2'}>
                              <div className="flex-1 min-w-0">
                                <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>
                                  {partner.name}
                                </div>
                                <div className={`${getTextClass('muted')} text-xs truncate`}>{partner.description}</div>
                              </div>
                              {partner.isSystem === false && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-foreground rounded-lg p-1.5 border border-border/0 hover:border-border bg-muted/60 hover:bg-muted data-[state=open]:opacity-100 data-[state=open]:border-border data-[state=open]:bg-muted"
                                      aria-label="Partner actions"
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        openEditPartnerModal(partner);
                                      }}
                                    >
                                      <Trans>Edit</Trans>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        openDeletePartnerDialog(partner);
                                      }}
                                    >
                                      <Trans>Delete</Trans>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Custom Partner */}
                    <div className={'w-full'}>
                      <button
                        onClick={openCreatePartnerModal}
                        className={cn(
                          'w-full px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                          getCardClass(),
                          'hover:scale-[1.01]'
                        )}
                      >
                        <div className={'flex items-center gap-3'}>
                          <div
                            className={cn(
                              'w-12 h-12 rounded-full flex items-center justify-center border',
                              glassMode
                                ? 'border-white/30 bg-white/5 text-white/80'
                                : 'border-border bg-muted text-muted-foreground'
                            )}
                          >
                            <UserRound className="w-6 h-6" strokeWidth={1.75} />
                          </div>
                          <div className={'flex-1 min-w-0'}>
                            <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>
                              <Trans>Custom partner</Trans>
                            </div>
                            <div className={`${getTextClass('muted')} text-xs truncate`}>
                              <Trans>Create your own conversation partner</Trans>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                  {showPartnerListGradient && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/90 via-card/70 to-transparent" />
                  )}
                </div>
                <div className={'flex justify-between items-center w-full'}>
                  <button onClick={() => setStep('mode')} className={cn(getBackButtonClass(), 'cursor-pointer')}>
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    onClick={handleStartCall}
                    disabled={!selectedPartnerId}
                    variant="default"
                    className={cn(
                      'cursor-pointer rounded-full px-6 py-2 sm:px-7 sm:py-2.5 inline-flex items-center gap-1.5 font-semibold tracking-tight text-white bg-emerald-500 hover:bg-emerald-600',
                      !selectedPartnerId && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Phone className="size-4 opacity-80" strokeWidth={2.25} />
                    <Trans>Start Call</Trans>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Instructions Screen */}
            {step === 'instructions' && selectedMode && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={'flex flex-col items-center gap-5 sm:gap-6 max-w-lg mx-auto px-1.5'}
              >
                <div className={'text-center'}>
                  <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                    {selectedMode === 'roleplay' ? <Trans>AI Roleplay</Trans> : <Trans>Live Call</Trans>}
                  </h2>
                </div>

                <div
                  className={cn(
                    'rounded-2xl p-4 sm:p-6',
                    glassMode ? 'bg-white/10 backdrop-blur-sm border border-white/20' : 'bg-card border border-border'
                  )}
                >
                  {selectedMode === 'roleplay' ? (
                    <div className={getTextClass('title')}>
                      {selectedRoleplayPartner ? (
                        <div>
                          <p className={`text-xs ${getTextClass('muted')} mb-1.5 sm:mb-2`}>
                            <Trans>Partner</Trans>
                          </p>
                          <p className={'text-base font-medium'}>{selectedRoleplayPartner.name}</p>
                          {selectedRoleplayPartner.description && (
                            <p className={`${getTextClass('body')} text-sm mt-1`}>
                              {selectedRoleplayPartner.description}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className={`${getTextClass('muted')} text-sm`}>
                          <Trans>Select a partner to see details.</Trans>
                        </p>
                      )}
                    </div>
                  ) : (
                    renderLiveCallSteps()
                  )}
                </div>

                <div className={'flex justify-between items-center w-full'}>
                  <button onClick={() => setStep('mode')} className={cn(getBackButtonClass(), 'cursor-pointer')}>
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    variant="default"
                    onClick={handleStartCall}
                    disabled={!canStartCall}
                    className={cn(
                      'cursor-pointer rounded-full px-6 py-2 sm:px-7 sm:py-2.5 inline-flex items-center gap-1.5 font-semibold tracking-tight text-white bg-emerald-500 hover:bg-emerald-600',
                      !canStartCall && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Phone className="size-4 opacity-80" strokeWidth={2.25} />
                    <Trans>Start Call</Trans>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Connecting State */}
            {step === 'connecting' && (
              <>
                {glassMode ? (
                  <LiquidGlass
                    mouseContainer={containerRef}
                    className={'z-50'}
                    style={{ position: 'fixed', top: '50%', left: '50%' }}
                    displacementScale={64}
                    blurAmount={0.1}
                    saturation={130}
                    aberrationIntensity={2}
                    cornerRadius={100}
                    padding="16px 32px"
                  >
                    <div className={'flex items-center gap-2 min-w-[140px] justify-center'}>
                      <Loader2 className={'size-4 opacity-50 animate-spin'} />
                      <span className="text-white font-medium whitespace-nowrap">
                        <Trans>Connecting...</Trans>
                      </span>
                    </div>
                  </LiquidGlass>
                ) : (
                  <motion.div initial={false} animate={{ scale: 1 }} exit={{ scale: 1 }}>
                    <Button
                      className={
                        'z-50 flex items-center gap-1.5 rounded-full px-6 py-2 sm:px-8 sm:py-2.5 min-w-[140px]'
                      }
                      disabled
                    >
                      <Loader2 className={'size-4 opacity-50 animate-spin'} />
                      <span>
                        <Trans>Connecting...</Trans>
                      </span>
                    </Button>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Dialog open={isCreatePartnerModalOpen} onOpenChange={(open) => !open && handleCloseCreatePartnerModal()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              <Trans>Create partner</Trans>
            </DialogTitle>
            <DialogDescription className="text-sm">
              <Trans>Give your custom partner a name, description, and optional photo.</Trans>
            </DialogDescription>
          </DialogHeader>
          <input
            ref={createPartnerAvatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCreateAvatarChange}
          />
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => createPartnerAvatarInputRef.current?.click()}
                disabled={isSavingCreatePartner}
                className="group relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                aria-label={t`Change partner photo`}
              >
                <PartnerAvatar
                  className="pointer-events-none h-20 w-20"
                  fallbackSize="lg"
                  name={createPartnerNameDraft || undefined}
                  src={createPartnerAvatarPreview || undefined}
                  alt={createPartnerNameDraft || t`Partner`}
                />
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                    isSavingCreatePartner && 'opacity-100'
                  )}
                >
                  {isSavingCreatePartner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
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
                  value={createPartnerNameDraft}
                  onChange={(event) => {
                    setCreatePartnerNameDraft(event.target.value);
                  }}
                  placeholder={t`Enter a name`}
                  disabled={isSavingCreatePartner}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trans>Description</Trans>
                </Label>
                <Textarea
                  value={createPartnerDescriptionDraft}
                  onChange={(event) => {
                    setCreatePartnerDescriptionDraft(event.target.value);
                  }}
                  placeholder={t`Add a short description`}
                  disabled={isSavingCreatePartner}
                  rows={3}
                />
              </div>
              <PartnerVoiceSelector
                selectedVoiceId={createPartnerVoiceId || DEFAULT_ROLEPLAY_VOICE_ID}
                onSelect={setCreatePartnerVoiceId}
                onPreview={handleVoicePreview}
                loadingVoiceId={loadingVoiceId}
                playingVoiceId={playingVoiceId}
                disabled={isSavingCreatePartner}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCloseCreatePartnerModal}
              disabled={isSavingCreatePartner}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              <Trans>Close</Trans>
            </Button>
            <Button
              size="sm"
              onClick={handleCreatePartnerSave}
              disabled={isSavingCreatePartner || !createPartnerNameDraft.trim()}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {isSavingCreatePartner && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Trans>Create</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditPartnerModalOpen} onOpenChange={(open) => !open && handleCloseEditPartnerModal()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              <Trans>Edit partner</Trans>
            </DialogTitle>
            <DialogDescription className="text-sm">
              <Trans>Update your custom partner details.</Trans>
            </DialogDescription>
          </DialogHeader>
          <input
            ref={editPartnerAvatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleEditAvatarChange}
          />
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => editPartnerAvatarInputRef.current?.click()}
                disabled={isSavingEditPartner}
                className="group relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                aria-label={t`Change partner photo`}
              >
                <PartnerAvatar
                  className="pointer-events-none h-20 w-20"
                  fallbackSize="lg"
                  name={editPartnerNameDraft || undefined}
                  src={editPartnerAvatarPreview || undefined}
                  alt={editPartnerNameDraft || t`Partner`}
                />
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                    isSavingEditPartner && 'opacity-100'
                  )}
                >
                  {isSavingEditPartner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
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
                  value={editPartnerNameDraft}
                  onChange={(event) => setEditPartnerNameDraft(event.target.value)}
                  placeholder={t`Enter a name`}
                  disabled={isSavingEditPartner}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trans>Description</Trans>
                </Label>
                <Textarea
                  value={editPartnerDescriptionDraft}
                  onChange={(event) => setEditPartnerDescriptionDraft(event.target.value)}
                  placeholder={t`Add a short description`}
                  disabled={isSavingEditPartner}
                  rows={3}
                />
              </div>
              <PartnerVoiceSelector
                selectedVoiceId={editPartnerVoiceId || DEFAULT_ROLEPLAY_VOICE_ID}
                onSelect={setEditPartnerVoiceId}
                onPreview={handleVoicePreview}
                loadingVoiceId={loadingVoiceId}
                playingVoiceId={playingVoiceId}
                disabled={isSavingEditPartner}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCloseEditPartnerModal}
              disabled={isSavingEditPartner}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              <Trans>Close</Trans>
            </Button>
            <Button
              size="sm"
              onClick={handleEditPartnerSave}
              disabled={isSavingEditPartner || !editPartnerNameDraft.trim()}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {isSavingEditPartner && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Trans>Save</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeletePartnerDialogOpen} onOpenChange={(open) => !open && handleCancelDeletePartner()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete partner</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {partnerPendingDelete ? (
                <Trans>
                  Are you sure you want to delete {partnerPendingDelete.name}? This action cannot be undone.
                </Trans>
              ) : (
                <Trans>This action cannot be undone.</Trans>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDeletePartner}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDeletePartner();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeletingPartner}
            >
              {isDeletingPartner && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={quotaDialogOpen} onOpenChange={setQuotaDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              <Trans>Saved call limit reached</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Free accounts can keep up to 10 conversations. Delete old calls or upgrade for unlimited history.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border/60 bg-muted/50 px-4 py-5 text-center space-y-3">
            <div className="inline-flex items-center justify-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium text-muted-foreground">
                <Trans>Current usage</Trans>
              </span>
            </div>
            <div className="text-3xl font-semibold tracking-tight">{limitUsageLabel || limitDisplayUsed}</div>
            <p className="text-xs text-muted-foreground">
              <Trans>Delete a saved call or upgrade to keep recording new ones.</Trans>
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleManageHistoryClick} className="cursor-pointer">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              <Trans>Manage history</Trans>
            </Button>
            <Button onClick={handleUpgradeClick} className="cursor-pointer" disabled={checkoutLoading}>
              {checkoutLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Trans>Upgrade plan</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
