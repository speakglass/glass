import { useState, useRef, useEffect, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import { motion } from 'motion/react';
import { cn } from '@/utils';
import { ConversationPartner, type PartnerGenerationJob, type PartnerGenerationStatus } from '@/lib/account-api';
import { PartnerAvatar } from '@/components/partner-avatar';
import { getLanguageName } from '@/lib/conversation-display';
import { useLocale } from '@/hooks/use-locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  Search,
  ArrowRight,
  Briefcase,
  MapPin,
  Phone,
  Languages,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { t } from '@lingui/core/macro';

const GENERATION_STATUS_MESSAGES: Record<PartnerGenerationStatus, string> = {
  queued: t`We're matching you with someone promising...`,
  generating_persona: t`Meeting potential AI partners...`,
  selecting_voice: t`Your partner is fine-tuning their voice...`,
  saving_partner: t`Your partner is polishing their profile...`,
  generating_avatar: t`Your partner is picking a friendly photo...`,
  completed: t`Ready to say hi!`,
  failed: t`We couldn't find the right match.`,
};

interface PartnerSelectionProps {
  roleplayPartners: ConversationPartner[];
  partnersLoading: boolean;
  selectedPartnerId: string;
  onSelectPartner: (id: string) => void;
  getCardClass: () => string;
  getTextClass: (type: 'title' | 'body' | 'muted') => string;
  openCreatePartnerModal: () => void;
  openEditPartnerModal: (partner: ConversationPartner) => void;
  openDeletePartnerDialog: (partner: ConversationPartner) => void;
  isStartingCall: boolean;
  onSwitchToLiveMode?: () => void;
  partnerLimitBlocked: boolean;
  onPartnerLimitBlocked?: () => void;
  generationJob?: PartnerGenerationJob | null;
  onDismissGenerationJob?: () => void;
}

export function PartnerSelection({
  roleplayPartners,
  partnersLoading,
  selectedPartnerId,
  onSelectPartner,
  getCardClass,
  getTextClass,
  openCreatePartnerModal,
  openEditPartnerModal,
  openDeletePartnerDialog,
  isStartingCall,
  onSwitchToLiveMode,
  partnerLimitBlocked = false,
  onPartnerLimitBlocked,
  generationJob,
  onDismissGenerationJob,
}: PartnerSelectionProps) {
  const locale = useLocale();
  const [hoveredPartner, setHoveredPartner] = useState<ConversationPartner | null>(null);
  const [hoveredPartnerPreviewTop, setHoveredPartnerPreviewTop] = useState<number | null>(null);
  const partnerListWrapperRef = useRef<HTMLDivElement | null>(null);
  const partnerListRef = useRef<HTMLDivElement | null>(null);
  const [showGradient, setShowGradient] = useState(false);

  const updateGradient = useCallback(() => {
    const el = partnerListRef.current;
    if (!el) {
      setShowGradient(false);
      return;
    }
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (!canScroll) {
      setShowGradient(false);
      return;
    }
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    setShowGradient(!atBottom);
  }, []);

  useEffect(() => {
    const node = partnerListRef.current;
    if (!node) {
      setShowGradient(false);
      return;
    }
    updateGradient();
    const handleScroll = () => updateGradient();
    node.addEventListener('scroll', handleScroll);
    return () => node.removeEventListener('scroll', handleScroll);
  }, [roleplayPartners.length, partnersLoading, updateGradient]);

  const handleCreatePartnerClick = useCallback(() => {
    if (partnerLimitBlocked) {
      onPartnerLimitBlocked?.();
      return;
    }
    openCreatePartnerModal();
  }, [partnerLimitBlocked, onPartnerLimitBlocked, openCreatePartnerModal]);

  const hoveredOccupation = hoveredPartner?.personaOccupationTranslation || hoveredPartner?.personaOccupation || '';
  const hoveredCity = hoveredPartner?.personaCityTranslation || hoveredPartner?.personaCity || '';
  const hoveredCountry = hoveredPartner?.personaCountryTranslation || hoveredPartner?.personaCountry || '';
  const hoveredLocation = [hoveredCity, hoveredCountry].filter(Boolean).join(', ');
  const generationStatusCopy =
    generationJob && (generationJob.message || GENERATION_STATUS_MESSAGES[generationJob.status]);
  const isGenerationJobFailed = generationJob?.status === 'failed';
  const generationPreviewPartner = generationJob?.partner;
  const generationPreviewPersona = generationJob?.personaPreview;
  const generationPreviewName = generationPreviewPartner?.name || generationPreviewPersona?.name || '';
  const generationPreviewLocation =
    generationPreviewPartner || generationPreviewPersona
      ? [
          generationPreviewPartner?.personaCity ||
            generationPreviewPersona?.personaCityTranslation ||
            generationPreviewPersona?.personaCity,
          generationPreviewPartner?.personaCountry ||
            generationPreviewPersona?.personaCountryTranslation ||
            generationPreviewPersona?.personaCountry,
        ]
          .filter(Boolean)
          .join(', ')
      : '';
  const generationPreviewSummary =
    generationPreviewPartner?.descriptionTranslation ||
    generationPreviewPartner?.description ||
    generationPreviewPersona?.summaryTranslation ||
    generationPreviewPersona?.summary ||
    '';
  const hasGenerationPreview = generationPreviewName || generationPreviewLocation || generationPreviewSummary;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'flex w-full flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5',
        isStartingCall && 'pointer-events-none'
      )}
    >
      <div className={'text-center'}>
        <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
          <Trans>Find a language exchange partner</Trans>
        </h2>
        <p className={`${getTextClass('body')} text-sm`}>
          <Trans>Choose someone to practice with</Trans>
        </p>
      </div>
      <div className="relative w-full max-w-[448px] mx-auto" ref={partnerListWrapperRef}>
        {hoveredPartner && hoveredPartnerPreviewTop !== null && (
          <div
            className="hidden sm:block absolute -left-48 -translate-y-1/2 w-44 pointer-events-none transition-all duration-200 opacity-100 translate-x-0 z-0"
            style={{ top: hoveredPartnerPreviewTop }}
          >
            <div className="w-full aspect-square rounded-[36px] overflow-hidden border">
              {hoveredPartner.avatarUrl ? (
                <img src={hoveredPartner.avatarUrl} alt={hoveredPartner.name} className="w-full h-full object-cover" />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 border border-dashed border-primary/40 bg-gradient-to-br from-muted/70 via-card/80 to-muted/40 animate-pulse">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  <span className="text-[11px] font-medium text-primary/85">
                    <Trans>Creating photo…</Trans>
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1.5 px-1">
              <h4 className={`${getTextClass('title')} font-semibold text-sm truncate`}>{hoveredPartner.name}</h4>
              <div className={`${getTextClass('muted')} text-xs space-y-0.5`}>
                {(hoveredPartner.nativeLang || hoveredPartner.learningLang) && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Languages className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {getLanguageName(hoveredPartner.nativeLang, locale)} →{' '}
                      {getLanguageName(hoveredPartner.learningLang, locale)}
                    </span>
                  </div>
                )}
                {hoveredOccupation && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Briefcase className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{hoveredOccupation}</span>
                  </div>
                )}
                {hoveredLocation && (
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{hoveredLocation}</span>
                  </div>
                )}
                {hoveredPartner.conversationCount !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <span>
                      {hoveredPartner.conversationCount}
                      {hoveredPartner.conversationCount === 1 ? <Trans>call</Trans> : <Trans>calls</Trans>}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div
          ref={partnerListRef}
          className="flex flex-col w-full max-h-[60vh] overflow-y-auto pb-4 sm:pb-5"
          style={{ scrollbarGutter: 'stable' }}
        >
          {generationJob && (
            <div className="-mx-1.5 mb-2">
              <div className="px-1.5">
                <div
                  onMouseEnter={(event) => {
                    if (generationPreviewPartner) {
                      setHoveredPartner(generationPreviewPartner);
                      if (partnerListWrapperRef.current) {
                        const wrapperRect = partnerListWrapperRef.current.getBoundingClientRect();
                        const cardRect = event.currentTarget.getBoundingClientRect();
                        setHoveredPartnerPreviewTop(cardRect.top - wrapperRect.top + cardRect.height / 2);
                      } else {
                        setHoveredPartnerPreviewTop(null);
                      }
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredPartner(null);
                    setHoveredPartnerPreviewTop(null);
                  }}
                  className={cn(
                    'group relative px-4 py-3 rounded-xl transition-all cursor-default outline-none',
                    getCardClass(),
                    isGenerationJobFailed ? 'border-destructive/40 bg-destructive/5' : 'bg-accent/30 border-primary/20'
                  )}
                >
                  <div className="relative flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0">
                      {generationPreviewPartner?.avatarUrl ? (
                        <PartnerAvatar
                          className="h-12 w-12 bg-muted text-foreground/80"
                          fallbackSize="md"
                          name={generationPreviewName}
                          src={generationPreviewPartner.avatarUrl}
                          alt={generationPreviewName}
                        />
                      ) : (
                        <div className="h-full w-full rounded-full border border-dashed border-primary/40 bg-linear-to-br from-muted/70 via-card/80 to-muted/40 animate-pulse flex items-center justify-center">
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className={'flex-1 min-w-0 flex items-start gap-2'}>
                      <div className="flex-1 min-w-0">
                        <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>
                          {generationPreviewName || <Trans>Finding AI partner</Trans>}
                        </div>
                        <div className={`${getTextClass('muted')} text-xs truncate`}>
                          {isGenerationJobFailed
                            ? generationJob.error || t`Unable to create partner`
                            : generationStatusCopy || t`Creating your partner...`}
                        </div>
                      </div>
                      {onDismissGenerationJob && (
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
                                onDismissGenerationJob();
                              }}
                            >
                              <Trans>Dismiss</Trans>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!onDismissGenerationJob && (
                        <button
                          type="button"
                          disabled
                          className="invisible rounded-lg p-1.5 border border-border/0 bg-muted/60"
                          aria-label="Partner actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {isGenerationJobFailed && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <Button size="sm" disabled={partnerLimitBlocked} onClick={handleCreatePartnerClick}>
                        <Trans>Try again</Trans>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {partnersLoading ? (
            <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
              <Trans>Loading partners...</Trans>
            </div>
          ) : roleplayPartners.length > 0 ? (
            <div className="-mx-1.5 space-y-2 mb-2">
              {roleplayPartners.map((partner) => (
                <div key={partner.id} className="px-1.5">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectPartner(partner.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectPartner(partner.id);
                      }
                    }}
                    onMouseEnter={(event) => {
                      setHoveredPartner(partner);
                      if (partnerListWrapperRef.current) {
                        const wrapperRect = partnerListWrapperRef.current.getBoundingClientRect();
                        const cardRect = event.currentTarget.getBoundingClientRect();
                        setHoveredPartnerPreviewTop(cardRect.top - wrapperRect.top + cardRect.height / 2);
                      } else {
                        setHoveredPartnerPreviewTop(null);
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredPartner(null);
                      setHoveredPartnerPreviewTop(null);
                    }}
                    className={cn(
                      'group relative px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 text-left',
                      getCardClass(),
                      'hover:z-20 focus-visible:z-20',
                      selectedPartnerId === partner.id && 'bg-accent/50 border-foreground/30'
                    )}
                  >
                    <div className="relative flex items-center gap-3">
                      <div className="relative h-12 w-12 flex-shrink-0">
                        {partner.avatarUrl ? (
                          <PartnerAvatar
                            className="h-12 w-12 bg-muted text-foreground/80"
                            fallbackSize="md"
                            name={partner.name}
                            src={partner.avatarUrl || undefined}
                            alt={partner.name}
                          />
                        ) : (
                          <div className="h-full w-full rounded-full border border-dashed border-primary/40 bg-gradient-to-br from-muted/70 via-card/80 to-muted/40 animate-pulse flex items-center justify-center">
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className={'flex-1 min-w-0 flex items-start gap-2'}>
                        <div className="flex-1 min-w-0">
                          <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>{partner.name}</div>
                          <div className={`${getTextClass('muted')} text-xs truncate`}>
                            {partner.descriptionTranslation || partner.description}
                          </div>
                        </div>
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
                              <Trans>View profile</Trans>
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
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="-mx-1.5 space-y-2">
            <div className="px-1.5">
              <button
                onClick={handleCreatePartnerClick}
                className={cn(
                  'w-full px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left border',
                  roleplayPartners.length === 0
                    ? 'border-emerald-500/40 hover:border-emerald-500/60 bg-emerald-50/60 hover:bg-emerald-50'
                    : 'border-border hover:border-primary/40 bg-muted/30 border-dashed'
                )}
              >
                <div className={'flex items-center gap-3 justify-between min-w-0'}>
                  <div className={'flex items-center gap-3 min-w-0'}>
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        roleplayPartners.length === 0
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-gradient-to-br from-primary/10 to-primary/5 text-primary'
                      )}
                    >
                      <Search className="w-6 h-6" strokeWidth={1.75} />
                    </div>
                    <div className={'flex-1 min-w-0'}>
                      <div
                        className={cn(
                          'font-medium text-base mb-0.5 truncate',
                          roleplayPartners.length === 0 ? 'text-emerald-900 font-semibold' : getTextClass('title')
                        )}
                      >
                        {roleplayPartners.length === 0 ? (
                          <Trans>Discover your first AI partner</Trans>
                        ) : (
                          <Trans>Discover more AI partners</Trans>
                        )}
                      </div>
                      <div
                        className={cn(
                          'text-xs truncate',
                          roleplayPartners.length === 0 ? 'text-emerald-700' : getTextClass('muted')
                        )}
                      >
                        <Trans>Create your ideal language partner</Trans>
                      </div>
                    </div>
                  </div>
                  <ArrowRight
                    className={cn(
                      'w-5 h-5 flex-shrink-0',
                      roleplayPartners.length === 0 ? 'text-emerald-600' : getTextClass('muted')
                    )}
                  />
                </div>
              </button>
            </div>

            {onSwitchToLiveMode && (
              <>
                <div className="px-1.5 py-2 flex items-center gap-3">
                  <div className={cn('flex-1 h-px', 'bg-border')} />
                  <span className={cn('text-xs font-medium', getTextClass('muted'))}>
                    <Trans>OR</Trans>
                  </span>
                  <div className={cn('flex-1 h-px', 'bg-border')} />
                </div>
                <div className="px-1.5">
                  <button
                    onClick={onSwitchToLiveMode}
                    className={cn(
                      'w-full px-4 py-3 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left border border-dashed',
                      'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    )}
                  >
                    <div className={'flex items-center gap-3 justify-between min-w-0'}>
                      <div className={'flex items-center gap-3 min-w-0'}>
                        <div
                          className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center',
                            'bg-muted text-muted-foreground'
                          )}
                        >
                          <svg
                            className="w-6 h-6"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                          </svg>
                        </div>
                        <div className={'flex-1 min-w-0'}>
                          <div className={`${getTextClass('title')} font-medium text-base mb-0.5 truncate`}>
                            <Trans>Use during real conversations</Trans>
                          </div>
                          <div className={`${getTextClass('muted')} text-xs truncate`}>
                            <Trans>Get live support during real calls or language exchange</Trans>
                          </div>
                        </div>
                      </div>
                      <ArrowRight className={cn('w-5 h-5 flex-shrink-0', getTextClass('muted'))} />
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {showGradient && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/90 via-card/70 to-transparent" />
        )}
      </div>
    </motion.div>
  );
}
