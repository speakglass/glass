import { useState, useRef, useEffect, useCallback } from 'react';
import { Trans } from '@lingui/react/macro';
import { motion } from 'motion/react';
import { cn } from '@/utils';
import { ConversationPartner } from '@/lib/account-api';
import { PartnerAvatar } from '@/components/partner-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, UserRound } from 'lucide-react';

interface PartnerSelectionProps {
  glassMode: boolean;
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
}

export function PartnerSelection({
  glassMode,
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
}: PartnerSelectionProps) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn('flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5', isStartingCall && 'pointer-events-none')}
    >
      <div className={'text-center'}>
        <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
          <Trans>Choose who to call</Trans>
        </h2>
        <p className={`${getTextClass('body')} text-sm`}>
          <Trans>Select a conversation partner</Trans>
        </p>
      </div>
      <div className="relative w-full max-w-md mx-auto" ref={partnerListWrapperRef}>
        {hoveredPartner?.avatarUrl && hoveredPartnerPreviewTop !== null && (
          <div
            className="hidden sm:block absolute -left-44 -translate-y-1/2 w-40 h-40 rounded-[36px] overflow-hidden shadow-2xl border pointer-events-none transition-all duration-200 opacity-100 translate-x-0 z-0"
            style={{ top: hoveredPartnerPreviewTop }}
          >
            <img src={hoveredPartner.avatarUrl} alt={hoveredPartner.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div ref={partnerListRef} className="flex flex-col gap-2 w-full max-h-[60vh] overflow-y-auto pb-4 sm:pb-5 pr-1 sm:pr-2">
          {partnersLoading ? (
            <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
              <Trans>Loading partners...</Trans>
            </div>
          ) : roleplayPartners.length === 0 ? (
            <div className={`${getTextClass('muted')} text-sm text-center py-4`}>
              <Trans>No partners available</Trans>
            </div>
          ) : (
            <div className="-mx-1.5 space-y-2">
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
                      if (partner.avatarUrl && partnerListWrapperRef.current) {
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
                      selectedPartnerId === partner.id &&
                        (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent/50 border-foreground/30')
                    )}
                  >
                    <div className="relative flex items-center gap-3">
                      <PartnerAvatar
                        className={cn(
                          'h-12 w-12 flex-shrink-0',
                          glassMode ? 'border-white/30 bg-white/10 text-white/80 shadow-none' : 'bg-muted text-foreground/80'
                        )}
                        fallbackClassName={glassMode ? 'bg-transparent text-white/80' : undefined}
                        fallbackSize="md"
                        name={partner.name}
                        src={partner.avatarUrl || undefined}
                        alt={partner.name}
                      />
                      <div className={'flex-1 min-w-0 flex items-start gap-2'}>
                        <div className="flex-1 min-w-0">
                          <div className={`${getTextClass('title')} font-medium text-base mb-0.5`}>{partner.name}</div>
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
                </div>
              ))}
            </div>
          )}

          <div className="-mx-1.5">
            <div className="px-1.5">
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
                      glassMode ? 'border-white/30 bg-white/5 text-white/80' : 'border-border bg-muted text-muted-foreground'
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
        </div>
        {showGradient && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/90 via-card/70 to-transparent" />
        )}
      </div>
    </motion.div>
  );
}
