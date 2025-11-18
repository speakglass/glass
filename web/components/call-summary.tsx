'use client';
import { cn } from '@/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, Save, ChevronDown, ChevronUp, MessageSquare, Loader2, Edit3, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PartnerAvatar } from '@/components/partner-avatar';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useAccountSession } from '@/contexts/account-session-context';
import {
  fetchPartners,
  reassignConversationPartner,
  updatePartner,
  uploadPartnerAvatar,
  createPartner,
  deletePartner,
  updateConversationMemoryInsights,
  type ConversationMessage,
  type ConversationPartner,
  type MemoryInsights,
} from '@/lib/account-api';
import { getMessageRole, getMessageParticipantId } from '@/lib/conversation-utils';
import {
  formatConversationDuration,
  getLanguageName,
  getScoreIndicatorPosition,
  getScoreLabel,
} from '@/lib/conversation-display';
import { useLocale } from '@/hooks/use-locale';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConversationMessagesList } from '@/components/conversation/conversation-messages-list';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { PartnerSearchEmptyState } from '@/components/partner-search-empty-state';

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

interface CallSummaryProps {
  conversationId?: string; // DB conversation ID for fetching conversation memories
  memoryInsights?: MemoryInsights | null;
  scores: ConversationScores;
  extractedInfo?: ExtractedInfo[];
  feedback?: string;
  messages?: ConversationMessage[];
  feedbackItems?: FeedbackItem[];
  onClose: () => void;
  onStartNewCall: (contextInfo: ExtractedInfo[]) => void;
  conversationCountOverride?: number;
  participantSnapshot?: ParticipantSnapshot | null;
  durationSeconds?: number | null;
  learningLang?: string | null;
  nativeLang?: string | null;
}

type MemoryHighlightKey = 'user_insights' | 'partner_insights' | 'interaction_insights';

interface MemoryDraft {
  id: string;
  type: MemoryHighlightKey;
  text: string;
}

const INSIGHT_TYPES: MemoryHighlightKey[] = ['user_insights', 'partner_insights', 'interaction_insights'];

const INSIGHT_LABELS: Record<MemoryHighlightKey, string> = {
  user_insights: t`User`,
  partner_insights: t`Partner`,
  interaction_insights: t`Interaction`,
};

const generateDraftId = () =>
  globalThis.crypto?.randomUUID?.() ?? `memory-${Math.random().toString(36).slice(2, 9)}`;

