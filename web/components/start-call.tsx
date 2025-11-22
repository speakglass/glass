import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/glass-context';
import { useAccountSession, type SessionData } from '@/contexts/account-session-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone, AlertTriangle, Trash2 } from 'lucide-react';
import LiquidGlass from './liquid-glass';
import { ModeSelection } from './start-call-mode-selection';
import { PartnerSelection } from './start-call-partner-selection';
import { StartCallInstructions } from './start-call-instructions';
import { CustomPartnerCreator, CustomPartnerEditor } from './custom-partner-creator';
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
  deletePartner,
  createCheckoutSession,
  fetchAccountSnapshot,
} from '@/lib/account-api';
import { useVoicePreviewPlayer } from '@/hooks/use-voice-preview';
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

type SetupStep = 'start' | 'languages' | 'level' | 'mode' | 'scenario' | 'instructions';
type DisplayMediaVideoOptions = MediaTrackConstraints & {
  displaySurface?: 'monitor' | 'window' | 'application' | 'browser';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
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
  const [selectedMode, setSelectedMode] = useState<'roleplay' | 'live_call' | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const profileLanguagesRef = useRef<LanguageSettings | null>(null);
  const [isCustomPartnerCreatorOpen, setIsCustomPartnerCreatorOpen] = useState(false);
  const [isEditPartnerModalOpen, setIsEditPartnerModalOpen] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<ConversationPartner | null>(null);

  const [isDeletePartnerDialogOpen, setIsDeletePartnerDialogOpen] = useState(false);
  const [partnerPendingDelete, setPartnerPendingDelete] = useState<ConversationPartner | null>(null);
  const [isDeletingPartner, setIsDeletingPartner] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [screenSharePreviewStream, setScreenSharePreviewStream] = useState<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const step4CardRef = useRef<HTMLDivElement | null>(null);
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

  const isLiveCallStarting = selectedMode === 'live_call' && isStartingCall;
  const glassMode = settings.glassMode ?? false;
  const canStartCall =
    selectedMode === 'roleplay'
      ? Boolean(selectedPartnerId)
      : selectedMode === 'live_call'
      ? Boolean(screenSharePreviewStream)
      : false;
  const partnersQueryEnabled = !!token && !!snapshot?.user.learningLang;
  const {
    data: partnersData,
    isLoading: partnersQueryLoading,
    isFetching: partnersFetching,
  } = useQuery({
    queryKey: ['partners', token, snapshot?.user.learningLang],
    queryFn: () => fetchPartners(token!, snapshot!.user.learningLang),
    enabled: partnersQueryEnabled,
    staleTime: Infinity, // Never mark as stale to prevent automatic refetches
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  const partnersLoading = partnersQueryEnabled ? partnersQueryLoading || partnersFetching : true;
  const roleplayPartners: ConversationPartner[] = (partnersData ?? []).filter((partner) => partner.kind === 'roleplay');
  const selectedRoleplayPartner = roleplayPartners.find((partner) => partner.id === selectedPartnerId);

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

  // Sync languages from the profile and remember the last good pair for later resets.
  useEffect(() => {
    const learningLang = snapshot?.user.learningLang;
    const nativeLang = snapshot?.user.nativeLang;
    if (!learningLang || !nativeLang) {
      return;
    }
    const userLanguages = { learningLang, nativeLang };
    const previous = profileLanguagesRef.current;
    const changed = !previous || previous.learningLang !== learningLang || previous.nativeLang !== nativeLang;
    if (!changed) {
      return;
    }
    profileLanguagesRef.current = userLanguages;
    setLanguages(userLanguages);
    updateSettings({ languages: userLanguages });
  }, [snapshot?.user.learningLang, snapshot?.user.nativeLang, updateSettings]);

  // Reset step when disconnected. Only depend on status changes so quota refreshes
  // don't accidentally clear the local wizard state.
  useEffect(() => {
    console.log('[StartCall] Status effect triggered:', status.value);
    if (status.value === 'disconnected' || status.value === 'idle') {
      console.log('[StartCall] Resetting to start screen');
      setStep('start');
      setIsStartingCall(false);
      // Keep languages from user profile
      if (profileLanguagesRef.current) {
        setLanguages(profileLanguagesRef.current);
      }
      setSelectedMode(null);
      setSelectedPartnerId('');
      stopOwnedScreenShare();
      setScreenShareError(null);
    }
  }, [status.value, stopOwnedScreenShare]);

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

  useEffect(() => {
    if (screenSharePreviewStream) {
      step4CardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
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
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: videoConstraints,
      });
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        setScreenShareError('no_audio');
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
    setIsCustomPartnerCreatorOpen(true);
  };

  const openEditPartnerModal = (partner: ConversationPartner) => {
    if (partner.isSystem) {
      return;
    }
    setPartnerToEdit(partner);
    stopPreview();
    setIsEditPartnerModalOpen(true);
  };

  const handleCloseCreatePartnerModal = () => {
    setIsCustomPartnerCreatorOpen(false);
  };

  const handleCloseEditPartnerModal = () => {
    setIsEditPartnerModalOpen(false);
    setPartnerToEdit(null);
    stopPreview();
  };

  const handlePartnerCreated = (partner: ConversationPartner) => {
    setSelectedPartnerId(partner.id);
  };

  const handlePartnerUpdated = (partner: ConversationPartner) => {
    if (selectedPartnerId === partner.id) {
      setSelectedPartnerId(partner.id);
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
        ['partners', token, snapshot?.user.learningLang],
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

    let latestSnapshot = snapshot;
    if (token) {
      try {
        latestSnapshot = await fetchAccountSnapshot(token);
        if (latestSnapshot) {
          const snapshotForCache = latestSnapshot;
          queryClient.setQueryData<SessionData | undefined>(['accountSession'], (previous) => {
            if (!previous) {
              return previous;
            }
            return { ...previous, snapshot: snapshotForCache };
          });
        }
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : null;
        if (statusCode === 401) {
          const refreshed = await refresh();
          latestSnapshot = refreshed?.snapshot ?? latestSnapshot ?? snapshot;
        } else {
          console.error('[StartCall] Failed to fetch snapshot for limit check', error);
        }
      }
    }

    if (!latestSnapshot) {
      try {
        const refreshed = await refresh();
        latestSnapshot = refreshed?.snapshot ?? snapshot;
      } catch (error) {
        console.error('[StartCall] Failed to refresh before proceeding', error);
        toast.error(t`Unable to start call`, {
          description: t`Please try again in a moment.`,
        });
        return false;
      }
    }

    const latestLimit = latestSnapshot?.limits?.conversations ?? conversationLimit;
    if (latestLimit?.limit && latestLimit.used >= latestLimit.limit) {
      setQuotaDialogOpen(true);
      return false;
    }
    return true;
  }, [limitEnabled, token, refresh, snapshot, conversationLimit, queryClient]);

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

    if (isStartingCall) {
      return;
    }

    // Set loading state immediately for instant UI feedback
    setIsStartingCall(true);

    try {
      const partnerIdForSession = selectedMode === 'roleplay' ? selectedPartnerId : null;
      let partnerForSession: ConversationPartner | null = null;

      if (selectedMode === 'roleplay') {
        if (!partnerIdForSession) {
          toast.error(t`Select a conversation partner`);
          setIsStartingCall(false);
          return;
        }
        partnerForSession = roleplayPartners.find((partner) => partner.id === partnerIdForSession) || null;
        if (!partnerForSession) {
          toast.error(t`Select a conversation partner`);
          setIsStartingCall(false);
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
          setIsStartingCall(false);
          return;
        }
        screenStreamForSession = pendingScreenStream;
        setScreenShareError(null);
      }

      if (limitEnabled) {
        const hasCapacity = await ensureConversationCapacity();
        if (!hasCapacity) {
          setIsStartingCall(false);
          return;
        }
      }

      const config: SessionConfig = {
        languages,
        mode: selectedMode,
        partnerId: partnerForSession?.id || partnerIdForSession || null,
        partner: partnerForSession,
        screenStream: screenStreamForSession,
      };

      // Proceed with connection
      await connect(config);
    } catch (error) {
      console.error('[StartCall] Connection failed:', error);
      toast.error(t`Unable to start call`);
      setIsStartingCall(false);
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
    const StepHeader = ({ step, title, extra }: { step: number; title: ReactNode; extra?: ReactNode }) => (
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

    const step4CardClass = cn(
      stepCardBase,
      screenSharePreviewStream &&
        (glassMode
          ? 'border-emerald-300/70 shadow-[0_0_0_1px_rgba(16,185,129,0.45)] shadow-emerald-300/30'
          : 'border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]')
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
            <Trans>Open Zoom, Discord, Meet, or any call app and join the room you're about to share.</Trans>
          </p>
        </div>

        <div className={step2CardClass}>
          <StepHeader step={2} title={<Trans>Share your whole screen with audio</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>
              Share the screen where your call is already open, choose "Entire screen," and toggle "Also share system
              audio."
            </Trans>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleScreenShareSelect}
              disabled={isRequestingScreenShare || isLiveCallStarting}
              className={cn(
                'cursor-pointer',
                glassMode ? 'bg-white text-foreground hover:bg-white/90' : '',
                (isRequestingScreenShare || isLiveCallStarting) && 'cursor-not-allowed opacity-70'
              )}
            >
              {isRequestingScreenShare && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {screenSharePreviewStream ? <Trans>Change screen</Trans> : <Trans>Select screen</Trans>}
            </Button>
            {screenSharePreviewStream && (
              <Button
                size="sm"
                variant={glassMode ? 'ghost' : 'outline'}
                onClick={handleRemoveScreenShare}
                disabled={isLiveCallStarting}
                className={cn('cursor-pointer', isLiveCallStarting && 'cursor-not-allowed opacity-70')}
              >
                <Trans>Remove</Trans>
              </Button>
            )}
          </div>
          {screenSharePreviewStream && (
            <div className={previewContainerClass}>
              <video ref={screenShareVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            </div>
          )}
          {screenSharePreviewStream && (
            <p className="text-[11px] font-semibold text-emerald-500">
              <Trans>Screen sharing ready. Keep it running so Glass can listen in.</Trans>
            </p>
          )}
          {screenShareStatus && (
            <p
              className={cn(
                'text-[11px]',
                screenShareError === 'denied' || screenShareError === 'no_audio' ? 'text-red-500' : 'text-amber-400'
              )}
            >
              {screenShareStatus}
            </p>
          )}
        </div>

        <div className={stepCardBase}>
          <StepHeader step={3} title={<Trans>Clear your view</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>Use the browser's “Hide” option on the sharing bar so it doesn't cover Glass.</Trans>
          </p>
        </div>

        <div ref={step4CardRef} className={step4CardClass}>
          <StepHeader step={4} title={<Trans>Start the live call</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            {screenSharePreviewStream ? (
              isLiveCallStarting ? (
                <Trans>Connecting to Glass. Keep your screen share running while we join.</Trans>
              ) : (
                <Trans>Press Start Call below to connect. Glass will use your mic plus the shared audio.</Trans>
              )
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
  // Show StartCall UI until actually connected
  const shouldShow = status.value === 'idle' || status.value === 'disconnected' || status.value === 'connecting';

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
              <ModeSelection
                glassMode={glassMode}
                selectedMode={selectedMode}
                onSelectMode={handleModeSelect}
                onBack={() => setStep('start')}
                onNext={() => setStep(selectedMode === 'roleplay' ? 'scenario' : 'instructions')}
                getTextClass={getTextClass}
                getCardClass={getCardClass}
                getScaleClass={getScaleClass}
                getBackButtonClass={getBackButtonClass}
              />
            )}

            {/* Partner Selection (Roleplay Mode Only) */}
            {step === 'scenario' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5"
              >
                <PartnerSelection
                  glassMode={glassMode}
                  roleplayPartners={roleplayPartners}
                  partnersLoading={partnersLoading}
                  selectedPartnerId={selectedPartnerId}
                  onSelectPartner={handlePartnerSelect}
                  getCardClass={getCardClass}
                  getTextClass={getTextClass}
                  openCreatePartnerModal={openCreatePartnerModal}
                  openEditPartnerModal={openEditPartnerModal}
                  openDeletePartnerDialog={openDeletePartnerDialog}
                  isStartingCall={isStartingCall}
                />
                <div className={'flex justify-between items-center w-full'}>
                  <button
                    onClick={() => setStep('mode')}
                    className={cn(getBackButtonClass(), 'cursor-pointer')}
                    disabled={isStartingCall}
                  >
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    onClick={handleStartCall}
                    disabled={!selectedPartnerId || isStartingCall}
                    variant="default"
                    className={cn(
                      'cursor-pointer rounded-full px-6 py-2 sm:px-7 sm:py-2.5 inline-flex items-center gap-1.5 font-semibold tracking-tight text-white bg-emerald-500 hover:bg-emerald-600',
                      (!selectedPartnerId || isStartingCall) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isStartingCall ? (
                      <Loader2 className="size-4 opacity-80 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Phone className="size-4 opacity-80" strokeWidth={2.25} />
                    )}
                    {isStartingCall ? <Trans>Connecting...</Trans> : <Trans>Start Call</Trans>}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Instructions Screen */}
            {step === 'instructions' && selectedMode && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <StartCallInstructions
                  glassMode={glassMode}
                  selectedMode={selectedMode}
                  selectedRoleplayPartner={selectedRoleplayPartner}
                  getTextClass={getTextClass}
                  getBackButtonClass={getBackButtonClass}
                  canStartCall={canStartCall}
                  isStartingCall={isStartingCall}
                  onBack={() => setStep('mode')}
                  onStartCall={handleStartCall}
                  liveCallSteps={renderLiveCallSteps()}
                />
              </motion.div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <CustomPartnerCreator
        open={isCustomPartnerCreatorOpen}
        onClose={handleCloseCreatePartnerModal}
        token={token ?? null}
        learningLang={snapshot?.user.learningLang ?? undefined}
        nativeLang={snapshot?.user.nativeLang || null}
        limitBlocked={limitBlocked}
        onQuotaBlocked={() => setQuotaDialogOpen(true)}
        onPartnerCreated={handlePartnerCreated}
      />

      <CustomPartnerEditor
        open={isEditPartnerModalOpen}
        onClose={handleCloseEditPartnerModal}
        partner={partnerToEdit}
        token={token ?? null}
        learningLang={snapshot?.user.learningLang ?? undefined}
        onPartnerUpdated={handlePartnerUpdated}
        onVoicePreview={handleVoicePreview}
        loadingVoiceId={loadingVoiceId}
        playingVoiceId={playingVoiceId}
      />

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
