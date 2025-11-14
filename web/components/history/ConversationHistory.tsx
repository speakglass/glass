'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
} from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccountSession } from '@/contexts/AccountSessionContext';
import type { ConversationDetail, ConversationSummary } from '@/lib/accountApi';
import { fetchConversationDetail, fetchConversationSummaries } from '@/lib/accountApi';
import { useLocale } from '@/hooks/useLocale';

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

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
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// Language names localized by current UI language
const LANGUAGE_NAMES_BY_LOCALE: Record<string, Record<string, string>> = {
  en: {
    en: 'English',
    ko: 'Korean',
    ja: 'Japanese',
    zh: 'Chinese',
    es: 'Spanish',
    fr: 'French',
  },
  ko: {
    en: '영어',
    ko: '한국어',
    ja: '일본어',
    zh: '중국어',
    es: '스페인어',
    fr: '프랑스어',
  },
  ja: {
    en: '英語',
    ko: '韓国語',
    ja: '日本語',
    zh: '中国語',
    es: 'スペイン語',
    fr: 'フランス語',
  },
  zh: {
    en: '英语',
    ko: '韩语',
    ja: '日语',
    zh: '中文',
    es: '西班牙语',
    fr: '法语',
  },
  es: {
    en: 'Inglés',
    ko: 'Coreano',
    ja: 'Japonés',
    zh: 'Chino',
    es: 'Español',
    fr: 'Francés',
  },
  fr: {
    en: 'Anglais',
    ko: 'Coréen',
    ja: 'Japonais',
    zh: 'Chinois',
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
  const { snapshot, status, token, refresh } = useAccountSession();
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [showMemory, setShowMemory] = useState(false);

  // Pagination and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

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
        setError('Failed to load conversation detail. Please try again.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [token]
  );

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
        setError('Failed to load conversations');
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

  const entityColors: Record<string, string> = {
    User: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    Preference: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
    Location: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    Event: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    Object: 'bg-pink-500/10 text-pink-500 border-pink-500/30',
    Topic: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
    Organization: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    Document: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  };

  // Extract scores from selected conversation
  const scores = useMemo(() => {
    if (!selected?.scores) {
      return null;
    }
    return {
      fluency: (selected.scores.fluency as number) || 0,
      accuracy: (selected.scores.accuracy as number) || 0,
      comprehensibility: (selected.scores.comprehensibility as number) || 0,
    };
  }, [selected]);

  const averageScore = scores ? Math.round((scores.fluency + scores.accuracy + scores.comprehensibility) / 3) : 0;
  const extractedInfo = (selected?.extractedInfo as Array<{ label: string; value: string }>) || [];

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
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      {/* Left: Conversation List */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
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
            const convScores = conversation.scores as {
              fluency: number;
              accuracy: number;
              comprehensibility: number;
            } | null;
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
                    <p className="font-semibold text-sm truncate">{conversation.title || 'Conversation'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(conversation.startedAt)}</p>
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
              {totalConversations} {totalConversations === 1 ? 'conversation' : 'conversations'}
              {totalPages > 1 && ` • Page ${page + 1} of ${totalPages}`}
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
            {/* Header */}
            <div>
              <h2 className="text-xl font-semibold">{selected.title || 'Conversation'}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
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
              </div>
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
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                        style={{
                          left: `${getIndicatorPosition(scores.fluency)}%`,
                          transform: 'translate(-50%, -50%)',
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
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                        style={{
                          left: `${getIndicatorPosition(scores.accuracy)}%`,
                          transform: 'translate(-50%, -50%)',
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
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-400 rounded-full"
                        style={{
                          left: `${getIndicatorPosition(scores.comprehensibility)}%`,
                          transform: 'translate(-50%, -50%)',
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
                    <div className="size-10 rounded-full overflow-hidden bg-card/80 border border-border/50">
                      <img src="/glass-ai.png" alt="Glass AI" className="w-full h-full object-cover" />
                    </div>
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
            {extractedInfo.length > 0 && (
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
                    <span className="text-xs text-muted-foreground">({extractedInfo.length})</span>
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
                        {extractedInfo.map((info, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 p-2 rounded-lg bg-background/50 border border-border/20"
                          >
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 border',
                                entityColors[info.label] || 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                              )}
                            >
                              {info.label}
                            </span>
                            <div className="flex-1 min-w-0 text-sm break-words">{info.value}</div>
                          </div>
                        ))}
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
                    <div className="mt-2 bg-background/50 border border-border/30 rounded-lg p-3 max-h-96 overflow-auto space-y-3">
                      {selected.messages && selected.messages.length > 0 ? (
                        selected.messages.map((message, idx) => {
                          const payload = message as Record<string, unknown>;
                          const speaker = (payload.speaker as string) || (payload.source as string) || 'speaker';
                          const text = (payload.text as string) || '';
                          const translation = payload.translation as string | undefined;
                          const isUser = speaker === 'user' || speaker === 'mic';
                          const displayName = isUser ? <Trans>You</Trans> : <Trans>Partner</Trans>;

                          return (
                            <div key={`${selected.id}-${idx}`} className="space-y-1.5">
                              <div className={cn('pb-2', isUser && 'flex flex-col items-end')}>
                                <div className="text-xs text-muted-foreground mb-0.5">{displayName}</div>
                                <div
                                  className={cn(
                                    'text-sm',
                                    isUser ? 'bg-primary/10 rounded-lg px-3 py-2 max-w-[80%]' : ''
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
    </div>
  );
}
