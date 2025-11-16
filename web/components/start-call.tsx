import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/glass-context';
import { useAccountSession } from '@/contexts/account-session-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone, UserRound, MoreHorizontal } from 'lucide-react';
import LiquidGlass from './liquid-glass';
import { toast } from 'sonner';
import { useRef, useState, useEffect, useCallback } from 'react';
import type { ComponentType, SVGProps } from 'react';
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
} from '@/lib/account-api';
import DiscordLogo from './logos/discord';
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
type LiveCallPlatform = 'discord' | 'zoom' | 'google_meet' | 'teams' | 'other';
type LiveCallPlatformOption = {
  id: LiveCallPlatform;
  label: string;
  iconSrc?: string;
  iconAlt?: string;
  iconBg?: string;
  fallbackIcon?: string;
  iconComponent?: ComponentType<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
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
    zh: { target: 'Thank you very much', pronunciation: 'sang-kyu bay-ree ma-chee', translation: '非常感谢' },
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
    zh: { target: '정말 감사합니다', pronunciation: 'jung-mal gam-sa-ham-nee-da', translation: '非常感谢' },
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
    zh: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-toh go-zai-ma-su', translation: '非常感谢' },
    es: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-sai-ma-su', translation: 'Muchas gracias' },
    fr: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-zaï-ma-su', translation: 'Merci beaucoup' },
  },
  zh: {
    en: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Thank you very much',
    },
    ko: {
      target: '非常感谢',
      pronunciation: '페이창 간시에',
      translation: '정말 감사합니다',
    },
    ja: {
      target: '非常感谢',
      pronunciation: 'フェイチャン ガンシエ',
      translation: '本当にありがとうございます',
    },
    es: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Muchas gracias',
    },
    fr: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Merci beaucoup',
    },
  },
  es: {
    en: { target: 'Muchas gracias', pronunciation: 'moo-chahs grah-see-ahs', translation: 'Thank you very much' },
    ko: { target: 'Muchas gracias', pronunciation: '무차스 그라시아스', translation: '정말 감사합니다' },
    ja: { target: 'Muchas gracias', pronunciation: 'ムーチャス グラシアス', translation: '本当にありがとうございます' },
    zh: { target: 'Muchas gracias', pronunciation: 'moo-chas gra-see-as', translation: '非常感谢' },
    fr: { target: 'Muchas gracias', pronunciation: 'moo-tchas gra-si-as', translation: 'Merci beaucoup' },
  },
  fr: {
    en: { target: 'Merci beaucoup', pronunciation: 'mehr-see boh-koo', translation: 'Thank you very much' },
    ko: { target: 'Merci beaucoup', pronunciation: '메르시 보쿠', translation: '정말 감사합니다' },
    ja: { target: 'Merci beaucoup', pronunciation: 'メルシー ボクー', translation: '本当にありがとうございます' },
    zh: { target: 'Merci beaucoup', pronunciation: 'mehr-see bo-koo', translation: '非常感谢' },
    es: { target: 'Merci beaucoup', pronunciation: 'mersi boku', translation: 'Muchas gracias' },
  },
};

const DISCORD_CHANNEL_URL = 'https://discord.gg/GxJwcgnchM';

const LIVE_CALL_PLATFORM_OPTIONS: LiveCallPlatformOption[] = [
  {
    id: 'discord',
    label: 'Discord',
    iconComponent: (props) => <DiscordLogo {...props} />,
    iconAlt: 'Discord logo',
    iconBg: 'bg-[#5865F2]/15',
    iconClassName: 'text-[#5865F2]',
  },
  {
    id: 'zoom',
    label: 'Zoom',
    iconSrc: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg',
    iconAlt: 'Zoom logo',
    iconBg: 'bg-[#0B5CFF]/10',
  },
  {
    id: 'google_meet',
    label: 'Google Meet',
    iconSrc: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg',
    iconAlt: 'Google Meet logo',
    iconBg: 'bg-[#0F9D58]/10',
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    iconSrc: 'https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg',
    iconAlt: 'Microsoft Teams logo',
    iconBg: 'bg-[#5946B2]/10',
  },
  {
    id: 'other',
    label: 'Other',
    fallbackIcon: '✨',
    iconBg: 'bg-muted/60',
  },
];

