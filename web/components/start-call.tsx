import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/glass-context';
import { useAccountSession, type SessionData } from '@/contexts/account-session-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone } from 'lucide-react';
import { PartnerSelection } from './start-call-partner-selection';
import { StartCallInstructions } from './start-call-instructions';
import { CustomPartnerCreator } from './custom-partner-creator';
import { PartnerDeleteDialog } from './partner-delete-dialog';
import { PartnerDetailModal } from './partner-detail-modal';
import { CallLimitDialog } from './call-limit-dialog';
import { StartCallEntry } from './start-call-entry';
import { toast } from 'sonner';
import { useRef, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConversationPartner, fetchPartners, createCheckoutSession, fetchAccountSnapshot } from '@/lib/account-api';
import { getLanguageName } from '@/lib/conversation-display';
import { LANGUAGES } from './onboarding/onboarding-data';

type SetupStep = 'start' | 'partner' | 'instructions';
type DisplayMediaVideoOptions = MediaTrackConstraints & {
  displaySurface?: 'monitor' | 'window' | 'application' | 'browser';
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
};

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const { onboardingStatus, snapshot, token, refresh } = useAccountSession();
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
  const [liveCallLanguageMode, setLiveCallLanguageMode] = useState<'shared' | 'custom'>('shared');
  const [liveCallCustomPair, setLiveCallCustomPair] = useState<{ youLang: string; partnerLang: string }>({
    youLang: '',
    partnerLang: '',
  });
  const [selectedMode, setSelectedMode] = useState<'roleplay' | 'live_call' | null>('roleplay');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const profileLanguagesRef = useRef<LanguageSettings | null>(null);
  const [isCustomPartnerCreatorOpen, setIsCustomPartnerCreatorOpen] = useState(false);
  const [isEditPartnerModalOpen, setIsEditPartnerModalOpen] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<ConversationPartner | null>(null);

  const [isDeletePartnerDialogOpen, setIsDeletePartnerDialogOpen] = useState(false);
  const [partnerPendingDelete, setPartnerPendingDelete] = useState<ConversationPartner | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [conversationQuotaDialogOpen, setConversationQuotaDialogOpen] = useState(false);
  const [partnerQuotaDialogOpen, setPartnerQuotaDialogOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [screenSharePreviewStream, setScreenSharePreviewStream] = useState<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const step5CardRef = useRef<HTMLDivElement | null>(null);
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [screenShareError, setScreenShareError] = useState<'denied' | 'cancelled' | 'failed' | 'no_audio' | null>(null);
  const conversationLimit = snapshot?.limits?.conversations || null;
  const conversationLimitEnabled = Boolean(conversationLimit?.enabled && conversationLimit?.limit);
  const conversationLimitMax = conversationLimit?.limit ?? null;
  const conversationLimitUsed = conversationLimit?.used ?? 0;
  const conversationLimitDisplayUsed =
    conversationLimitMax !== null ? Math.min(conversationLimitUsed, conversationLimitMax) : conversationLimitUsed;
  const conversationLimitUsageLabel =
    conversationLimitMax !== null ? `${conversationLimitDisplayUsed}/${conversationLimitMax}` : null;
  const conversationLimitBlocked = Boolean(conversationLimitEnabled && conversationLimit?.blocked);
  const partnerLimit = snapshot?.limits?.partners || null;
  const partnerLimitEnabled = Boolean(partnerLimit?.enabled && partnerLimit?.limit);
  const partnerLimitMax = partnerLimit?.limit ?? null;
  const partnerLimitUsed = partnerLimit?.used ?? 0;
  const partnerLimitDisplayUsed =
    partnerLimitMax !== null ? Math.min(partnerLimitUsed, partnerLimitMax) : partnerLimitUsed;
  const partnerLimitUsageLabel = partnerLimitMax !== null ? `${partnerLimitDisplayUsed}/${partnerLimitMax}` : null;
  const partnerLimitBlocked = Boolean(partnerLimitEnabled && partnerLimit?.blocked);
  const stopOwnedScreenShare = useCallback(() => {
    const stream = screenShareStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
    }
    setScreenSharePreviewStream(null);
  }, []);
  const learningLanguageName =
    languages.learningLang && languages.learningLang.length > 0
      ? getLanguageName(languages.learningLang, langSegment)
      : t`your learning language`;
  const customLanguageSelectionReady = Boolean(liveCallCustomPair.youLang && liveCallCustomPair.partnerLang);
  const liveLanguagesReady = liveCallLanguageMode === 'shared' || customLanguageSelectionReady;

  const isLiveCallStarting = selectedMode === 'live_call' && isStartingCall;
  const canStartCall =
    selectedMode === 'roleplay'
      ? Boolean(selectedPartnerId)
      : selectedMode === 'live_call'
      ? Boolean(screenSharePreviewStream) && liveLanguagesReady
      : false;
  const partnersQueryEnabled = !!token;
  const {
    data: partnersData,
    isLoading: partnersQueryLoading,
    isFetching: partnersFetching,
  } = useQuery({
    queryKey: ['partners', token],
    queryFn: () => fetchPartners(token!),
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
  };

  const getCardClass = () => {
    return 'bg-card border border-border hover:bg-accent/50 hover:border-border';
  };

  const getBackButtonClass = () => {
    return 'text-muted-foreground hover:text-foreground text-sm transition-colors';
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
      setLiveCallLanguageMode('shared');
      setLiveCallCustomPair({ youLang: '', partnerLang: '' });
    }
  }, [status.value, stopOwnedScreenShare]);

  // Removed: Level completion logic moved to onboarding flow

  const handleCustomLanguageSelect = (target: 'you' | 'partner', code: string) => {
    setLiveCallCustomPair((prev) => ({
      ...prev,
      [target === 'you' ? 'youLang' : 'partnerLang']: code,
    }));
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
      step5CardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [screenSharePreviewStream]);

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
    const run = async () => {
      if (partnerLimitEnabled) {
        const hasCapacity = await ensurePartnerCapacity();
        if (!hasCapacity) {
          return;
        }
      }
      setIsCustomPartnerCreatorOpen(true);
    };
    void run();
  };

  const openEditPartnerModal = (partner: ConversationPartner) => {
    setPartnerToEdit(partner);
    setIsEditPartnerModalOpen(true);
  };

  const handleCloseCreatePartnerModal = () => {
    setIsCustomPartnerCreatorOpen(false);
  };

  const handleCloseEditPartnerModal = () => {
    setIsEditPartnerModalOpen(false);
    setPartnerToEdit(null);
  };

  const handlePartnerCreated = (partner: ConversationPartner) => {
    setSelectedPartnerId(partner.id);
    if (partner.kind === 'roleplay') {
      adjustPartnerLimitUsage(1);
    }
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
  };

  const handlePartnerDeleted = (partnerId: string) => {
    if (selectedPartnerId === partnerId) {
      setSelectedPartnerId('');
    }
    if (partnerPendingDelete && partnerPendingDelete.id === partnerId && partnerPendingDelete.kind === 'roleplay') {
      adjustPartnerLimitUsage(-1);
    }
    handleCancelDeletePartner();
  };

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
  };

  const ensureConversationCapacity = useCallback(async () => {
    if (!conversationLimitEnabled) {
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
      setConversationQuotaDialogOpen(true);
      return false;
    }
    return true;
  }, [conversationLimitEnabled, token, refresh, snapshot, conversationLimit, queryClient]);

  const ensurePartnerCapacity = useCallback(async () => {
    if (!partnerLimitEnabled) {
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
          console.error('[StartCall] Failed to fetch snapshot for partner limit check', error);
        }
      }
    }

    if (!latestSnapshot) {
      try {
        const refreshed = await refresh();
        latestSnapshot = refreshed?.snapshot ?? snapshot;
      } catch (error) {
        console.error('[StartCall] Failed to refresh before partner action', error);
        toast.error(t`Unable to create partner`, {
          description: t`Please try again in a moment.`,
        });
        return false;
      }
    }

    const latestLimit = latestSnapshot?.limits?.partners ?? partnerLimit;
    if (latestLimit?.limit && latestLimit.used >= latestLimit.limit) {
      setPartnerQuotaDialogOpen(true);
      return false;
    }
    return true;
  }, [partnerLimitEnabled, token, refresh, snapshot, partnerLimit, queryClient]);

  const adjustPartnerLimitUsage = useCallback(
    (delta: number) => {
      queryClient.setQueryData<SessionData | undefined>(['accountSession'], (previous) => {
        if (!previous?.snapshot?.limits?.partners) {
          return previous;
        }
        const partnersLimit = previous.snapshot.limits.partners;
        const limitValue = partnersLimit.limit;
        const nextUsed = Math.max(0, partnersLimit.used + delta);
        const nextRemaining = limitValue !== null ? Math.max(limitValue - nextUsed, 0) : partnersLimit.remaining;
        return {
          ...previous,
          snapshot: {
            ...previous.snapshot,
            limits: {
              ...previous.snapshot.limits,
              partners: {
                ...partnersLimit,
                used: nextUsed,
                remaining: nextRemaining,
                blocked: limitValue !== null ? nextUsed >= limitValue : partnersLimit.blocked,
              },
            },
          },
        };
      });
    },
    [queryClient]
  );

  const handleInitialStart = () => {
    setSelectedMode('roleplay'); // Set mode to roleplay when starting
    setStep('partner'); // Skip mode selection, go directly to partner selection
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
          toast.error(t`Select a language partner`);
          setIsStartingCall(false);
          return;
        }
        partnerForSession = roleplayPartners.find((partner) => partner.id === partnerIdForSession) || null;
        if (!partnerForSession) {
          toast.error(t`Select a language partner`);
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

      if (conversationLimitEnabled) {
        const hasCapacity = await ensureConversationCapacity();
        if (!hasCapacity) {
          setIsStartingCall(false);
          return;
        }
      }

      const userNativeLang = languages.nativeLang || languages.learningLang || 'en';
      const partnerNativeLang = partnerForSession?.nativeLang || languages.learningLang || languages.nativeLang || 'en';
      let spokenLanguages: { user: string; partner: string };

      if (selectedMode === 'roleplay') {
        const sharedLang = partnerNativeLang || userNativeLang;
        spokenLanguages = {
          user: sharedLang,
          partner: sharedLang,
        };
      } else {
        if (liveCallLanguageMode === 'shared') {
          const sharedLang = languages.learningLang || userNativeLang;
          spokenLanguages = {
            user: sharedLang,
            partner: sharedLang,
          };
        } else {
          spokenLanguages = {
            user: liveCallCustomPair.youLang || userNativeLang,
            partner: liveCallCustomPair.partnerLang || partnerNativeLang,
          };
        }
      }

      const userNativeLanguage =
        languages.nativeLang || snapshot?.user.nativeLang || settings.languages?.nativeLang || null;
      const config: SessionConfig = {
        languages,
        mode: selectedMode,
        partnerId: partnerForSession?.id || partnerIdForSession || null,
        partner: partnerForSession,
        screenStream: screenStreamForSession,
        spokenLanguages,
        userNativeLanguage,
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
    setConversationQuotaDialogOpen(false);
    router.push(`/${langSegment}/history`);
  };

  const handleManagePartnersClick = () => {
    setPartnerQuotaDialogOpen(false);
    setStep('partner');
    setIsCustomPartnerCreatorOpen(false);
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
      'bg-muted/60 border-border/60'
    );
    const stepLabelClass = 'text-muted-foreground/70';
    const step3CardClass = cn(
      stepCardBase,
      !screenSharePreviewStream && 'border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
    );
    const previewContainerClass = cn(
      'rounded-xl border border-dashed overflow-hidden flex items-center justify-center h-28 sm:h-32',
      'border-border/70 bg-muted/40 text-muted-foreground'
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
            {t`Step ${step}`}
          </p>
          <div className={`${getTextClass('title')} text-sm font-semibold`}>{title}</div>
        </div>
        {extra}
      </div>
    );

    const step5CardClass = cn(
      stepCardBase,
      screenSharePreviewStream && 'border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.2)] shadow-emerald-500/30'
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
                      ''
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

        <div className={stepCardBase}>
          <div className="space-y-2">
            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.25em] mb-0.5', stepLabelClass)}>
              {t`Step ${2}`}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className={`${getTextClass('title')} text-sm font-semibold`}>
                {t`Both speak ${learningLanguageName} in this call?`}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-medium transition-all border cursor-pointer',
                    liveCallLanguageMode === 'shared'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:border-border'
                  )}
                  onClick={() => setLiveCallLanguageMode('shared')}
                >
                  <Trans>Yes</Trans>
                </button>
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-medium transition-all border cursor-pointer',
                    liveCallLanguageMode === 'custom'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:border-border'
                  )}
                  onClick={() => {
                    setLiveCallLanguageMode('custom');
                    setLiveCallCustomPair((prev) => ({
                      youLang: prev.youLang || languages.learningLang || languages.nativeLang || '',
                      partnerLang: prev.partnerLang || languages.nativeLang || languages.learningLang || '',
                    }));
                  }}
                >
                  <Trans>No</Trans>
                </button>
              </div>
            </div>
          </div>

          {liveCallLanguageMode === 'custom' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  <Trans>You</Trans>
                </p>
                <div className="flex flex-wrap gap-1">
                  {LANGUAGES.map((lang) => {
                    const isSelected = liveCallCustomPair.youLang === lang.code;
                    return (
                      <button
                        key={`you-${lang.code}`}
                        type="button"
                        className={cn(
                          'px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1.5 transition-all cursor-pointer',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50 hover:bg-primary/5'
                        )}
                        onClick={() => handleCustomLanguageSelect('you', lang.code)}
                      >
                        <span className="text-sm">{lang.flag}</span>
                        <span>{lang.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  <Trans>Partner</Trans>
                </p>
                <div className="flex flex-wrap gap-1">
                  {LANGUAGES.map((lang) => {
                    const isSelected = liveCallCustomPair.partnerLang === lang.code;
                    return (
                      <button
                        key={`partner-${lang.code}`}
                        type="button"
                        className={cn(
                          'px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1.5 transition-all cursor-pointer',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50 hover:bg-primary/5'
                        )}
                        onClick={() => handleCustomLanguageSelect('partner', lang.code)}
                      >
                        <span className="text-sm">{lang.flag}</span>
                        <span>{lang.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={step3CardClass}>
          <StepHeader step={3} title={<Trans>Share your whole screen with audio</Trans>} />
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
                (isRequestingScreenShare || isLiveCallStarting) && 'cursor-not-allowed opacity-70'
              )}
            >
              {isRequestingScreenShare && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {screenSharePreviewStream ? <Trans>Change screen</Trans> : <Trans>Select screen</Trans>}
            </Button>
            {screenSharePreviewStream && (
              <Button
                size="sm"
                variant="outline"
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
          <StepHeader step={4} title={<Trans>Clear your view</Trans>} />
          <p className={`${getTextClass('body')} leading-relaxed`}>
            <Trans>Use the browser's "Hide" option on the sharing bar so it doesn't cover Glass.</Trans>
          </p>
        </div>

        <div ref={step5CardRef} className={step5CardClass}>
          <StepHeader step={5} title={<Trans>Start the live call</Trans>} />
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
            {step === 'start' && <StartCallEntry onStart={handleInitialStart} />}

            {/* Removed: Language and Level selection moved to onboarding */}

            {/* Partner Selection (Roleplay Mode Only) */}
            {step === 'partner' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5"
              >
                <PartnerSelection
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
                  onSwitchToLiveMode={() => {
                    setSelectedMode('live_call');
                    setLiveCallLanguageMode('shared');
                    setStep('instructions');
                  }}
                  partnerLimitBlocked={partnerLimitBlocked}
                  onPartnerLimitBlocked={() => setPartnerQuotaDialogOpen(true)}
                />
                <div className={'flex justify-between items-center w-full'}>
                  <button
                    onClick={() => setStep('start')}
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
                      <Phone className="size-4 opacity-50 fill-current" strokeWidth={0} />
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
                  selectedMode={selectedMode}
                  selectedRoleplayPartner={selectedRoleplayPartner}
                  getTextClass={getTextClass}
                  getBackButtonClass={getBackButtonClass}
                  canStartCall={canStartCall}
                  isStartingCall={isStartingCall}
                  onBack={() => {
                    if (selectedMode === 'live_call') {
                      setSelectedMode('roleplay');
                      setStep('partner');
                    } else {
                      setSelectedMode('roleplay');
                      setStep('partner');
                    }
                  }}
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
        learningLang={languages.learningLang || undefined}
        nativeLang={languages.nativeLang || null}
        languageLevel={settings.languageLevel || snapshot?.user.languageLevel || null}
        partnerLimitBlocked={partnerLimitBlocked}
        onQuotaBlocked={() => setPartnerQuotaDialogOpen(true)}
        onPartnerCreated={handlePartnerCreated}
      />

      <PartnerDetailModal
        open={isEditPartnerModalOpen}
        onClose={handleCloseEditPartnerModal}
        partner={partnerToEdit}
        onStartChat={(partnerId) => {
          setSelectedPartnerId(partnerId);
          setSelectedMode('roleplay');
          handleCloseEditPartnerModal();
        }}
      />

      <PartnerDeleteDialog
        open={isDeletePartnerDialogOpen}
        partner={partnerPendingDelete}
        token={token ?? null}
        onClose={handleCancelDeletePartner}
        onPartnerDeleted={handlePartnerDeleted}
      />

      <CallLimitDialog
        open={conversationQuotaDialogOpen}
        onOpenChange={setConversationQuotaDialogOpen}
        limitUsageLabel={conversationLimitUsageLabel}
        limitDisplayUsed={conversationLimitDisplayUsed}
        limitMax={conversationLimitMax}
        checkoutLoading={checkoutLoading}
        onManageClick={handleManageHistoryClick}
        onUpgradeClick={handleUpgradeClick}
      />
      <CallLimitDialog
        open={partnerQuotaDialogOpen}
        onOpenChange={setPartnerQuotaDialogOpen}
        limitUsageLabel={partnerLimitUsageLabel}
        limitDisplayUsed={partnerLimitDisplayUsed}
        limitMax={partnerLimitMax}
        checkoutLoading={checkoutLoading}
        onManageClick={handleManagePartnersClick}
        onUpgradeClick={handleUpgradeClick}
        variant="partners"
      />
    </>
  );
}