const CallSummary = ({
  conversationId,
  memoryInsights = null,
  scores,
  extractedInfo: initialInfo = [],
  feedback = '',
  messages = [],
  feedbackItems = [],
  onClose,
  onStartNewCall,
  conversationCountOverride,
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
  const [memoryDrafts, setMemoryDrafts] = useState<MemoryDraft[]>([]);
  const [isSavingMemories, setIsSavingMemories] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [editingInsightId, setEditingInsightId] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [isPartnerManagerOpen, setIsPartnerManagerOpen] = useState(false);
  const [partnerNameDraft, setPartnerNameDraft] = useState(partnerProfile?.name || '');
  const [partnerDescriptionDraft, setPartnerDescriptionDraft] = useState(partnerProfile?.description || '');
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(partnerProfile?.id ?? null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [editingPartnerAvatarUrl, setEditingPartnerAvatarUrl] = useState<string | null>(
    partnerProfile?.avatar_url || null
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPartnerDeleteDialogOpen, setIsPartnerDeleteDialogOpen] = useState(false);
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
  useEffect(() => {
    if (!isEditModalOpen) {
      setIsPartnerDeleteDialogOpen(false);
    }
  }, [isEditModalOpen]);

  useEffect(() => {
    if (!memoryInsights) {
      setMemoryDrafts([]);
      return;
    }

    const drafts: MemoryDraft[] = [];
    INSIGHT_TYPES.forEach((type) => {
      const values = memoryInsights[type] ?? [];
      values.forEach((value) => {
        if (typeof value !== 'string') {
          return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        drafts.push({
          id: generateDraftId(),
          type,
          text: trimmed,
        });
      });
    });
    setMemoryDrafts(drafts);
  }, [memoryInsights]);

  const handleMemoryDraftChange = useCallback((id: string, text: string) => {
    setMemoryDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, text } : draft))
    );
  }, []);

  const handleRemoveMemoryDraft = useCallback((id: string) => {
    setMemoryDrafts((prev) => prev.filter((draft) => draft.id !== id));
  }, []);

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
    typeof durationSeconds === 'number' && durationSeconds >= 0
      ? formatConversationDuration(durationSeconds)
      : null;
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

  const renderMessageFeedback = useCallback(
    (message: ConversationMessage, context: { isUser: boolean; isGlass: boolean }) => {
      const feedbackForMessage = message.utterance_id ? feedbackMap.get(message.utterance_id) : null;
      if (!feedbackForMessage || feedbackForMessage.length === 0) {
        return null;
      }
      return (
        <div
          className={cn(
            'space-y-1 text-xs text-sky-600 leading-relaxed',
            context.isUser || context.isGlass ? 'text-right' : 'text-left'
          )}
        >
          {feedbackForMessage.map((fb, index) => (
            <div key={`${message.utterance_id ?? 'feedback'}-${index}`}>{fb}</div>
          ))}
        </div>
      );
    },
    [feedbackMap]
  );

  const buildMemoryInsightsPayload = useCallback((): MemoryInsights | null => {
    const grouped: Record<MemoryHighlightKey, string[]> = {
      user_insights: [],
      partner_insights: [],
      interaction_insights: [],
    };

    memoryDrafts.forEach((draft) => {
      const trimmed = draft.text.trim();
      if (!trimmed) {
        return;
      }
      grouped[draft.type].push(trimmed);
    });

    const insights: MemoryInsights = {};
    if (grouped.user_insights.length) {
      insights.user_insights = grouped.user_insights.slice(0, 3);
    }
    if (grouped.partner_insights.length) {
      insights.partner_insights = grouped.partner_insights.slice(0, 3);
    }
    if (grouped.interaction_insights.length) {
      insights.interaction_insights = grouped.interaction_insights.slice(0, 3);
    }

    return (insights.user_insights || insights.partner_insights || insights.interaction_insights)
      ? insights
      : null;
  }, [memoryDrafts]);

  const handleSaveCall = useCallback(async () => {
    if (conversationId && token) {
      const payload = buildMemoryInsightsPayload();
      if (payload) {
        setIsSavingMemories(true);
        try {
          await updateConversationMemoryInsights(token, conversationId, payload);
        } catch (error) {
          console.error('[CallSummary] Failed to save memory highlights:', error);
          toast.error(t`Unable to save memory highlights right now.`);
        } finally {
          setIsSavingMemories(false);
        }
      }
    }
    onStartNewCall(initialInfo);
  }, [conversationId, token, buildMemoryInsightsPayload, onStartNewCall, initialInfo]);

  const averageScore = Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3);

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
                  <PartnerSearchEmptyState
                    searchTerm={trimmedPartnerSearch}
                    isCreating={createPartnerMutation.isPending}
                    onCreate={
                      trimmedPartnerSearch
                        ? () => createPartnerMutation.mutate(trimmedPartnerSearch)
                        : undefined
                    }
                  />
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
                        left: `${getScoreIndicatorPosition(scores.fluency)}%`,
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
                        left: `${getScoreIndicatorPosition(scores.accuracy)}%`,
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
                        left: `${getScoreIndicatorPosition(scores.comprehensibility)}%`,
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

          <section id="glass-memory-section">
            <button
              onClick={() => setShowMemory((prev) => !prev)}
              className={
                'w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors'
              }
            >
              <div className={'flex items-center gap-2'}>
                <Save className={'size-4'} />
                <span className={'text-sm font-semibold'}>
                  <Trans>Memory</Trans>
                </span>
                <span className={'text-xs text-muted-foreground'}>({memoryDrafts.length})</span>
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
                    {memoryDrafts.length === 0 ? (
                      <div className={'text-center py-6 text-xs text-muted-foreground'}>
                        <Trans>No insights available yet.</Trans>
                      </div>
                    ) : (
                      <div className={'space-y-2'}>
                        {memoryDrafts.map((draft) => {
                          const isEditing = editingInsightId === draft.id;
                          return (
                            <div
                              key={draft.id}
                              className={
                                'flex items-center gap-3 rounded-xl border border-border/20 bg-background/60 px-3 py-2'
                              }
                            >
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
                                  'bg-slate-500/10 text-slate-500'
                                )}
                              >
                                {INSIGHT_LABELS[draft.type]}
                              </span>
                              {isEditing ? (
                                <Input
                                  value={draft.text}
                                  onChange={(event) => handleMemoryDraftChange(draft.id, event.target.value)}
                                  onBlur={() => setEditingInsightId(null)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      setEditingInsightId(null);
                                    }
                                  }}
                                  autoFocus
                                  className="flex-1"
                                  placeholder={t`Summarize this insight...`}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="flex-1 text-left text-sm text-foreground/80 leading-relaxed truncate cursor-pointer hover:text-foreground transition-colors"
                                  onClick={() => setEditingInsightId(draft.id)}
                                >
                                  {draft.text || t`Click to edit...`}
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-full p-1.5 text-muted-foreground cursor-pointer transition hover:bg-muted/10 hover:text-foreground"
                                onClick={() => handleRemoveMemoryDraft(draft.id)}
                                aria-label={t`Remove insight`}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          );
                        })}
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
                      'mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto'
                    }
                  >
                    <ConversationMessagesList
                      messages={messages}
                      resolveParticipantInfo={resolveParticipantInfo}
                      renderMessageFooter={renderMessageFeedback}
                    />
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
            <Button
              onClick={() => void handleSaveCall()}
              size="sm"
              className={'flex-1 bg-primary hover:bg-primary/90'}
              disabled={isSavingMemories}
            >
              {isSavingMemories ? (
                <Loader2 className={'size-4 mr-2 animate-spin text-muted-foreground'} />
              ) : (
                <Save className={'size-4 mr-2'} />
              )}
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
              onClick={() => setIsPartnerDeleteDialogOpen(true)}
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
    <AlertDialog open={isPartnerDeleteDialogOpen} onOpenChange={setIsPartnerDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete partner?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>This will permanently remove the partner and cannot be undone.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPartnerActionPending}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              handleDeletePartner();
            }}
            disabled={isPartnerActionPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deletePartnerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            <Trans>Delete</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default CallSummary;
