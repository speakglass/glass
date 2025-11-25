'use client';
import { cn } from '@/utils';
import { useGlass, Message } from '@/contexts/glass-context';
import { AnimatePresence, motion } from 'motion/react';
import {
  ComponentRef,
  forwardRef,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { Trans } from '@lingui/react/macro';
import { LiveHighlightedText } from '@/components/live-highlighted-text';

type MockMessage = {
  role: 'you' | 'other';
  text: string;
  translation?: string;
};

type MessagesProps = {
  mockMessages?: MockMessage[];
};

const Messages = forwardRef<ComponentRef<typeof motion.div>, MessagesProps>(
  function Messages({ mockMessages }, ref) {
    const voice = useGlass();
    const { messages, sessionMode, conversationPartner, ttsHighlight } = voice;
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const isMockMode = !!mockMessages;
    const displayMessages = isMockMode ? mockMessages : messages;
    const lastMessageCountRef = useRef(displayMessages.length);
    const lastMessagesHashRef = useRef<string>('');

    useEffect(() => {
      setAvatarFailed(false);
    }, [conversationPartner?.avatarUrl]);

    // Check if user is near the bottom of the scroll container
    const checkIfNearBottom = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return false;

      const threshold = 150; // pixels from bottom to consider "near bottom"
      const isNear =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        threshold;
      setIsNearBottom(isNear);
      return isNear;
    }, []);

    // Scroll to bottom function
    const scrollToBottom = useCallback(
      (behavior: ScrollBehavior = 'smooth') => {
        const container = scrollContainerRef.current;
        if (!container) return;

        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      },
      []
    );

    // Handle scroll events to track if user is near bottom
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const handleScroll = () => {
        checkIfNearBottom();
      };

      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }, [checkIfNearBottom]);

    // Auto-scroll when new messages arrive or translations are added (only if user is near bottom)
    useEffect(() => {
      const currentMessageCount = displayMessages.length;
      const hadNewMessage = currentMessageCount > lastMessageCountRef.current;

      // Create a hash of message contents to detect translation updates
      const messagesHash = displayMessages
        .map((msg) => {
          if (isMockMode) {
            const mockMsg = msg as MockMessage;
            return `${mockMsg.text || ''}-${mockMsg.translation || ''}`;
          } else {
            const realMsg = msg as Message;
            return `${realMsg.message?.content || ''}-${
              realMsg.translation || ''
            }-${realMsg.partial || ''}`;
          }
        })
        .join('|');

      const hadContentChange = messagesHash !== lastMessagesHashRef.current;

      if ((hadNewMessage || hadContentChange) && isNearBottom) {
        // Small delay to allow DOM to update
        setTimeout(() => {
          scrollToBottom('smooth');
        }, 100);
      }

      lastMessageCountRef.current = currentMessageCount;
      lastMessagesHashRef.current = messagesHash;
    }, [displayMessages, isNearBottom, scrollToBottom, isMockMode]);

    // Initial scroll to bottom on mount (skip in mock mode for onboarding)
    useEffect(() => {
      if (!isMockMode) {
        scrollToBottom('auto');
      }
    }, [scrollToBottom, isMockMode]);

    return (
      <motion.div
        id="glass-messages"
        layoutScroll
        className={'grow overflow-auto px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4'}
        ref={scrollContainerRef}
      >
        <motion.div
          id="glass-messages-content"
          className={'max-w-2xl mx-auto w-full flex flex-col'}
        >
          {/* Messages */}
          <div
            id="glass-messages-cards"
            className={'flex flex-col gap-3 sm:gap-4'}
          >
            <AnimatePresence mode={'popLayout'}>
              {isMockMode
                ? mockMessages!.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      className={cn(
                        'w-[80%]',
                        'bg-card',
                        'border border-border rounded-xl',
                        msg.role === 'you' ? 'ml-auto' : ''
                      )}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.2 }}
                    >
                      <div
                        className={
                          'flex items-center justify-between pt-3 px-2.5 sm:pt-4 sm:px-3'
                        }
                      >
                        <div
                          className={
                            'text-xs capitalize font-medium leading-none opacity-50 tracking-tight'
                          }
                        >
                          {msg.role === 'you' ? (
                            <Trans>You</Trans>
                          ) : (
                            <Trans>Partner</Trans>
                          )}
                        </div>
                      </div>
                      <div
                        className={
                          'pb-2.5 px-2.5 space-y-1.5 sm:pb-3 sm:px-3 sm:space-y-2'
                        }
                      >
                        <span className={'text-sm sm:text-base'}>
                          {msg.text}
                        </span>
                        {msg.translation && (
                          <div className={'text-sm opacity-70 pt-1'}>
                            <span>{msg.translation}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                : [...messages]
                    .sort((a, b) => {
                      // Sort by start time if available, otherwise by receivedAt
                      const startA = a.start ?? Number.MAX_SAFE_INTEGER;
                      const startB = b.start ?? Number.MAX_SAFE_INTEGER;
                      if (startA !== startB) return startA - startB;
                      return a.receivedAt.getTime() - b.receivedAt.getTime();
                    })
                    .map((msg: Message) => {
                      if (
                        msg.type !== 'user_message' &&
                        msg.type !== 'partner_message'
                      ) {
                        return null;
                      }

                      const isRoleplayPartnerMessage =
                        !isMockMode &&
                        sessionMode === 'roleplay' &&
                        msg.type === 'partner_message';

                      const partnerLabel: ReactNode =
                        msg.message.role === 'user' ? (
                          <Trans>You</Trans>
                        ) : isRoleplayPartnerMessage &&
                          conversationPartner?.name ? (
                          conversationPartner.name
                        ) : (
                          <Trans>Partner</Trans>
                        );

                      const timestamp = msg.receivedAt.toLocaleTimeString(
                        undefined,
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: undefined,
                        }
                      );

                      const messageHighlight =
                        ttsHighlight?.context === 'ai_message' &&
                        ttsHighlight.targetId === msg.utteranceId
                          ? ttsHighlight
                          : null;

                      const messageContent = (
                        <>
                          <div
                            className={
                              'flex items-center justify-between pt-3 px-2.5 sm:pt-4 sm:px-3'
                            }
                          >
                            <div
                              className={cn(
                                'text-xs capitalize font-medium leading-none opacity-50 tracking-tight'
                              )}
                            >
                              {partnerLabel}
                            </div>
                            <div
                              className={cn(
                                'text-xs capitalize font-medium leading-none opacity-50 tracking-tight'
                              )}
                            >
                              {timestamp}
                            </div>
                          </div>
                          <div
                            className={
                              'pb-2.5 px-2.5 space-y-1.5 sm:pb-3 sm:px-3 sm:space-y-2'
                            }
                          >
                            <span className={'text-sm sm:text-base'}>
                              <LiveHighlightedText
                                text={
                                  msg.partial
                                    ? `${
                                        msg.message.content
                                          ? msg.message.content + ' '
                                          : ''
                                      }${msg.partial}`
                                    : msg.message.content
                                }
                                highlight={messageHighlight}
                              />
                            </span>
                            {msg.translation && (
                              <div className={'text-sm opacity-70 pt-1'}>
                                <span>{msg.translation}</span>
                              </div>
                            )}
                          </div>
                        </>
                      );

                      if (isRoleplayPartnerMessage) {
                        const partnerName =
                          conversationPartner?.name || 'Partner';
                        const showImage =
                          conversationPartner?.avatarUrl && !avatarFailed;
                        const avatarNode = showImage ? (
                          <img
                            src={conversationPartner!.avatarUrl!}
                            alt={partnerName}
                            className={
                              'w-8 h-8 rounded-full object-cover border border-border/60 bg-muted sm:w-10 sm:h-10'
                            }
                            onError={() => setAvatarFailed(true)}
                          />
                        ) : (
                          <div
                            className={
                              'w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground sm:w-10 sm:h-10'
                            }
                          >
                            {partnerName.charAt(0).toUpperCase()}
                          </div>
                        );

                        return (
                          <motion.div
                            key={
                              msg.utteranceId ??
                              `${msg.type}-${
                                msg.message.role
                              }-${msg.receivedAt.getTime()}`
                            }
                            className={'flex items-start gap-2 sm:gap-3'}
                            initial={{
                              opacity: 0,
                              y: 10,
                            }}
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            exit={{
                              opacity: 0,
                              y: 0,
                            }}
                          >
                            <div className={'flex-shrink-0'}>{avatarNode}</div>
                            <div
                              className={cn(
                                'bg-card border border-border rounded-xl flex-1 max-w-[80%]'
                              )}
                            >
                              {messageContent}
                            </div>
                          </motion.div>
                        );
                      }

                      return (
                        <motion.div
                          key={
                            msg.utteranceId ??
                            `${msg.type}-${
                              msg.message.role
                            }-${msg.receivedAt.getTime()}`
                          }
                          className={cn(
                            'w-[80%]',
                            'bg-card',
                            'border border-border rounded-xl',
                            msg.type === 'user_message' ? 'ml-auto' : ''
                          )}
                          initial={{
                            opacity: 0,
                            y: 10,
                          }}
                          animate={{
                            opacity: 1,
                            y: 0,
                          }}
                          exit={{
                            opacity: 0,
                            y: 0,
                          }}
                        >
                          {messageContent}
                        </motion.div>
                      );
                    })}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    );
  }
);

export default Messages;
