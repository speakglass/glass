'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  RefreshCcw,
  BookOpen,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Save,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
} from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { t, plural } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PartnerAvatar } from '@/components/partner-avatar';
import { PartnerSearchEmptyState } from '@/components/partner-search-empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { useAccountSession } from '@/contexts/account-session-context';
import type {
  ConversationDetail,
  ConversationSummary,
  ConversationMessage,
  ConversationPartner,
  ConversationPartnerRef,
} from '@/lib/account-api';
import {
  fetchConversationDetail,
  fetchConversationSummaries,
  deleteConversation,
  updateConversationTitle,
  fetchPartners,
  updatePartner,
  reassignConversationPartner,
  uploadPartnerAvatar,
  createPartner,
  deletePartner,
} from '@/lib/account-api';
import { useLocale } from '@/hooks/use-locale';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return t`just now`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return plural(diffInMinutes, {
      one: '# min ago',
      other: '# mins ago',
    });
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return plural(diffInHours, {
      one: '# hour ago',
      other: '# hours ago',
    });
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return plural(diffInDays, {
      one: '# day ago',
      other: '# days ago',
    });
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return plural(diffInWeeks, {
      one: '# week ago',
      other: '# weeks ago',
    });
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return plural(diffInMonths, {
      one: '# month ago',
      other: '# months ago',
    });
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return plural(diffInYears, {
    one: '# year ago',
    other: '# years ago',
  });
}

const getMessageRole = (message: ConversationMessage): string => (message.role || '').toLowerCase();

const getMessageParticipantId = (message: ConversationMessage): string => {
  if (typeof message.partner_id === 'string' && message.partner_id) {
    return message.partner_id.toLowerCase();
  }
  return '';
};

function formatDate(date: Date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return t`${secs}s`;
  return t`${mins}m ${secs}s`;
}

const MEMORY_SCOPE_LABELS: Record<string, string> = {
  user: t`User`,
  partner: t`Partner`,
  interaction: t`Interaction`,
};

// Language names localized by current UI language
const LANGUAGE_NAMES_BY_LOCALE: Record<string, Record<string, string>> = {
  en: {
    en: 'English',
    ko: 'Korean',
    ja: 'Japanese',
    es: 'Spanish',
    fr: 'French',
  },
  ko: {
    en: '영어',
    ko: '한국어',
    ja: '일본어',
    es: '스페인어',
    fr: '프랑스어',
  },
  ja: {
    en: '英語',
    ko: '韓国語',
    ja: '日本語',
    es: 'スペイン語',
    fr: 'フランス語',
  },
  es: {
    en: 'Inglés',
    ko: 'Coreano',
    ja: 'Japonés',
    es: 'Español',
    fr: 'Francés',
  },
  fr: {
    en: 'Anglais',
    ko: 'Coréen',
    ja: 'Japonais',
    es: 'Espagnol',
    fr: 'Français',
  },
};

function getLanguageName(code: string | null | undefined, currentLocale: string = 'en'): string {
  if (!code) return '—';
  const localeNames = LANGUAGE_NAMES_BY_LOCALE[currentLocale] || LANGUAGE_NAMES_BY_LOCALE.en;
  return localeNames[code.toLowerCase()] || code;
}

