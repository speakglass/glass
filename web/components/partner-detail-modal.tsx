import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConversationPartner } from '@/lib/account-api';
import { PartnerAvatar } from '@/components/partner-avatar';
import { Badge } from '@/components/ui/badge';
import { Trans } from '@lingui/react/macro';
import { Briefcase, MapPin, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLanguageName } from '@/lib/conversation-display';
import { useLocale } from '@/hooks/use-locale';

interface PartnerDetailModalProps {
  open: boolean;
  onClose: () => void;
  partner: ConversationPartner | null;
  onStartChat?: (partnerId: string) => void;
}

function GenderIcon({ gender, className }: { gender: string; className?: string }) {
  const iconClass = className || 'h-3.5 w-3.5';

  if (gender === 'male') {
    return (
      <svg
        className={iconClass}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10" cy="14" r="6" />
        <line x1="14.5" y1="9.5" x2="20" y2="4" />
        <line x1="20" y1="4" x2="20" y2="8" />
        <line x1="20" y1="4" x2="16" y2="4" />
      </svg>
    );
  }

  if (gender === 'female') {
    return (
      <svg
        className={iconClass}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="9" r="6" />
        <line x1="12" y1="15" x2="12" y2="21" />
        <line x1="9" y1="18" x2="15" y2="18" />
      </svg>
    );
  }

  // non-binary or other
  return (
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="6" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="2" y1="12" x2="6" y2="12" />
    </svg>
  );
}

export function PartnerDetailModal({ open, onClose, partner, onStartChat }: PartnerDetailModalProps) {
  const locale = useLocale();

  if (!partner) return null;

  const relationshipTypeLabels = {
    friendly: 'Friendly',
    professional: 'Professional',
    romantic: 'Romantic',
  } as const;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-lg">
            <Trans>Partner Details</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col max-h-[600px]">
          <div className="overflow-y-auto space-y-4">
            {/* Avatar image - compact square */}
            <div className="relative w-full aspect-square overflow-hidden rounded-lg">
              <PartnerAvatar
                className="h-full w-full rounded-lg"
                fallbackSize="lg"
                name={partner.name}
                src={partner.avatarUrl || undefined}
              />
            </div>

            {/* Name and age with verified badge */}
            <div className="space-y-1">
              <h3 className="text-3xl font-bold flex items-center gap-2">
                {partner.name}
                {partner.personaAge && <span className="text-2xl font-normal">{partner.personaAge}</span>}
                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </h3>

              {/* Gender, profession, location */}
              <div className="text-sm text-muted-foreground space-y-0.5">
                {(partner.nativeLang || partner.learningLang) && (
                  <div className="flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5" />
                    <span>
                      {getLanguageName(partner.nativeLang, locale)} → {getLanguageName(partner.learningLang, locale)}
                    </span>
                  </div>
                )}
                {partner.personaGender && (
                  <div className="flex items-center gap-1.5">
                    <GenderIcon gender={partner.personaGender} />
                    <span className="capitalize">{partner.personaGender}</span>
                  </div>
                )}
                {partner.personaOccupation && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="capitalize">{partner.personaOccupation}</span>
                  </div>
                )}
                {(partner.personaCity || partner.personaCountry) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{[partner.personaCity, partner.personaCountry].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Looking for */}
            {partner.personaRelationship && (
              <div className="bg-muted/80 rounded-lg px-4 py-3">
                <p className="text-sm flex items-center gap-2">
                  <span className="text-base">😊</span>
                  <span className="font-medium">
                    <Trans>Looking for</Trans>
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-1 capitalize">
                  {relationshipTypeLabels[partner.personaRelationship as keyof typeof relationshipTypeLabels] ||
                    partner.personaRelationship}
                </p>
              </div>
            )}

            {/* About Me */}
            <div className="space-y-3">
              <h4 className="text-lg font-semibold">
                <Trans>About Me</Trans>
              </h4>
              {partner.description && <p className="text-sm text-foreground leading-relaxed">{partner.description}</p>}
              {partner.personaBackground && (
                <p className="text-sm text-muted-foreground leading-relaxed">{partner.personaBackground}</p>
              )}
              {partner.personaInterests && (
                <div className="flex flex-wrap gap-2">
                  {partner.personaInterests.split(',').map((interest, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs capitalize">
                      {interest.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons - fixed at bottom */}
          <div className="flex gap-2 border-t pt-4 mt-4">
            <Button variant="outline" onClick={onClose} className="flex-1 cursor-pointer">
              <Trans>Close</Trans>
            </Button>
            {onStartChat && (
              <Button
                onClick={() => {
                  onStartChat(partner.id);
                }}
                className="flex-1 cursor-pointer"
              >
                <Trans>Start chatting</Trans>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
