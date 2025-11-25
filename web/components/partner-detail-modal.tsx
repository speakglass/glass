import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConversationPartner } from '@/lib/account-api';
import { PartnerAvatar } from '@/components/partner-avatar';
import { Badge } from '@/components/ui/badge';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
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

function GenderIcon({
  gender,
  className,
}: {
  gender: string;
  className?: string;
}) {
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

export function PartnerDetailModal({
  open,
  onClose,
  partner,
  onStartChat,
}: PartnerDetailModalProps) {
  const locale = useLocale();

  if (!partner) return null;

  const genderLabels = {
    male: t`Male`,
    female: t`Female`,
    'non-binary': t`Non-binary`,
    other: t`Other`,
  };

  const relationshipTypeLabels = {
    new_friends: t`New friends`,
    someone_special: t`Someone special`,
    professional: t`Professional practice`,
    figuring_out: t`Still figuring it out`,
  };
  const occupationLabel =
    partner.personaOccupationTranslation || partner.personaOccupation;
  const cityLabel = partner.personaCityTranslation || partner.personaCity;
  const countryLabel =
    partner.personaCountryTranslation || partner.personaCountry;
  const locationLabel = [cityLabel, countryLabel].filter(Boolean).join(', ');

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[calc(85dvh-2rem)] overflow-y-auto p-4 sm:p-6 sm:max-w-[440px]">
        <DialogHeader className="pb-1 text-left">
          <DialogTitle className="text-base sm:text-lg">
            <Trans>Partner Details</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col">
          <div className="space-y-4">
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
              <h3 className="text-2xl font-bold flex items-center gap-1.5 sm:text-3xl sm:gap-2">
                {partner.name}
                {partner.personaAge && (
                  <span className="text-xl font-normal sm:text-2xl">
                    {partner.personaAge}
                  </span>
                )}
                <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 sm:h-6 sm:w-6">
                  <svg
                    className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4"
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
              <div className="text-xs text-muted-foreground space-y-0.5 sm:text-sm">
                {(partner.nativeLang || partner.learningLang) && (
                  <div className="flex items-center gap-1.5">
                    <Languages className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>
                      {getLanguageName(partner.nativeLang, locale)} →{' '}
                      {getLanguageName(partner.learningLang, locale)}
                    </span>
                  </div>
                )}
                {partner.personaGender && (
                  <div className="flex items-center gap-1.5">
                    <GenderIcon
                      gender={partner.personaGender}
                      className="h-3 w-3 sm:h-3.5 sm:w-3.5"
                    />
                    <span>
                      {genderLabels[
                        partner.personaGender as keyof typeof genderLabels
                      ] || partner.personaGender}
                    </span>
                  </div>
                )}
                {occupationLabel && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="capitalize">{occupationLabel}</span>
                  </div>
                )}
                {locationLabel && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>{locationLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Looking for */}
            {partner.personaRelationship && (
              <div className="bg-muted/80 rounded-lg px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs flex items-center gap-1.5 sm:text-sm sm:gap-2">
                  <span className="text-sm sm:text-base">😊</span>
                  <span className="font-medium">
                    <Trans>Looking for</Trans>
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 sm:text-sm">
                  {relationshipTypeLabels[
                    partner.personaRelationship as keyof typeof relationshipTypeLabels
                  ] || partner.personaRelationship}
                </p>
              </div>
            )}

            {/* About Me */}
            <div className="space-y-2 sm:space-y-3">
              <h4 className="text-base font-semibold sm:text-lg">
                <Trans>About Me</Trans>
              </h4>
              {(partner.descriptionTranslation || partner.description) && (
                <p className="text-xs text-foreground leading-relaxed sm:text-sm">
                  {partner.descriptionTranslation || partner.description}
                </p>
              )}
              {(partner.personaBackgroundTranslation ||
                partner.personaBackground) && (
                <p className="text-xs text-muted-foreground leading-relaxed sm:text-sm">
                  {partner.personaBackgroundTranslation ||
                    partner.personaBackground}
                </p>
              )}
              {(partner.personaInterestsTranslation ||
                partner.personaInterests) && (
                <div className="flex flex-wrap gap-2">
                  {(
                    partner.personaInterestsTranslation ||
                    partner.personaInterests ||
                    ''
                  )
                    .split(',')
                    .map((interest, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-xs capitalize"
                      >
                        {interest.trim()}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons - fixed at bottom */}
          <div className="flex gap-2 border-t py-4 bg-background sticky -bottom-[16px] sm:-bottom-[24px]">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 cursor-pointer"
            >
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