export function ConversationHistory() {
  const locale = useLocale();
  const router = useRouter();
  const { snapshot, status, token, refresh } = useAccountSession();
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [showMemory, setShowMemory] = useState(false);

  // Edit and delete state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isPartnerManagerOpen, setIsPartnerManagerOpen] = useState(false);
  const [partnerNameDraft, setPartnerNameDraft] = useState('');
  const [partnerDescriptionDraft, setPartnerDescriptionDraft] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPartnerDeleteDialogOpen, setIsPartnerDeleteDialogOpen] = useState(false);
  const debounceTimerForTitleRef = useRef<NodeJS.Timeout>();

  // Pagination and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const [partnerProfile, setPartnerProfile] = useState<ConversationPartnerRef | undefined>(
    selected?.partner || undefined
  );
  useEffect(() => {
    setPartnerProfile(selected?.partner || undefined);
  }, [selected?.partner]);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(partnerProfile?.id ?? null);
  const [editingPartnerAvatarUrl, setEditingPartnerAvatarUrl] = useState<string | null>(
    partnerProfile?.avatarUrl || null
  );
  const currentPartnerId = partnerProfile?.id ?? null;
  const {
    data: partnerOptions = [],
    isLoading: partnerListLoading,
    refetch: refetchPartners,
  } = useQuery({
    queryKey: ['history-partners', selected?.learningLang, isPartnerManagerOpen],
    queryFn: () => fetchPartners(token!, selected?.learningLang),
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
      setEditingPartnerAvatarUrl(partnerProfile?.avatarUrl || null);
      setPartnerSearch('');
    }
  }, [
    isPartnerManagerOpen,
    partnerProfile?.avatarUrl,
    partnerProfile?.description,
    partnerProfile?.id,
    partnerProfile?.name,
  ]);
  useEffect(() => {
    setIsPartnerManagerOpen(false);
  }, [selected?.id]);
  const isRoleplayPartner = Boolean(
    partnerProfile?.kind === 'roleplay' ||
      selected?.partner?.kind === 'roleplay' ||
      partnerProfile?.isSystem ||
      selected?.partner?.isSystem
  );
  const sessionMode = (isRoleplayPartner ? 'roleplay' : 'live_call') as 'roleplay' | 'live_call';
  const canManagePartner = sessionMode !== 'roleplay';
  const showPartnerManager = Boolean(canManagePartner && token);
  const preparePartnerEdit = (partner?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
  }) => {
    setEditingPartnerId(partner?.id ?? null);
    setPartnerNameDraft(partner?.name || '');
    setPartnerDescriptionDraft(partner?.description || '');
    setEditingPartnerAvatarUrl(partner?.avatarUrl ?? null);
  };
  const trimmedPartnerSearch = partnerSearch.trim();
  const availablePartners: ConversationPartner[] = useMemo(() => {
    if (!partnerOptions?.length) return [];
    return partnerOptions.filter((partner) => partner.id !== currentPartnerId && partner.kind === 'live_call');
  }, [partnerOptions, currentPartnerId]);
  const filteredPartners = useMemo(() => {
    const query = trimmedPartnerSearch.toLowerCase();
    if (!query) {
      return availablePartners;
    }
    return availablePartners.filter((partner) => partner.name.toLowerCase().includes(query));
  }, [availablePartners, trimmedPartnerSearch]);
  useEffect(() => {
    if (!canManagePartner && isPartnerManagerOpen) {
      setIsPartnerManagerOpen(false);
    }
  }, [canManagePartner, isPartnerManagerOpen]);

  const openPartnerEditor = (partnerData?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
  }) => {
    if (!canManagePartner) {
      return;
    }
    preparePartnerEdit(partnerData);
    setIsEditModalOpen(true);
  };

  const handlePartnerSave = () => {
    if (!partnerNameDraft.trim()) {
      toast.error(t`Enter a partner name`);
      return;
    }
    if (editingPartnerId) {
      renamePartnerMutation.mutate();
    } else {
      createPartnerAndAssignMutation.mutate();
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!token || !editingPartnerId) {
      toast.error(t`Missing partner information`);
      return;
    }
    if (!selected) {
      toast.error(t`Select a conversation first`);
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
        setPartnerProfile({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          avatarUrl: updated.avatarUrl || null,
          voiceId: updated.voiceId || null,
          kind: updated.kind,
        });
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                partner: {
                  ...(prev.partner || {}),
                  id: updated.id,
                  name: updated.name,
                  description: updated.description,
                  avatarUrl: updated.avatarUrl || null,
                  voiceId: updated.voiceId || null,
                  kind: updated.kind,
                },
              }
            : prev
        );
      }
      refetchPartners();
      toast.success(t`Photo updated`);
    } catch (error) {
      console.error('[History] Failed to upload avatar', error);
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
        setPartnerProfile({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          avatarUrl: updated.avatarUrl || null,
          voiceId: updated.voiceId || null,
          kind: updated.kind,
        });
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                partner: {
                  ...(prev.partner || {}),
                  id: updated.id,
                  name: updated.name,
                  description: updated.description,
                  avatarUrl: updated.avatarUrl || null,
                  voiceId: updated.voiceId || null,
                  kind: updated.kind,
                },
              }
            : prev
        );
      }
      refetchPartners();
      toast.success(t`Partner updated`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to update partner`;
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
        setPartnerProfile(undefined);
        setSelected((prev) => {
          if (!prev || !prev.partner || prev.partner.id !== deletedId) {
            return prev;
          }
          return {
            ...prev,
            partner: undefined,
          };
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
    setIsPartnerDeleteDialogOpen(true);
  };
  const confirmDeletePartner = () => {
    if (!editingPartnerId || !canManagePartner || deletePartnerMutation.isPending) {
      return;
    }
    if (!token) {
      toast.error(t`Missing authentication`);
      setIsPartnerDeleteDialogOpen(false);
      return;
    }
    deletePartnerMutation.mutate();
    setIsPartnerDeleteDialogOpen(false);
  };
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
        learningLang: selected?.learningLang || undefined,
        nativeLang: selected?.nativeLang || undefined,
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
  const createPartnerAndAssignMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error(t`Missing authentication`);
      }
      if (!selected?.id) {
        throw new Error(t`Select a conversation first`);
      }
      const trimmedName = partnerNameDraft.trim();
      if (!trimmedName) {
        throw new Error(t`Enter a name first`);
      }
      const partner = await createPartner(token, {
        name: trimmedName,
        description: partnerDescriptionDraft?.trim() || null,
        learningLang: selected?.learningLang || undefined,
        nativeLang: selected?.nativeLang || undefined,
      });
      await reassignConversationPartner(token, selected.id, partner.id);
      return partner;
    },
    onSuccess: (partner) => {
      const ref: ConversationPartnerRef = {
        id: partner.id,
        name: partner.name,
        description: partner.description || null,
        avatarUrl: partner.avatarUrl || null,
        voiceId: partner.voiceId || null,
        kind: partner.kind,
      };
      setPartnerProfile(ref);
      setSelected((prev) => (prev ? { ...prev, partner: ref } : prev));
      setEditingPartnerId(partner.id);
      setPartnerNameDraft(partner.name || '');
      setPartnerDescriptionDraft(partner.description || '');
      setIsPartnerManagerOpen(false);
      setIsEditModalOpen(false);
      refetchPartners();
      toast.success(t`Partner created`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to create partner`;
      toast.error(message);
    },
  });
  const reassignPartnerMutation = useMutation({
    mutationFn: async (targetPartnerId: string) => {
      if (!token || !selected) {
        throw new Error(t`Missing conversation`);
      }
      await reassignConversationPartner(token, selected.id, targetPartnerId);
      const detail = await fetchConversationDetail(token, selected.id);
      return detail;
    },
    onSuccess: (detail) => {
      setSelected(detail);
      setPartnerProfile(detail.partner || undefined);
      setIsPartnerManagerOpen(false);
      setPartnerSearch('');
      toast.success(t`Conversation partner assigned`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t`Failed to assign partner`;
      toast.error(message);
    },
  });
  const isPartnerActionPending =
    renamePartnerMutation.isPending || deletePartnerMutation.isPending || createPartnerAndAssignMutation.isPending;
  const isSavingPartner = renamePartnerMutation.isPending || createPartnerAndAssignMutation.isPending;
  const partnerDeleteTarget = partnerNameDraft?.trim() || t`this partner`;

  // Calculate total pages
  const totalPages = Math.ceil(totalConversations / pageSize);

  // Debounce search query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(0); // Reset to first page when search changes
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelect = useCallback(
    async (conversation: ConversationSummary) => {
      if (!token) return;
      setError(null);
      setLoadingDetail(true);
      setShowConversation(false);
      setShowMemory(false);
      try {
        const detail = await fetchConversationDetail(token, conversation.id);
        setSelected(detail);
      } catch (err) {
        console.error('Failed to load conversation detail', err);
        setError(t`Failed to load conversation detail. Please try again.`);
      } finally {
        setLoadingDetail(false);
      }
    },
    [token]
  );

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setEditTitle(selected?.title || '');
  };

  const handleTitleChange = (newTitle: string) => {
    setEditTitle(newTitle);

    // Debounce auto-save
    if (debounceTimerForTitleRef.current) {
      clearTimeout(debounceTimerForTitleRef.current);
    }

    debounceTimerForTitleRef.current = setTimeout(() => {
      void saveTitleUpdate(newTitle, false);
    }, 1000);
  };

  const handleTitleBlur = () => {
    // Cancel debounced save
    if (debounceTimerForTitleRef.current) {
      clearTimeout(debounceTimerForTitleRef.current);
    }

    setIsEditingTitle(false);
    // Save on blur
    if (editTitle.trim() && editTitle.trim() !== selected?.title) {
      void saveTitleUpdate(editTitle, true);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // Cancel debounced save
      if (debounceTimerForTitleRef.current) {
        clearTimeout(debounceTimerForTitleRef.current);
      }

      setIsEditingTitle(false);
      // Optimistic update on Enter
      if (editTitle.trim() && editTitle.trim() !== selected?.title) {
        void saveTitleUpdate(editTitle, true);
      }
    }
    if (e.key === 'Escape') {
      // Cancel debounced save
      if (debounceTimerForTitleRef.current) {
        clearTimeout(debounceTimerForTitleRef.current);
      }

      setEditTitle(selected?.title || '');
      setIsEditingTitle(false);
    }
  };

  const saveTitleUpdate = async (newTitle: string, isOptimistic: boolean) => {
    if (!token || !selected || !newTitle.trim() || newTitle.trim() === selected.title) return;

    const oldTitle = selected.title;
    const trimmedTitle = newTitle.trim();

    // Optimistic update
    if (isOptimistic && selected) {
      setSelected({ ...selected, title: trimmedTitle });
      setConversations((prev) =>
        prev.map((conv) => (conv.id === selected.id ? { ...conv, title: trimmedTitle } : conv))
      );
    }

    try {
      await updateConversationTitle(token, selected.id, trimmedTitle);

      if (!isOptimistic) {
        // Non-optimistic: fetch updated data
        const response = await fetchConversationSummaries(token, {
          limit: pageSize,
          offset: page * pageSize,
          search: debouncedSearchQuery || undefined,
        });
        setConversations(response.conversations);

        const updatedDetail = await fetchConversationDetail(token, selected.id);
        setSelected(updatedDetail);
      }

      if (isOptimistic) {
        toast.success(t`Title updated`);
      }
    } catch (err) {
      console.error('Failed to update title', err);
      toast.error(t`Failed to update title`);

      // Rollback on error
      if (isOptimistic && selected) {
        setSelected({ ...selected, title: oldTitle });
        setConversations((prev) => prev.map((conv) => (conv.id === selected.id ? { ...conv, title: oldTitle } : conv)));
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!token || !selected) return;

    try {
      await deleteConversation(token, selected.id);
      toast.success(t`Conversation deleted`);

      setSelected(null);
      setDeleteConfirmOpen(false);

      // Reload conversations
      const response = await fetchConversationSummaries(token, {
        limit: pageSize,
        offset: page * pageSize,
        search: debouncedSearchQuery || undefined,
      });
      setConversations(response.conversations);
      setTotalConversations(response.total);
      await refresh();
    } catch (err) {
      console.error('Failed to delete conversation', err);
      toast.error(t`Failed to delete conversation`);
    }
  };

  // Fetch conversations when token, page, or debounced search changes
  useEffect(() => {
    if (!token) return;

    const loadConversations = async () => {
      setLoadingConversations(true);
      try {
        const response = await fetchConversationSummaries(token, {
          limit: pageSize,
          offset: page * pageSize,
          search: debouncedSearchQuery || undefined,
        });
        setConversations(response.conversations);
        setTotalConversations(response.total);
      } catch (err) {
        console.error('Failed to load conversations', err);
        setError(t`Failed to load conversations`);
      } finally {
        setLoadingConversations(false);
      }
    };

    void loadConversations();
  }, [token, page, debouncedSearchQuery, pageSize]);

  // Auto-select first conversation when list changes
  useEffect(() => {
    if (!selected && conversations.length && token) {
      void handleSelect(conversations[0]);
    } else if (selected && conversations.length > 0) {
      // Check if current selected conversation is still in the list
      const stillExists = conversations.some((c) => c.id === selected.id);
      if (!stillExists) {
        // Current selection is not in the filtered list, select first item
        void handleSelect(conversations[0]);
      }
    } else if (conversations.length === 0 && selected) {
      // No conversations in the list, clear selection
      setSelected(null);
    }
  }, [conversations, handleSelect, selected, token]);

  // Helper functions for scores (from CallSummary)
  const getScoreLabel = (score: number): { text: string; color: string } => {
    if (score >= 80) return { text: 'Excellent', color: 'text-emerald-500' };
    if (score >= 60) return { text: 'Good', color: 'text-teal-500' };
    if (score >= 40) return { text: 'Average', color: 'text-amber-500' };
    if (score >= 20) return { text: 'Below Average', color: 'text-orange-500' };
    return { text: 'Low', color: 'text-red-500' };
  };

  const getIndicatorPosition = (score: number): number => {
    const flexRatios = [0.5, 1, 2, 1, 0.5];
    const totalFlex = flexRatios.reduce((sum, flex) => sum + flex, 0);

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

    const flexBeforeSegment = flexRatios.slice(0, segmentIndex).reduce((sum, flex) => sum + flex, 0);
    const segmentStartPercent = (flexBeforeSegment / totalFlex) * 100;

    const segmentSize = 20;
    const positionInSegment = (score - segmentStart) / segmentSize;
    const segmentWidthPercent = (flexRatios[segmentIndex] / totalFlex) * 100;

    return segmentStartPercent + segmentWidthPercent * positionInSegment;
  };

  // Extract scores from selected conversation
  const scores = useMemo(() => {
    const summaryScores = selected?.scores;
    if (!summaryScores) {
      return null;
    }
    return {
      fluency: summaryScores.fluency ?? 0,
      accuracy: summaryScores.accuracy ?? 0,
      comprehensibility: summaryScores.comprehensibility ?? 0,
    };
  }, [selected]);

  const averageScore = scores ? Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3) : 0;

  const participantDirectory = useMemo(() => {
    const directory = new Map<
      string,
      {
        name: string;
        avatarUrl?: string;
      }
    >();
    directory.set('glass', { name: t`Glass`, avatarUrl: '/glass-ai.png' });
    directory.set('user', { name: t`You`, avatarUrl: undefined });
    const partnerEntry = {
      name: partnerProfile?.name || t`Partner`,
      avatarUrl: partnerProfile?.avatarUrl ?? undefined,
    };
    directory.set('partner', partnerEntry);
    if (partnerProfile?.id && typeof partnerProfile.id === 'string') {
      directory.set(partnerProfile.id.toLowerCase(), partnerEntry);
    }
    return directory;
  }, [partnerProfile]);

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
  const memoryRecords = selected?.memories ?? [];
  const selectedConversationName = selected?.title || t`this conversation`;

  if (status === 'loading' || status === 'idle' || status === 'signed-out') {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <Trans>Loading history…</Trans>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          <Trans>We couldn't load your history. Refresh and try again.</Trans>
        </p>
        <Button onClick={() => void refresh()}>
          <RefreshCcw className="mr-2 size-4" />
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left: Conversation List */}
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t`Search conversations...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearchQuery('');
                  setPage(0);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Loading State */}
          {loadingConversations && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty State */}
          {!loadingConversations && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? (
                <>
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <Trans>No conversations found</Trans>
                </>
              ) : (
                <>
                  <BookOpen className="h-8 w-8 mb-2 opacity-50" />
                  <Trans>No conversations yet</Trans>
                </>
              )}
            </div>
          )}

          {/* Conversation List */}
          {!loadingConversations &&
            conversations.map((conversation) => {
              const isActive = selected?.id === conversation.id;
              const convScores = conversation.scores ?? null;
              const avgScore = convScores
                ? Math.round((convScores.fluency + convScores.accuracy + convScores.comprehensibility) / 3)
                : 0;

              return (
                <button
                  key={conversation.id}
                  onClick={() => void handleSelect(conversation)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer',
                    isActive
                      ? 'border-primary/40 bg-primary/5 shadow-sm'
                      : 'border-border/40 hover:border-border hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{conversation.title || t`Conversation`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(conversation.startedAt)}
                      </p>
                    </div>
                    {convScores && avgScore > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            'text-base font-bold tabular-nums',
                            isActive ? 'text-primary' : 'text-foreground/70'
                          )}
                        >
                          {avgScore}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

          {/* Pagination */}
          {totalConversations > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-3 border-t border-border/30">
              <div className="text-xs text-muted-foreground">
                {plural(totalConversations, {
                  one: '# conversation',
                  other: '# conversations',
                })}
                {totalPages > 1 && <> • {t`Page ${page + 1} of ${totalPages}`}</>}
              </div>
              {totalPages > 1 && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0 || loadingConversations}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1 || loadingConversations}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Conversation Detail */}
        <div className="rounded-3xl border border-border/50 bg-card/80 sticky top-8 self-start max-h-[calc(100vh-240px)] overflow-hidden flex flex-col">
          {loadingDetail && (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingDetail && !selected && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-6">
              <MessageSquare className="h-12 w-12 text-muted-foreground opacity-50" />
              <div>
                <p className="font-semibold text-muted-foreground">
                  {debouncedSearchQuery ? (
                    <Trans>No conversations found for "{debouncedSearchQuery}"</Trans>
                  ) : (
                    <Trans>Select a conversation to view details</Trans>
                  )}
                </p>
              </div>
            </div>
          )}
          {!loadingDetail && selected && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Header with Actions */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Editable Title - Notion Style */}
                  {isEditingTitle ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      onBlur={handleTitleBlur}
                      onKeyDown={handleTitleKeyDown}
                      className="text-xl font-semibold h-auto px-0 border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="text-xl font-semibold cursor-pointer hover:text-primary transition-colors"
                      onClick={handleTitleClick}
                      title={t`Click to edit`}
                    >
                      {selected.title || t`Untitled Conversation`}
                    </h2>
                  )}
                  <div className="space-y-2 mt-1 relative">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{selected.startedAt ? formatRelativeTime(selected.startedAt) : '—'}</span>
                      {selected.durationSeconds !== null && selected.durationSeconds !== undefined && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          <span>{formatDuration(selected.durationSeconds)}</span>
                        </>
                      )}
                      {(selected.learningLang || selected.nativeLang) && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          <span>
                            {getLanguageName(selected.learningLang as string, locale)} ↔{' '}
                            {getLanguageName(selected.nativeLang as string, locale)}
                          </span>
                        </>
                      )}
                      {(partnerProfile || showPartnerManager) && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          {showPartnerManager ? (
                            <Popover open={isPartnerManagerOpen} onOpenChange={setIsPartnerManagerOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm transition',
                                    'bg-transparent hover:bg-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                                  )}
                                >
                                  <PartnerAvatar
                                    className="h-6 w-6"
                                    fallbackSize="sm"
                                    name={partnerProfile?.name || t`Partner`}
                                    src={partnerProfile?.avatarUrl || undefined}
                                  />
                                  <span className="font-medium text-foreground">
                                    {partnerProfile?.name || t`Partner`}
                                  </span>
                                  <ChevronDown
                                    className={cn(
                                      'h-3.5 w-3.5 text-muted-foreground transition-transform',
                                      isPartnerManagerOpen && 'rotate-180'
                                    )}
                                  />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-72 max-w-[90vw] p-0"
                                align="center"
                                side="bottom"
                                sideOffset={6}
                              >
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
                                  {partnerProfile ? (
                                    <div className="px-3">
                                      <div className="group relative flex items-center gap-2 rounded-md bg-accent/70 px-3 py-2 pr-16 text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <PartnerAvatar
                                            className="h-6 w-6"
                                            fallbackSize="sm"
                                            name={partnerProfile.name}
                                            src={partnerProfile.avatarUrl || undefined}
                                          />
                                          <span className="font-medium text-foreground truncate">
                                            {partnerProfile.name || t`Partner`}
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
                                  ) : (
                                    <div className="px-3">
                                      <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                        <p className="font-medium text-foreground">
                                          <Trans>No partner assigned</Trans>
                                        </p>
                                        <p>
                                          <Trans>Select an existing partner or create a new one.</Trans>
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  <div className="px-3 pt-3 text-xs text-muted-foreground">
                                    <Trans>Select a partner</Trans>
                                  </div>
                                  <div className="max-h-60 overflow-y-auto">
                                    {partnerListLoading ? (
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
                            <span className="inline-flex items-center gap-2 text-sm text-foreground">
                              <PartnerAvatar
                                className="h-6 w-6"
                                fallbackSize="sm"
                                name={partnerProfile?.name || t`Partner`}
                                src={partnerProfile?.avatarUrl || undefined}
                              />
                              <span className="font-medium text-foreground">{partnerProfile?.name || t`Partner`}</span>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">
                    <Trans>Delete</Trans>
                  </span>
                </Button>
              </div>

              {/* Scores Section - only if scores exist */}
              {scores && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-muted-foreground block mb-1">
                        <Trans>Overall Score</Trans>
                      </span>
                      <span className="text-3xl font-bold">{averageScore}</span>
                    </div>

                    {/* Mini bar graph */}
                    <div className="flex items-end gap-0.5 h-10">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                        const scorePercent = averageScore / 100;
                        const segmentThreshold = i / 8;
                        const isActive = scorePercent > segmentThreshold;

                        const heights = [25, 35, 45, 55, 65, 75, 85, 95];
                        const height = heights[i];

                        let color = 'rgb(239, 68, 68)';
                        if (i >= 6) color = 'rgb(16, 185, 129)';
                        else if (i >= 5) color = 'rgb(20, 184, 166)';
                        else if (i >= 3) color = 'rgb(245, 158, 11)';
                        else if (i >= 2) color = 'rgb(251, 146, 60)';

                        return (
                          <motion.div
                            key={i}
                            className="w-1.5 rounded-full"
                            style={{
                              height: `${height}%`,
                              backgroundColor: isActive ? color : 'rgba(100, 116, 139, 0.2)',
                            }}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: `${height}%`, opacity: 1 }}
                            transition={{
                              duration: 0.3,
                              delay: i * 0.03,
                              ease: 'easeOut',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Score gauges */}
                  <div className="space-y-2">
                    {/* Fluency */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          <Trans>Fluency</Trans>
                        </span>
                        <span className={cn('text-sm font-medium', getScoreLabel(scores.fluency).color)}>
                          {getScoreLabel(scores.fluency).text}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="flex gap-1 h-2">
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.fluency > 0 && scores.fluency <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.fluency > 20 && scores.fluency <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.fluency > 40 && scores.fluency <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                            )}
                            style={{ flex: 2 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.fluency > 60 && scores.fluency <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.fluency > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                        </div>
                        <div
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                          style={{
                            left: `${getIndicatorPosition(scores.fluency)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Accuracy */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          <Trans>Accuracy</Trans>
                        </span>
                        <span className={cn('text-sm font-medium', getScoreLabel(scores.accuracy).color)}>
                          {getScoreLabel(scores.accuracy).text}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="flex gap-1 h-2">
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.accuracy > 0 && scores.accuracy <= 20 ? 'bg-red-500' : 'bg-red-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.accuracy > 20 && scores.accuracy <= 40 ? 'bg-orange-500' : 'bg-orange-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.accuracy > 40 && scores.accuracy <= 60 ? 'bg-amber-500' : 'bg-amber-500/30'
                            )}
                            style={{ flex: 2 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.accuracy > 60 && scores.accuracy <= 80 ? 'bg-teal-500' : 'bg-teal-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.accuracy > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                        </div>
                        <div
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                          style={{
                            left: `${getIndicatorPosition(scores.accuracy)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Comprehensibility */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          <Trans>Comprehensibility</Trans>
                        </span>
                        <span className={cn('text-sm font-medium', getScoreLabel(scores.comprehensibility).color)}>
                          {getScoreLabel(scores.comprehensibility).text}
                        </span>
                      </div>
                      <div className="relative">
                        <div className="flex gap-1 h-2">
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.comprehensibility > 0 && scores.comprehensibility <= 20
                                ? 'bg-red-500'
                                : 'bg-red-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.comprehensibility > 20 && scores.comprehensibility <= 40
                                ? 'bg-orange-500'
                                : 'bg-orange-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.comprehensibility > 40 && scores.comprehensibility <= 60
                                ? 'bg-amber-500'
                                : 'bg-amber-500/30'
                            )}
                            style={{ flex: 2 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.comprehensibility > 60 && scores.comprehensibility <= 80
                                ? 'bg-teal-500'
                                : 'bg-teal-500/30'
                            )}
                            style={{ flex: 1 }}
                          />
                          <div
                            className={cn(
                              'rounded-full transition-opacity duration-300',
                              scores.comprehensibility > 80 ? 'bg-emerald-500' : 'bg-emerald-500/30'
                            )}
                            style={{ flex: 0.5 }}
                          />
                        </div>
                        <div
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                          style={{
                            left: `${getIndicatorPosition(scores.comprehensibility)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Feedback with Glass AI Avatar */}
              {selected.feedback && (
                <section>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <Avatar className="h-10 w-10 border border-border/50 bg-card/80">
                        <AvatarImage className="h-full w-full object-cover" src="/glass-ai.png" alt="Glass AI" />
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 bg-background/50 border border-border/30 rounded-xl p-4">
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {selected.feedback}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Memory Section */}
              {memoryRecords.length > 0 && (
                <section>
                  <button
                    onClick={() => setShowMemory(!showMemory)}
                    className="w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Save className="size-4" />
                      <span className="text-sm font-semibold">
                        <Trans>Memory</Trans>
                      </span>
                      <span className="text-xs text-muted-foreground">({memoryRecords.length})</span>
                    </div>
                    {showMemory ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>

                  <AnimatePresence>
                    {showMemory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-64 overflow-auto space-y-2">
                          {memoryRecords.map((memory) => {
                            const label = MEMORY_SCOPE_LABELS[(memory.scope || '').toLowerCase()] || t`Memory`;
                            return (
                              <div
                                key={memory.id}
                                className="flex items-start gap-2 p-2 rounded-lg bg-background/50 border border-border/20"
                              >
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 border',
                                    'bg-slate-500/10 text-slate-500 border-slate-500/30'
                                  )}
                                >
                                  {label}
                                </span>
                                <div className="flex-1 min-w-0 text-sm break-words">{memory.text}</div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}

              {/* Conversation History Section */}
              <section>
                <button
                  onClick={() => setShowConversation(!showConversation)}
                  className="w-full flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4" />
                    <span className="text-sm font-semibold">
                      <Trans>Conversation History</Trans>
                    </span>
                    <span className="text-xs text-muted-foreground">({selected.messages?.length || 0})</span>
                  </div>
                  {showConversation ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>

                <AnimatePresence>
                  {showConversation && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 bg-background/50 border border-border/30 rounded-lg p-3 space-y-3">
                        {selected.messages && selected.messages.length > 0 ? (
                          selected.messages.map((message, idx) => {
                            const speakerRole = getMessageRole(message);
                            const text = message.text || '';
                            const translation = message.translation || undefined;
                            const isUser = speakerRole === 'user';
                            const isGlass = speakerRole === 'assistant';
                            const speakerInfo = resolveParticipantInfo(message);
                            const speakerName = speakerInfo.name;
                            const avatarUrl = speakerInfo.avatarUrl;

                            return (
                              <div
                                key={`${selected.id}-${idx}`}
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
                                    {text}
                                    {translation && (
                                      <div className="text-xs text-muted-foreground mt-1 italic">{translation}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            <Trans>No messages</Trans>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          )}
          {error && (
            <div className="p-6">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* Delete Confirmation Alert Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans>Delete conversation</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t`Are you sure you want to delete "${selectedConversationName}"? This action cannot be undone and will permanently remove this conversation from your history.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans>Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  void handleDeleteConfirm();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                <Trans>Delete</Trans>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
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
                disabled={
                  !editingPartnerId || isUploadingAvatar || !canManagePartner || deletePartnerMutation.isPending
                }
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
      <AlertDialog open={isPartnerDeleteDialogOpen} onOpenChange={setIsPartnerDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete partner</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t`Are you sure you want to delete "${partnerDeleteTarget}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePartnerMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event: React.MouseEvent) => {
                event.preventDefault();
                confirmDeletePartner();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deletePartnerMutation.isPending}
            >
              {deletePartnerMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              <Trans>Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
