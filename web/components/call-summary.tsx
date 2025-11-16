'use client';
import { cn } from '@/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Save, ChevronDown, ChevronUp, MessageSquare, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PartnerAvatar } from '@/components/partner-avatar';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useAccountSession } from '@/contexts/account-session-context';
import {
  fetchConversationZepContext,
  fetchPartners,
  reassignConversationPartner,
  updatePartner,
  uploadPartnerAvatar,
  createPartner,
  deletePartner,
  type ConversationMessage,
  type ConversationPartner,
  type ZepContextItem,
} from '@/lib/account-api';
import { useLocale } from '@/hooks/use-locale';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
}

interface ExtractedInfo {
  label: string;
  value: string;
  editable: boolean;
}

interface FeedbackItem {
  utterance_id: string;
  text: string;
}

interface ParticipantSnapshot {
  partner?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    avatar_url?: string | null;
  };
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
  session?: {
    mode?: string | null;
    learning_lang?: string | null;
    native_lang?: string | null;
  };
}

type ThreadContextItem = ZepContextItem;

const LANGUAGE_NAMES_BY_LOCALE: Record<string, Record<string, string>> = {
  en: { en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', es: 'Spanish', fr: 'French' },
  ko: { en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', es: '스페인어', fr: '프랑스어' },
  ja: { en: '英語', ko: '韓国語', ja: '日本語', zh: '中国語', es: 'スペイン語', fr: 'フランス語' },
  zh: { en: '英语', ko: '韩语', ja: '日语', zh: '中文', es: '西班牙语', fr: '法语' },
  es: { en: 'Inglés', ko: 'Coreano', ja: 'Japonés', zh: 'Chino', es: 'Español', fr: 'Francés' },
  fr: { en: 'Anglais', ko: 'Coréen', ja: 'Japonais', zh: 'Chinois', es: 'Espagnol', fr: 'Français' },
};

function getLanguageName(code: string | null | undefined, locale: string): string {
  if (!code) return '—';
  const normal = code.toLowerCase();
  const localeNames = LANGUAGE_NAMES_BY_LOCALE[locale] || LANGUAGE_NAMES_BY_LOCALE.en;
  return localeNames[normal] || code;
}

function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

const getMessageRole = (message: ConversationMessage): string =>
  (message.role || message.speaker_role || '').toLowerCase();

const getMessageParticipantId = (message: ConversationMessage): string => {
  if (typeof message.partner_id === 'string' && message.partner_id) {
    return message.partner_id.toLowerCase();
  }
  if (typeof message.speaker_id === 'string' && message.speaker_id) {
    return message.speaker_id.toLowerCase();
  }
  return '';
};

interface CallSummaryProps {
  conversationId?: string; // DB conversation ID for fetching Zep memories
  scores: ConversationScores;
  extractedInfo?: ExtractedInfo[];
  feedback?: string;
  messages?: ConversationMessage[];
  feedbackItems?: FeedbackItem[];
  onClose: () => void;
  onStartNewCall: (contextInfo: ExtractedInfo[]) => void;
  memoryCountOverride?: number;
  conversationCountOverride?: number;
  initialShowMemory?: boolean; // For onboarding: pre-open Memory section
  participantSnapshot?: ParticipantSnapshot | null;
  durationSeconds?: number | null;
  learningLang?: string | null;
  nativeLang?: string | null;
}

const CallSummary = ({
  conversationId,
  scores,
  extractedInfo: initialInfo = [],
  feedback = '',
  messages = [],
  feedbackItems = [],
  onClose,
  onStartNewCall,
  memoryCountOverride,
  conversationCountOverride,
  initialShowMemory = false,
  participantSnapshot = null,
  durationSeconds = null,
  learningLang = null,
  nativeLang = null,
}: CallSummaryProps) => {
  const { token } = useAccountSession();
  const locale = useLocale();
  const [currentSnapshot, setCurrentSnapshot] = useState<ParticipantSnapshot | null>(participantSnapshot ?? null);
  useEffect(() => {
    setCurrentSnapshot(participantSnapshot ?? null);
  }, [participantSnapshot]);
  const partnerProfile = currentSnapshot?.partner;
  const userProfile = currentSnapshot?.user;
  const currentPartnerId = partnerProfile?.id ?? null;
  const [threadContextItems, setThreadContextItems] = useState<ThreadContextItem[]>([]);
  const [rawThreadContext, setRawThreadContext] = useState('');
  const [isLoadingThreadContext, setIsLoadingThreadContext] = useState(false);
  const [threadContextError, setThreadContextError] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [showMemory, setShowMemory] = useState(initialShowMemory);
  const [isPartnerManagerOpen, setIsPartnerManagerOpen] = useState(false);
  const [partnerNameDraft, setPartnerNameDraft] = useState(partnerProfile?.name || '');
  const [partnerDescriptionDraft, setPartnerDescriptionDraft] = useState(partnerProfile?.description || '');
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(partnerProfile?.id ?? null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [editingPartnerAvatarUrl, setEditingPartnerAvatarUrl] = useState<string | null>(
    partnerProfile?.avatar_url || null
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const {
    data: partnerOptions = [],
    isLoading: isPartnerListLoading,
    refetch: refetchPartners,
  } = useQuery({
    queryKey: ['call-summary-partners', learningLang, isPartnerManagerOpen],
    queryFn: () => fetchPartners(token!, learningLang || undefined),
    enabled: Boolean(token && isPartnerManagerOpen),
    staleTime: 5 * 60 * 1000,
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (isPartnerManagerOpen) {
      setEditingPartnerId(partnerProfile?.id ?? null);
      setPartnerNameDraft(partnerProfile?.name || '');
      setPartnerDescriptionDraft(partnerProfile?.description || '');
      setEditingPartnerAvatarUrl(partnerProfile?.avatar_url || null);
      setPartnerSearch('');
    }
  }, [
    isPartnerManagerOpen,
    partnerProfile?.avatar_url,
    partnerProfile?.description,
    partnerProfile?.id,
    partnerProfile?.name,
  ]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!token || !editingPartnerId) {
      toast.error(t`Missing partner information`);
      return;
    }
    if (!canManagePartner) {
      toast.error(t`Roleplay conversations cannot change partner images`);
      return;
    }
    setIsUploadingAvatar(true);
    try {
      const updated = await uploadPartnerAvatar(token, editingPartnerId, file);
      setEditingPartnerAvatarUrl(updated.avatarUrl || null);
      if (updated.id === currentPartnerId) {
        setCurrentSnapshot((prev) => {
          const next: ParticipantSnapshot = {
            ...(prev || {}),
            partner: {
              ...(prev?.partner || {}),
              id: updated.id,
              name: updated.name,
              description: updated.description,
              avatar_url: updated.avatarUrl || null,
            },
          };
          if (prev?.user) {
            next.user = prev.user;
          }
          if (prev?.session) {
            next.session = prev.session;
          }
          return next;
        });
      }
      refetchPartners();
      toast.success(t`Photo updated`);
    } catch (error) {
      console.error('[CallSummary] Failed to upload avatar', error);
      toast.error(t`Failed to upload image`);
    } finally {
      setIsUploadingAvatar(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const renamePartnerMutation = useMutation({
    mutationFn: async () => {
      if (!token || !editingPartnerId) {
        throw new Error(t`Missing partner information`);
      }
      const trimmedName = partnerNameDraft.trim();
      if (!trimmedName) {
        throw new Error(t`Partner name is required`);
      }
      return updatePartner(token, editingPartnerId, {
        name: trimmedName,
        description: partnerDescriptionDraft?.trim() || null,
      });
    },
    onSuccess: (updated) => {
      setEditingPartnerAvatarUrl(updated.avatarUrl || null);
      if (updated.id === currentPartnerId) {
        setCurrentSnapshot((prev) => {
          const next: ParticipantSnapshot = {
            ...(prev || {}),
            partner: {
              ...(prev?.partner || {}),
              id: updated.id,
              name: updated.name,
              description: updated.description,
              avatar_url: updated.avatarUrl || null,
            },
          };
          if (prev?.user) {
            next.user = prev.user;
          }
          if (prev?.session) {
            next.session = prev.session;
          }
          return next;
        });
      }
      refetchPartners();
      toast.success(t`Partner updated`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to update partner`;
      toast.error(message);
    },
  });
  const createPartnerMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!token) {
        throw new Error(t`Missing authentication`);
      }
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error(t`Enter a name first`);
      }
      return createPartner(token, {
        name: trimmed,
        learningLang: learningLang || currentSnapshot?.session?.learning_lang || undefined,
        nativeLang: nativeLang || currentSnapshot?.session?.native_lang || undefined,
      });
    },
    onSuccess: (partner) => {
      preparePartnerEdit({
        id: partner.id,
        name: partner.name,
        description: partner.description || null,
        avatarUrl: partner.avatarUrl || null,
      });
      setPartnerSearch('');
      refetchPartners();
      reassignPartnerMutation.mutate(partner.id);
      toast.success(t`Partner created`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to create partner`;
      toast.error(message);
    },
  });

  const deletePartnerMutation = useMutation({
    mutationFn: async () => {
      if (!token || !editingPartnerId) {
        throw new Error(t`Missing partner information`);
      }
      await deletePartner(token, editingPartnerId);
      return editingPartnerId;
    },
    onSuccess: (deletedId) => {
      if (deletedId === currentPartnerId) {
        setCurrentSnapshot((prev) => {
          if (!prev?.partner || prev.partner.id !== deletedId) {
            return prev;
          }
          const next: ParticipantSnapshot = { ...prev };
          delete next.partner;
          return next;
        });
      }
      refetchPartners();
      setIsEditModalOpen(false);
      setEditingPartnerId(null);
      setPartnerNameDraft('');
      setPartnerDescriptionDraft('');
      setEditingPartnerAvatarUrl(null);
      toast.success(t`Partner deleted`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to delete partner`;
      toast.error(message);
    },
  });

  const handleDeletePartner = () => {
    if (!editingPartnerId || !canManagePartner || deletePartnerMutation.isPending) {
      return;
    }
    if (!token) {
      toast.error(t`Missing authentication`);
      return;
    }
    const confirmed = window.confirm(t`Delete this partner? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    deletePartnerMutation.mutate();
  };

  const isPartnerActionPending = renamePartnerMutation.isPending || deletePartnerMutation.isPending;

  const reassignPartnerMutation = useMutation({
    mutationFn: async (targetPartnerId: string) => {
      if (!token || !conversationId) {
        throw new Error(t`Missing conversation`);
      }
      return reassignConversationPartner(token, conversationId, targetPartnerId);
    },
    onSuccess: (updated) => {
      setCurrentSnapshot((updated.participantSnapshot as ParticipantSnapshot | null) ?? null);
      setIsPartnerManagerOpen(false);
      toast.success(t`Conversation partner assigned`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to assign partner`;
      toast.error(message);
    },
  });

  const participantDirectory = useMemo(() => {
    const directory = new Map<
      string,
      {
        name: string;
        avatarUrl?: string;
      }
    >();
    directory.set('glass', { name: t`Glass`, avatarUrl: '/glass-ai.png' });
    directory.set('user', { name: userProfile?.name || t`You`, avatarUrl: undefined });
    const partnerEntry = {
      name: partnerProfile?.name || t`Partner`,
      avatarUrl: partnerProfile?.avatar_url || undefined,
    };
    directory.set('partner', partnerEntry);
    if (partnerProfile?.id && typeof partnerProfile.id === 'string') {
      directory.set(partnerProfile.id.toLowerCase(), partnerEntry);
    }
    return directory;
  }, [partnerProfile, userProfile]);

  const sessionMode = (currentSnapshot?.session as { mode?: string } | undefined)?.mode?.toLowerCase();
  const canManagePartner = sessionMode !== 'roleplay';
  const preparePartnerEdit = (partner?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
    avatar_url?: string | null;
  }) => {
    setEditingPartnerId(partner?.id ?? null);
    setPartnerNameDraft(partner?.name || '');
    setPartnerDescriptionDraft(partner?.description || '');
    setEditingPartnerAvatarUrl(partner?.avatarUrl ?? partner?.avatar_url ?? null);
  };
  useEffect(() => {
    if (!canManagePartner && isPartnerManagerOpen) {
      setIsPartnerManagerOpen(false);
    }
  }, [canManagePartner, isPartnerManagerOpen]);

  const availablePartners: ConversationPartner[] = useMemo(() => {
    if (!partnerOptions?.length) return [];
    return partnerOptions.filter(
      (partner) => partner.id !== currentPartnerId && partner.kind === 'live_call'
    );
  }, [partnerOptions, currentPartnerId]);
  const trimmedPartnerSearch = partnerSearch.trim();
  const filteredPartners = useMemo(() => {
    const query = trimmedPartnerSearch.toLowerCase();
    if (!query) {
      return availablePartners;
    }
    return availablePartners.filter((partner) => partner.name.toLowerCase().includes(query));
  }, [availablePartners, trimmedPartnerSearch]);

  const resolveParticipantInfo = (message: ConversationMessage) => {
    const role = getMessageRole(message);
    const participantId = getMessageParticipantId(message);
    if (role === 'user') {
      return participantDirectory.get('user')!;
    }
    if (role === 'assistant') {
      return participantDirectory.get('glass')!;
    }
    if (participantId && participantDirectory.has(participantId)) {
      return participantDirectory.get(participantId)!;
    }
    return participantDirectory.get('partner') || { name: t`Partner` };
  };
  const durationLabel =
    typeof durationSeconds === 'number' && durationSeconds >= 0 ? formatDuration(durationSeconds) : null;
  const languageLabel =
    learningLang || nativeLang
      ? `${getLanguageName(learningLang, locale)} ↔ ${getLanguageName(nativeLang, locale)}`
      : null;

  // Create a map of utterance_id to feedback
  const feedbackMap = useMemo(() => {
    const map = new Map<string, string[]>();
    feedbackItems.forEach((fb) => {
      if (fb.utterance_id) {
        if (!map.has(fb.utterance_id)) {
          map.set(fb.utterance_id, []);
        }
        map.get(fb.utterance_id)!.push(fb.text);
      }
    });
    return map;
  }, [feedbackItems]);

  // Fetch Zep thread context when conversationId is available
  useEffect(() => {
    if (!conversationId || !token) {
      setThreadContextItems([]);
      setRawThreadContext('');
      return;
    }

    let canceled = false;
    setIsLoadingThreadContext(true);
    setThreadContextError(null);

    const fetchContext = async () => {
      try {
        const response = await fetchConversationZepContext(token, conversationId);
        if (canceled) return;
        setThreadContextItems(response.items || []);
        setRawThreadContext(response.rawContext || '');
      } catch (error) {
        console.error('[CallSummary] Failed to fetch Zep thread context:', error);
        if (!canceled) {
          setThreadContextItems([]);
          setRawThreadContext('');
          setThreadContextError(t`Unable to load context from Zep.`);
        }
      } finally {
        if (!canceled) {
          setIsLoadingThreadContext(false);
        }
      }
    };

    fetchContext();

    return () => {
      canceled = true;
    };
  }, [conversationId, token]);

  const handleSaveCall = () => {
    onStartNewCall(initialInfo);
  };

  const contextBadgeClass = (type: ThreadContextItem['type']) => {
    switch (type) {
      case 'fact':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'entity':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      case 'episode':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      default:
        return 'bg-slate-500/10 text-slate-500 border-slate-500/30';
    }
  };

  const averageScore = Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3);

  const getScoreLabel = (score: number): { text: string; color: string } => {
    if (score >= 80) return { text: t`Excellent`, color: 'text-emerald-500' };
    if (score >= 60) return { text: t`Good`, color: 'text-teal-500' };
    if (score >= 40) return { text: t`Average`, color: 'text-amber-500' };
    if (score >= 20) return { text: t`Below Average`, color: 'text-orange-500' };
    return { text: t`Low`, color: 'text-red-500' };
  };

  // Calculate indicator position based on flex ratios
  const getIndicatorPosition = (score: number): number => {
    const flexRatios = [0.5, 1, 2, 1, 0.5]; // flex values for each segment
    const totalFlex = flexRatios.reduce((sum, flex) => sum + flex, 0); // 5

    // Determine which segment the score falls into
    let segmentIndex = 0;
    let segmentStart = 0;

    if (score <= 20) {
      segmentIndex = 0;
      segmentStart = 0;
    } else if (score <= 40) {
      segmentIndex = 1;
      segmentStart = 20;
    } else if (score <= 60) {
      segmentIndex = 2;
      segmentStart = 40;
    } else if (score <= 80) {
      segmentIndex = 3;
      segmentStart = 60;
    } else {
      segmentIndex = 4;
      segmentStart = 80;
    }

    // Calculate the start position of this segment
    const flexBeforeSegment = flexRatios.slice(0, segmentIndex).reduce((sum, flex) => sum + flex, 0);
    const segmentStartPercent = (flexBeforeSegment / totalFlex) * 100;

    // Calculate position within the segment
    const segmentSize = 20; // each segment represents 20 points
    const positionInSegment = (score - segmentStart) / segmentSize;
    const segmentWidthPercent = (flexRatios[segmentIndex] / totalFlex) * 100;

    return segmentStartPercent + segmentWidthPercent * positionInSegment;
  };

  const partnerChip = partnerProfile
    ? canManagePartner && token ? (
        <Popover open={isPartnerManagerOpen} onOpenChange={setIsPartnerManagerOpen} key="partner-chip">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm transition',
                'bg-transparent hover:bg-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
              )}
            >
              <PartnerAvatar
                className="h-7 w-7"
                fallbackSize="md"
                name={partnerProfile?.name}
                src={partnerProfile?.avatar_url || undefined}
              />
              <span className="font-medium text-foreground">{partnerProfile?.name || t`Partner`}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isPartnerManagerOpen && 'rotate-180'
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-w-[90vw] p-0" align="center" side="bottom" sideOffset={6}>
            <div className="border-b border-border/30 px-3 py-2">
              <Input
                value={partnerSearch}
                onChange={(event) => setPartnerSearch(event.target.value)}
                placeholder={t`Search partners`}
                className="h-8 text-xs"
                disabled={!canManagePartner}
              />
            </div>
            <div className="py-2">
              <div className="px-3">
                <div className="group relative flex items-center gap-2 rounded-md bg-accent/70 px-3 py-2 pr-16 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <PartnerAvatar
                      className="h-6 w-6"
                      fallbackSize="sm"
                      name={partnerProfile?.name}
                      src={partnerProfile?.avatar_url || undefined}
                    />
                    <span className="font-medium text-foreground truncate">
                      {partnerProfile?.name || t`Partner`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      preparePartnerEdit(partnerProfile);
                      setIsPartnerManagerOpen(false);
                      setIsEditModalOpen(true);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-xs font-medium text-foreground opacity-0 transition hover:bg-accent group-hover:opacity-100 cursor-pointer"
                  >
                    <Trans>Edit</Trans>
                  </button>
                </div>
              </div>
              <div className="px-3 pt-3 text-xs text-muted-foreground">
                <Trans>Select a partner</Trans>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {isPartnerListLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <Trans>Loading partners…</Trans>
                  </div>
                ) : filteredPartners.length ? (
                  <div className="px-2 pb-2 pt-1">
                    {filteredPartners.map((partner) => (
                      <div
                        key={partner.id}
                        role="button"
                        tabIndex={0}
                        aria-disabled={reassignPartnerMutation.isPending}
                        className="group relative flex w-full items-center gap-2 rounded-md px-3 py-1.5 pr-16 text-left text-sm transition hover:bg-accent/40 cursor-pointer"
                        onClick={() => {
                          if (!reassignPartnerMutation.isPending) {
                            reassignPartnerMutation.mutate(partner.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (!reassignPartnerMutation.isPending) {
                              reassignPartnerMutation.mutate(partner.id);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PartnerAvatar
                            className="h-6 w-6"
                            fallbackSize="sm"
                            name={partner.name}
                            src={partner.avatarUrl || undefined}
                          />
                          <span className="truncate">{partner.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            preparePartnerEdit({
                              id: partner.id,
                              name: partner.name,
                              description: partner.description || null,
                              avatarUrl: partner.avatarUrl || null,
                            });
                            setIsPartnerManagerOpen(false);
                            setIsEditModalOpen(true);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-xs font-medium text-foreground opacity-0 transition hover:bg-accent group-hover:opacity-100 cursor-pointer"
                        >
                          <Trans>Edit</Trans>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 pb-2 text-xs text-muted-foreground space-y-2">
                    <p>
                      <Trans>No matching partners.</Trans>
                    </p>
                    {trimmedPartnerSearch && (
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => createPartnerMutation.mutate(trimmedPartnerSearch)}
                        disabled={createPartnerMutation.isPending}
                      >
                        {createPartnerMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="truncate font-medium">{t`New ${trimmedPartnerSearch}`}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="inline-flex items-center gap-2 text-foreground">
          <PartnerAvatar
            className="h-7 w-7"
            fallbackSize="md"
            name={partnerProfile?.name}
            src={partnerProfile?.avatar_url || undefined}
          />
          <span className="font-medium text-foreground">{partnerProfile?.name || t`Partner`}</span>
        </span>
      )
    : null;

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={'fixed inset-0 z-50 flex items-center justify-center p-4'}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <motion.div
        id="glass-call-summary"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={
          'relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-card border border-border/50 rounded-2xl shadow-2xl'
        }
      >
        {/* Header */}
        <div className={'sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border/30 px-6 py-4'}>
          <div className="space-y-3">
            <div id="glass-call-summary-header" className={'flex items-center justify-between'}>
              <h2 className={'text-xl font-bold'}>
                <Trans>Call Summary</Trans>
              </h2>
              <button
                onClick={onClose}
                className={
                  'text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent/50'
                }
                aria-label="Close"
              >
                <X className={'size-5'} />
              </button>
            </div>
            {(durationLabel || languageLabel || partnerChip) && (
              <div className="space-y-2 relative">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {durationLabel && <span>{durationLabel}</span>}
                  {languageLabel && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <span>{languageLabel}</span>
                    </>
                  )}
                  {partnerChip && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      {partnerChip}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className={'p-6 space-y-6'}>
          {/* Scores and Feedback Container */}
          <div id="glass-scores-feedback" className="space-y-6">
            {/* Score Overview */}
            <section>
              <div className={'flex items-center justify-between mb-6'}>
                <div>
                  <span className={'text-sm font-medium text-muted-foreground block mb-1'}>
                    <Trans>Overall Score</Trans>
                  </span>
                  <span className={'text-4xl font-bold'}>{averageScore}</span>
                </div>

                {/* Bar Graph Gauge */}
                <div className={'flex items-end gap-1 h-12'}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const scorePercent = averageScore / 100;
                    const segmentThreshold = i / 8;
                    const isActive = scorePercent > segmentThreshold;

                    // Height increases to the right
                    const heights = [25, 35, 45, 55, 65, 75, 85, 95];
                    const height = heights[i];

                    // Color based on position
                    let color = 'rgb(239, 68, 68)'; // red
                    if (i >= 6) color = 'rgb(16, 185, 129)'; // emerald
                    else if (i >= 5) color = 'rgb(20, 184, 166)'; // teal
                    else if (i >= 3) color = 'rgb(245, 158, 11)'; // amber
                    else if (i >= 2) color = 'rgb(251, 146, 60)'; // orange

                    return (
                      <motion.div
                        key={i}
                        className={'w-2 rounded-full'}
                        style={{
                          height: `${height}%`,
                          backgroundColor: isActive ? color : 'rgba(100, 116, 139, 0.2)',
                        }}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: `${height}%`, opacity: 1 }}
                        transition={{
                          duration: 0.4,
                          delay: i * 0.04,
                          ease: 'easeOut',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Segmented gauges */}
              <div className={'space-y-2'}>
                {/* Fluency */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Fluency</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.fluency).color)}>
                      {getScoreLabel(scores.fluency).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      {/* 0-20: Low (red) - narrowest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 0 && scores.fluency <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                      />
                      {/* 20-40: Below Average (orange) */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 20 && scores.fluency <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.15 }}
                      />
                      {/* 40-60: Average (amber) - widest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 40 && scores.fluency <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                      />
                      {/* 60-80: Good (teal) */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 60 && scores.fluency <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.25 }}
                      />
                      {/* 80-100: Excellent (emerald) - narrowest */}
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.fluency > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.fluency)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.5 }}
                    />
                  </div>
                </div>

                {/* Accuracy */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Accuracy</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.accuracy).color)}>
                      {getScoreLabel(scores.accuracy).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 0 && scores.accuracy <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.35 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 20 && scores.accuracy <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 40 && scores.accuracy <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.45 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 60 && scores.accuracy <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.accuracy > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.55 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.accuracy)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    />
                  </div>
                </div>

                {/* Comprehensibility */}
                <div>
                  <div className={'flex items-center justify-between mb-1.5'}>
                    <span className={'text-xs text-muted-foreground'}>
                      <Trans>Comprehensibility</Trans>
                    </span>
                    <span className={cn('text-sm font-medium', getScoreLabel(scores.comprehensibility).color)}>
                      {getScoreLabel(scores.comprehensibility).text}
                    </span>
                  </div>
                  <div className={'relative'}>
                    <div className={'flex gap-1 h-2'}>
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 0 && scores.comprehensibility <= 20
                            ? 'bg-red-500'
                            : 'bg-red-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.6 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 20 && scores.comprehensibility <= 40
                            ? 'bg-orange-500'
                            : 'bg-orange-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.65 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 40 && scores.comprehensibility <= 60
                            ? 'bg-amber-500'
                            : 'bg-amber-500/30'
                        )}
                        style={{ flex: 2 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.7 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 60 && scores.comprehensibility <= 80
                            ? 'bg-teal-500'
                            : 'bg-teal-500/30'
                        )}
                        style={{ flex: 1 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.75 }}
                      />
                      <motion.div
                        className={cn(
                          'rounded-full transition-opacity duration-300',
                          scores.comprehensibility > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                        )}
                        style={{ flex: 0.5 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.8 }}
                      />
                    </div>
                    {/* Current position indicator */}
                    <motion.div
                      className={'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full'}
                      style={{
                        left: `${getIndicatorPosition(scores.comprehensibility)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.85 }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Feedback with Glass AI Avatar */}
            {feedback && (
              <section>
                <div className={'inline-flex items-start gap-3 max-w-2xl'}>
                  {/* Glass AI Avatar */}
                  <div className={'shrink-0'}>
                    <Avatar className="h-10 w-10 border border-border/50 bg-card/80">
                      <AvatarImage className="h-full w-full object-cover" src="/glass-ai.png" alt="Glass AI" />
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Feedback Bubble */}
                  <div className={'bg-background/50 border border-border/30 rounded-xl p-4 flex-1'}>
                    <p className={'text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed'}>{feedback}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Memory / Context */}
          <section id="glass-memory-section">
            <button
              onClick={() => setShowMemory(!showMemory)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <Save className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Memory</Trans>
                </span>
                {isLoadingThreadContext ? (
                  <Loader2 className={'size-3 animate-spin text-muted-foreground'} />
                ) : (
                  <span className={'text-xs text-muted-foreground'}>
                    ({typeof memoryCountOverride === 'number' ? memoryCountOverride : threadContextItems.length})
                  </span>
                )}
              </div>
              {showMemory ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>

            <AnimatePresence>
              {showMemory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-2'
                    }
                  >
                    {isLoadingThreadContext ? (
                      <div className={'text-center py-8 text-muted-foreground text-sm animate-pulse'}>
                        <Trans>Fetching thread context...</Trans>
                      </div>
                    ) : threadContextItems.length > 0 ? (
                      <div className={'space-y-2'}>
                        {threadContextItems.map((item, index) => (
                          <div
                            key={`${item.type}-${item.label ?? 'item'}-${index}`}
                            className={
                              'flex items-start gap-3 rounded-xl border border-border/20 bg-background/60 px-3 py-2'
                            }
                          >
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
                                contextBadgeClass(item.type)
                              )}
                            >
                              {(item.label || item.type).charAt(0).toUpperCase() + (item.label || item.type).slice(1)}
                            </span>
                            <p className={'text-sm text-foreground leading-relaxed'}>{item.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : threadContextError ? (
                      <div className={'text-center py-6 text-xs text-red-500'}>{threadContextError}</div>
                    ) : rawThreadContext ? (
                      <pre
                        className={
                          'text-xs font-mono whitespace-pre-wrap leading-relaxed text-muted-foreground bg-background/30 rounded-lg p-3'
                        }
                      >
                        {rawThreadContext}
                      </pre>
                    ) : (
                      <div className={'text-center py-6 text-xs text-muted-foreground'}>
                        <Trans>No context available yet</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Collapsible: Conversation History with Feedback */}
          <section>
            <button
              onClick={() => setShowConversation(!showConversation)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <MessageSquare className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Conversation History</Trans>
                </span>
                <span className={'text-xs text-muted-foreground'}>
                  ({typeof conversationCountOverride === 'number' ? conversationCountOverride : messages.length})
                </span>
              </div>
              {showConversation ? <ChevronUp className={'size-4'} /> : <ChevronDown className={'size-4'} />}
            </button>
            <AnimatePresence>
              {showConversation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={'overflow-hidden'}
                >
                  <div
                    className={
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-3'
                    }
                  >
                    {messages.length > 0 ? (
                      messages.map((msg, index) => {
                        const speakerRole = getMessageRole(msg);
                        const isGlass = speakerRole === 'assistant';
                        const isUser = speakerRole === 'user';
                        const speakerInfo = resolveParticipantInfo(msg);
                        if (isGlass && !msg.text) {
                          return null;
                        }

                        const messageFeedback = msg.utterance_id ? feedbackMap.get(msg.utterance_id) : null;
                        const speakerName = speakerInfo.name;
                        const avatarUrl = speakerInfo.avatarUrl;

                        const glassFeedbackFromMessages = messages.filter(
                          (m) => getMessageRole(m) === 'assistant' && m.utterance_id === msg.utterance_id
                        );

                        return (
                          <div
                            key={index}
                            className={cn('flex gap-3 py-2', (isUser || isGlass) && 'flex-row-reverse text-right')}
                          >
                            {!isUser && !isGlass && (
                              <PartnerAvatar
                                className="h-8 w-8"
                                fallbackSize="md"
                                name={speakerName || undefined}
                                src={avatarUrl || undefined}
                              />
                            )}
                            {isGlass && (
                              <Avatar className="h-8 w-8 border border-emerald-200">
                                <AvatarImage
                                  className="h-full w-full object-cover"
                                  src="/glass-ai.png"
                                  alt="Glass AI"
                                />
                                <AvatarFallback>AI</AvatarFallback>
                              </Avatar>
                            )}
                            <div className="space-y-1 max-w-[80%]">
                              <div className="text-xs text-muted-foreground">{speakerName}</div>
                              <div
                                className={cn(
                                  'rounded-2xl px-3 py-2 text-sm',
                                  isUser
                                    ? 'bg-primary/10 ml-auto'
                                    : isGlass
                                    ? 'bg-emerald-500/10 text-emerald-900 ml-auto'
                                    : 'bg-muted/70'
                                )}
                              >
                                {msg.text}
                                {msg.translation && (
                                  <div className={'text-xs text-muted-foreground mt-1 italic'}>{msg.translation}</div>
                                )}

                                {/* Glass feedback inside user bubble */}
                                {isUser && glassFeedbackFromMessages.length > 0 && (
                                  <div className={'mt-2 pt-2 border-t border-primary/20 space-y-1 text-left'}>
                                    {glassFeedbackFromMessages.map((gf, gfIndex) => (
                                      <div key={gfIndex} className={'text-xs text-sky-600 leading-relaxed'}>
                                        {gf.text}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Legacy Feedback for this message (from feedbackItems) */}
                              {messageFeedback && messageFeedback.length > 0 && (
                                <div
                                  className={cn(
                                    'space-y-1 text-xs text-sky-600 leading-relaxed',
                                    isUser || isGlass ? 'text-right' : 'text-left'
                                  )}
                                >
                                  {messageFeedback.map((fb, fbIndex) => (
                                    <div key={fbIndex}>{fb}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className={'text-center py-4 text-sm text-muted-foreground'}>
                        <Trans>No messages</Trans>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Footer Actions */}
        <div className={'sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border/30 px-6 py-4'}>
          <div className={'flex items-center justify-between gap-3'}>
            <Button variant="outline" onClick={onClose} size="sm" className={'flex-1'}>
              <Trans>Close</Trans>
            </Button>
            <Button onClick={handleSaveCall} size="sm" className={'flex-1 bg-primary hover:bg-primary/90'}>
              <Save className={'size-4 mr-2'} />
              <Trans>Save Call</Trans>
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit partner</Trans>
          </DialogTitle>
        </DialogHeader>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={t`Change partner photo`}
              disabled={!editingPartnerId || isUploadingAvatar || !canManagePartner || deletePartnerMutation.isPending}
              onClick={() => avatarInputRef.current?.click()}
              className="group relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <PartnerAvatar
                className="pointer-events-none h-20 w-20"
                fallbackSize="lg"
                name={partnerNameDraft || undefined}
                src={editingPartnerAvatarUrl || undefined}
                alt={partnerNameDraft || t`Partner`}
              />
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100',
                  isUploadingAvatar && 'opacity-100'
                )}
              >
                {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trans>Edit</Trans>}
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
                value={partnerNameDraft}
                onChange={(event) => setPartnerNameDraft(event.target.value)}
                placeholder={t`Enter a name`}
                disabled={!editingPartnerId || !canManagePartner || isPartnerActionPending}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trans>Description</Trans>
              </Label>
              <Textarea
                value={partnerDescriptionDraft}
                onChange={(event) => setPartnerDescriptionDraft(event.target.value)}
                placeholder={t`Add a short description`}
                disabled={!editingPartnerId || !canManagePartner || isPartnerActionPending}
                rows={3}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col-reverse sm:flex-row sm:items-center sm:justify-between">
          {canManagePartner && editingPartnerId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeletePartner}
              disabled={isPartnerActionPending}
              className="w-full sm:w-auto justify-center cursor-pointer disabled:cursor-not-allowed text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              {deletePartnerMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              <Trans>Delete partner</Trans>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex w-full sm:w-auto gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isPartnerActionPending}
              className="flex-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <Trans>Close</Trans>
            </Button>
            <Button
              size="sm"
              onClick={() => renamePartnerMutation.mutate()}
              disabled={!editingPartnerId || !canManagePartner || isPartnerActionPending || !partnerNameDraft.trim()}
              className="flex-1 cursor-pointer disabled:cursor-not-allowed"
            >
              {renamePartnerMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Trans>Save</Trans>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default CallSummary;
