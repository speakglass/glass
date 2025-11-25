'use client';

import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';

import { PartnerAvatar } from '@/components/partner-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ConversationMessage } from '@/lib/account-api';
import { getMessageRole } from '@/lib/conversation-utils';
import { cn } from '@/utils';

type ParticipantInfo = {
  name?: string | null;
  avatarUrl?: string | null;
};

type MessageContext = {
  isUser: boolean;
  isGlass: boolean;
};

interface ConversationMessagesListProps {
  messages?: ConversationMessage[];
  resolveParticipantInfo: (message: ConversationMessage) => ParticipantInfo;
  className?: string;
  emptyStateClassName?: string;
  renderMessageFooter?: (
    message: ConversationMessage,
    context: MessageContext
  ) => ReactNode;
  getMessageKey?: (
    message: ConversationMessage,
    index: number
  ) => string | number;
}

export const ConversationMessagesList = ({
  messages = [],
  resolveParticipantInfo,
  className,
  emptyStateClassName,
  renderMessageFooter,
  getMessageKey,
}: ConversationMessagesListProps) => {
  if (!messages || messages.length === 0) {
    return (
      <div
        className={cn(
          'text-center py-4 text-sm text-muted-foreground',
          emptyStateClassName
        )}
      >
        <Trans>No messages</Trans>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {messages.map((message, index) => {
        const speakerRole = getMessageRole(message);
        const text = message.text || '';
        const translation = message.translation || undefined;
        const isUser = speakerRole === 'user';
        const isGlass = speakerRole === 'assistant';
        const speakerInfo = resolveParticipantInfo(message);
        const speakerName = speakerInfo?.name;
        const avatarUrl = speakerInfo?.avatarUrl;
        const defaultKey =
          message.utterance_id !== undefined &&
          message.utterance_id !== null &&
          message.utterance_id !== ''
            ? `utt:${message.utterance_id}-${index}`
            : typeof message.id === 'number'
            ? `msg:${message.id}-${index}`
            : index;
        const key = getMessageKey ? getMessageKey(message, index) : defaultKey;

        return (
          <div
            key={key}
            className={cn(
              'flex gap-3 py-2',
              (isUser || isGlass) && 'flex-row-reverse text-right'
            )}
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
                  'rounded-2xl px-3 py-2 text-sm leading-[1.3] sm:leading-normal',
                  isUser
                    ? 'bg-primary/10 ml-auto'
                    : isGlass
                    ? 'bg-emerald-500/10 text-emerald-900 ml-auto'
                    : 'bg-muted/70'
                )}
              >
                {text}
                {translation && (
                  <div className="text-xs text-muted-foreground mt-1 italic">
                    {translation}
                  </div>
                )}
              </div>
              {renderMessageFooter
                ? renderMessageFooter(message, { isUser, isGlass })
                : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