// Get example for language pair, fallback to Japanese->English if not found
const getLanguageExample = (learningLang: string, nativeLang: string): ExamplePhrase | undefined => {
  return LANGUAGE_EXAMPLES[learningLang]?.[nativeLang] || LANGUAGE_EXAMPLES['ja']?.['en'];
};

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const { onboardingStatus, snapshot, token } = useAccountSession();
  const router = useRouter();
  const pathname = usePathname();
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
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customScenario, setCustomScenario] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('glass_custom_scenario') || '';
    }
    return '';
  });
  const [customName, setCustomName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('glass_custom_name') || '';
    }
    return '';
  });
  const [isCreatePartnerModalOpen, setIsCreatePartnerModalOpen] = useState(false);
  const [createPartnerNameDraft, setCreatePartnerNameDraft] = useState<string>('');
  const [createPartnerDescriptionDraft, setCreatePartnerDescriptionDraft] = useState<string>('');
  const [createPartnerAvatarPreview, setCreatePartnerAvatarPreview] = useState<string | null>(null);
  const [createPartnerAvatarFile, setCreatePartnerAvatarFile] = useState<File | null>(null);
  const createPartnerAvatarInputRef = useRef<HTMLInputElement>(null);
  const [isSavingCreatePartner, setIsSavingCreatePartner] = useState(false);
  const [previousScenarioBeforeCreate, setPreviousScenarioBeforeCreate] = useState<string>('');

  const [isEditPartnerModalOpen, setIsEditPartnerModalOpen] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<ConversationPartner | null>(null);
  const [editPartnerNameDraft, setEditPartnerNameDraft] = useState<string>('');
  const [editPartnerDescriptionDraft, setEditPartnerDescriptionDraft] = useState<string>('');
  const [editPartnerAvatarPreview, setEditPartnerAvatarPreview] = useState<string | null>(null);
  const [editPartnerAvatarFile, setEditPartnerAvatarFile] = useState<File | null>(null);
  const editPartnerAvatarInputRef = useRef<HTMLInputElement>(null);
  const [isSavingEditPartner, setIsSavingEditPartner] = useState(false);

  const [isDeletePartnerDialogOpen, setIsDeletePartnerDialogOpen] = useState(false);
  const [partnerPendingDelete, setPartnerPendingDelete] = useState<ConversationPartner | null>(null);
  const [isDeletingPartner, setIsDeletingPartner] = useState(false);
  const persistCustomName = useCallback((value: string) => {
    setCustomName(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('glass_custom_name', value);
    }
  }, []);
  const persistCustomScenario = useCallback((value: string) => {
    setCustomScenario(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('glass_custom_scenario', value);
    }
  }, []);
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
  const [proficiency, setProficiency] = useState<'cant_read' | 'can_read' | undefined>(
    (settings.proficiency as 'cant_read' | 'can_read' | undefined) || undefined
  );
  const [selectedPlatform, setSelectedPlatform] = useState<LiveCallPlatform>('discord');

  const isConnecting = status.value === 'connecting' || step === 'connecting';
  const glassMode = settings.glassMode ?? false;
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
  const roleplayContacts: ConversationPartner[] = (partnersData ?? []).filter((partner) => partner.kind === 'roleplay');
  const selectedRoleplayPartner = roleplayContacts.find((partner) => partner.id === selectedScenario);
  const [hoveredPartner, setHoveredPartner] = useState<ConversationPartner | null>(null);

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

  // Sync proficiency from settings
  useEffect(() => {
    if (settings.proficiency) {
      setProficiency(settings.proficiency as 'cant_read' | 'can_read');
    }
  }, [settings.proficiency]);

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
      selectedScenario &&
      selectedScenario !== 'custom' &&
      roleplayContacts.length > 0 &&
      !roleplayContacts.some((contact) => contact.id === selectedScenario)
    ) {
      setSelectedScenario('');
    }
  }, [roleplayContacts, selectedScenario]);

  useEffect(() => {
    if (!selectedScenario && roleplayContacts.length > 0) {
      setSelectedScenario(roleplayContacts[0].id);
    }
  }, [roleplayContacts, selectedScenario]);

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
      setSelectedScenario('');
      setCustomScenario('');
      // Keep proficiency from settings, don't reset it
    }
  }, [status.value, snapshot]);

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
      setSelectedPlatform('discord');
      setStep('instructions');
    }
  };

  const openCreatePartnerModal = () => {
    if (!token) {
      toast.error(t`Unable to create a partner`, {
        description: t`Authentication token not available. Please refresh the page.`,
      });
      return;
    }
    setPreviousScenarioBeforeCreate(selectedScenario);
    setSelectedScenario('custom');
    setCreatePartnerNameDraft(customName);
    setCreatePartnerDescriptionDraft(customScenario);
    clearCreatePartnerAvatarPreview();
    setCreatePartnerAvatarPreview(null);
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
    setIsEditPartnerModalOpen(true);
  };

  const handleCloseCreatePartnerModal = () => {
    setIsCreatePartnerModalOpen(false);
    setIsSavingCreatePartner(false);
    setSelectedScenario((prev) => (prev === 'custom' ? previousScenarioBeforeCreate : prev));
    clearCreatePartnerAvatarPreview();
    setCreatePartnerAvatarFile(null);
  };

  const handleCloseEditPartnerModal = () => {
    setIsEditPartnerModalOpen(false);
    setPartnerToEdit(null);
    setIsSavingEditPartner(false);
    clearEditPartnerAvatarPreview();
    setEditPartnerAvatarFile(null);
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
      let partner = await createPartner(token, {
        name: trimmedName,
        description: createPartnerDescriptionDraft.trim() || undefined,
        learningLang: currentLearningLang,
        nativeLang: languages.nativeLang || undefined,
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
      setSelectedScenario(partner.id);
      persistCustomName(partner.name || '');
      persistCustomScenario(partner.description || '');
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
      });
      if (editPartnerAvatarFile) {
        partner = await uploadPartnerAvatar(token, partner.id, editPartnerAvatarFile);
      }
      queryClient.setQueryData<ConversationPartner[] | undefined>(
        ['partners', token, currentLearningLang],
        (previous) => (previous || []).map((item) => (item.id === partner.id ? partner : item))
      );
      if (selectedScenario === partner.id) {
        setSelectedScenario(partner.id);
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
      if (selectedScenario === partnerPendingDelete.id) {
        setSelectedScenario('');
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

  const handleScenarioSelect = (scenario: string) => {
    if (scenario === 'custom') {
      openCreatePartnerModal();
      return;
    }
    setSelectedScenario((prev) => (prev === scenario ? '' : scenario));
  };

  const handleStartCall = async () => {
    if (!selectedMode) {
      toast.error(t`Select a mode to continue`);
      return;
    }

    let selectedPartnerId: string | null =
      selectedMode === 'roleplay' && selectedScenario && selectedScenario !== 'custom'
        ? selectedScenario
        : selectedMode === 'roleplay'
        ? null
        : null;
    let partnerForSession: ConversationPartner | null = null;

    if (selectedMode === 'roleplay') {
      if (!selectedPartnerId) {
        toast.error(t`Select a conversation partner`);
        return;
      }
      partnerForSession = roleplayContacts.find((contact) => contact.id === selectedPartnerId) || null;
      if (!partnerForSession) {
        toast.error(t`Select a conversation partner`);
        return;
      }
    }

    const config: SessionConfig = {
      languages,
      mode: selectedMode,
      partnerId: partnerForSession?.id || selectedPartnerId || null,
      partner: partnerForSession,
    };

    // Proceed with connection (onboarding should already be completed at this point)
    setStep('connecting');
    try {
      await connect(config);
    } catch {
      toast.error(t`Unable to start call`);
      setStep('instructions');
    }
  };

  const renderPlatformInstructions = () => {
    const stepsClass = cn('list-decimal list-inside space-y-1.5 text-sm leading-relaxed', getTextClass('subtitle'));

    switch (selectedPlatform) {
      case 'discord':
        return (
          <div className="space-y-3">
            <ol className={stepsClass}>
              <li>
                <Trans>
                  Join our{' '}
                  <a
                    href={DISCORD_CHANNEL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 font-medium"
                  >
                    Discord voice channel
                  </a>{' '}
                  (or your own server).
                </Trans>
              </li>
              <li>
                <Trans>Back in Glass, press Start Call.</Trans>
              </li>
              <li>
                <Trans>Choose the Discord window (or desktop) and enable system audio.</Trans>
              </li>
              <li>
                <Trans>Keep Glass open to get live help during your call.</Trans>
              </li>
            </ol>
          </div>
        );
      case 'zoom':
        return (
          <div className="space-y-3">
            <ol className={stepsClass}>
              <li>
                <Trans>Join or start your Zoom meeting.</Trans>
              </li>
              <li>
                <Trans>Back in Glass, press Start Call.</Trans>
              </li>
              <li>
                <Trans>Choose the Zoom window (or desktop) and enable system audio.</Trans>
              </li>
              <li>
                <Trans>Keep Glass open to get live help during your call.</Trans>
              </li>
            </ol>
          </div>
        );
      case 'google_meet':
        return (
          <div className="space-y-3">
            <ol className={stepsClass}>
              <li>
                <Trans>Join the Google Meet room.</Trans>
              </li>
              <li>
                <Trans>Back in Glass, press Start Call.</Trans>
              </li>
              <li>
                <Trans>Select the Chrome tab with Meet, toggle Share tab audio, and confirm.</Trans>
              </li>
              <li>
                <Trans>Keep Glass open to get live help during your call.</Trans>
              </li>
            </ol>
          </div>
        );
      case 'teams':
        return (
          <div className="space-y-3">
            <ol className={stepsClass}>
              <li>
                <Trans>Join your Microsoft Teams meeting.</Trans>
              </li>
              <li>
                <Trans>Back in Glass, press Start Call.</Trans>
              </li>
              <li>
                <Trans>Choose the Teams window (or desktop) and enable system audio.</Trans>
              </li>
              <li>
                <Trans>Keep Glass open to get live help during your call.</Trans>
              </li>
            </ol>
          </div>
        );
      case 'other':
      default:
        return (
          <div className="space-y-3">
            <ol className={stepsClass}>
              <li>
                <Trans>Join the call in your preferred platform.</Trans>
              </li>
              <li>
                <Trans>Back in Glass, press Start Call.</Trans>
              </li>
              <li>
                <Trans>Pick the window/tab for that platform and turn on system or tab audio.</Trans>
              </li>
              <li>
                <Trans>Keep Glass open to get live help during your call.</Trans>
              </li>
            </ol>
          </div>
        );
    }
  };

  // Redirect to onboarding if not completed
  if (onboardingStatus !== null && !onboardingStatus.completed) {
    const lang = pathname.split('/')[1] || 'en';
    router.push(`/${lang}/onboarding`);
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
                      onClick={() => setStep('mode')}
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
                      <Button className={'z-50 flex items-center gap-1.5 rounded-full'} onClick={() => setStep('mode')}>
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

            {/* Scenario Selection (Roleplay Mode Only) */}
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

                <div className={'flex flex-col gap-2 w-full max-w-md mx-auto'}>
                  {partnersLoading ? (
                    <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
                      <Trans>Loading partners...</Trans>
                    </div>
                  ) : roleplayContacts.length === 0 ? (
                    <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
                      <Trans>No partners available</Trans>
                    </div>
                  ) : (
                    roleplayContacts.map((contact) => (
                      <div
                        key={contact.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleScenarioSelect(contact.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleScenarioSelect(contact.id);
                          }
                        }}
                        onMouseEnter={() => setHoveredPartner(contact)}
                        onMouseLeave={() => setHoveredPartner(null)}
                        className={cn(
                          'group px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                          getCardClass(),
                          'hover:scale-[1.01]',
                          selectedScenario === contact.id &&
                            (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent/50 border-foreground/30')
                        )}
                      >
                        <div className="relative flex items-center gap-3">
                          {contact.avatarUrl && (
                            <div
                              className={cn(
                                'hidden sm:block absolute -left-48 top-1/2 -translate-y-1/2 w-40 h-40 rounded-[36px] overflow-hidden shadow-2xl border pointer-events-none transition-all duration-200',
                                hoveredPartner?.id === contact.id
                                  ? 'opacity-100 translate-x-0'
                                  : 'opacity-0 -translate-x-3'
                              )}
                            >
                              <img src={contact.avatarUrl} alt={contact.name} className="w-full h-full object-cover" />
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
                            name={contact.name}
                            src={contact.avatarUrl || undefined}
                            alt={contact.name}
                          />
                          <div className={'flex-1 min-w-0 flex items-start gap-2'}>
                            <div className="flex-1 min-w-0">
                              <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>
                                {contact.name}
                              </div>
                              <div className={`${getTextClass('muted')} text-xs truncate`}>{contact.description}</div>
                            </div>
                          {contact.isSystem === false && (
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
                                      openEditPartnerModal(contact);
                                    }}
                                  >
                                    <Trans>Edit</Trans>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openDeletePartnerDialog(contact);
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

                  {/* Custom Contact */}
                  <div className={'w-full'}>
                    <button
                      onClick={() => handleScenarioSelect('custom')}
                      className={cn(
                        'w-full px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                        getCardClass(),
                        'hover:scale-[1.01]',
                        selectedScenario === 'custom' &&
                          (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent/50 border-foreground/30')
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

                <div className={'flex justify-between items-center w-full'}>
                  <button onClick={() => setStep('mode')} className={cn(getBackButtonClass(), 'cursor-pointer')}>
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    onClick={handleStartCall}
                    disabled={!selectedScenario || selectedScenario === 'custom'}
                    variant="default"
                    className={cn(
                      'cursor-pointer rounded-full px-6 py-2 sm:px-7 sm:py-2.5 inline-flex items-center gap-1.5 font-semibold tracking-tight text-white bg-emerald-500 hover:bg-emerald-600',
                      (!selectedScenario || selectedScenario === 'custom') && 'opacity-50 cursor-not-allowed'
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
                      ) : selectedScenario === 'custom' && customScenario ? (
                        <div>
                          <p className={`text-xs ${getTextClass('muted')} mb-1.5 sm:mb-2`}>
                            <Trans>Scenario:</Trans>
                          </p>
                          <p className={'text-sm'}>{customScenario}</p>
                        </div>
                      ) : (
                        <p className={`${getTextClass('muted')} text-sm`}>
                          <Trans>Select a partner to see details.</Trans>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className={cn('text-[11px] font-semibold', getTextClass('muted'))}>
                          <Trans>Choose your platform</Trans>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {LIVE_CALL_PLATFORM_OPTIONS.map((option) => {
                            const isActive = option.id === selectedPlatform;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setSelectedPlatform(option.id)}
                                aria-pressed={isActive}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] sm:text-xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-1 outline-none',
                                  glassMode
                                    ? 'border-white/25 text-white/70 hover:text-white hover:border-white/60 focus-visible:ring-white/40'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/60 focus-visible:ring-foreground/30',
                                  isActive &&
                                    (glassMode
                                      ? 'bg-white text-foreground border-white shadow-sm'
                                      : 'bg-primary/10 text-primary border-primary/70 shadow-sm')
                                )}
                              >
                                <span
                                  className={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full border text-[10px]',
                                    glassMode
                                      ? 'border-white/20 bg-white/10 text-white'
                                      : 'border-border bg-background text-foreground/70',
                                    option.iconBg
                                  )}
                                >
                                  {option.iconComponent ? (
                                    <option.iconComponent className={cn('h-3.5 w-3.5', option.iconClassName)} />
                                  ) : option.iconSrc ? (
                                    <img
                                      src={option.iconSrc}
                                      alt={option.iconAlt || option.label}
                                      className="h-3.5 w-3.5 object-contain"
                                    />
                                  ) : (
                                    <span>{option.fallbackIcon}</span>
                                  )}
                                </span>
                                <span>{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {renderPlatformInstructions()}
                    </div>
                  )}
                </div>

                <div className={'flex justify-between items-center w-full'}>
                  <button onClick={() => setStep('mode')} className={cn(getBackButtonClass(), 'cursor-pointer')}>
                    <Trans>← Back</Trans>
                  </button>
                  <Button
                    variant="default"
                    onClick={handleStartCall}
                    disabled={!selectedScenario || selectedScenario === 'custom'}
                    className={cn(
                      'cursor-pointer rounded-full px-6 py-2 sm:px-7 sm:py-2.5 inline-flex items-center gap-1.5 font-semibold tracking-tight text-white bg-emerald-500 hover:bg-emerald-600',
                      (!selectedScenario || selectedScenario === 'custom') && 'opacity-50 cursor-not-allowed'
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
                    persistCustomName(event.target.value);
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
                    persistCustomScenario(event.target.value);
                  }}
                  placeholder={t`Add a short description`}
                  disabled={isSavingCreatePartner}
                  rows={3}
                />
              </div>
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
    </>
  );
}
