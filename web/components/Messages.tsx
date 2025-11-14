'use client';
import { cn } from '@/utils';
import { useGlass, Message } from '@/contexts/glass-context';
import { AnimatePresence, motion } from 'motion/react';
import { ComponentRef, forwardRef, useState, useEffect, useCallback, useRef } from 'react';
import { Trans } from '@lingui/react/macro';

type MockMessage = {
  role: 'you' | 'other';
  text: string;
  translation?: string;
};

type MessagesProps = {
  mockMessages?: MockMessage[];
};

const Messages = forwardRef<ComponentRef<typeof motion.div>, MessagesProps>(function Messages({ mockMessages }, ref) {
  const voice = useGlass();
  const { messages } = voice;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isMockMode = !!mockMessages;
  const displayMessages = isMockMode ? mockMessages : messages;
  const lastMessageCountRef = useRef(displayMessages.length);

  // Check if user is near the bottom of the scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    const threshold = 150; // pixels from bottom to consider "near bottom"
    const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsNearBottom(isNear);
    return isNear;
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

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

  // Auto-scroll when new messages arrive (only if user is near bottom)
  useEffect(() => {
    const currentMessageCount = displayMessages.length;
    const hadNewMessage = currentMessageCount > lastMessageCountRef.current;

    if (hadNewMessage && isNearBottom) {
      // Small delay to allow DOM to update
      setTimeout(() => {
        scrollToBottom('smooth');
      }, 100);
    }

    lastMessageCountRef.current = currentMessageCount;
  }, [displayMessages.length, isNearBottom, scrollToBottom]);

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
      className={'grow overflow-auto px-4 pt-4 pb-4'}
      ref={scrollContainerRef}
    >
      <motion.div id="glass-messages-content" className={'max-w-2xl mx-auto w-full flex flex-col pb-24'}>
        {/* Messages */}
        <div id="glass-messages-cards" className={'flex flex-col gap-4'}>
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
                    <div className={'flex items-center justify-between pt-4 px-3'}>
                      <div className={'text-xs capitalize font-medium leading-none opacity-50 tracking-tight'}>
                        {msg.role === 'you' ? <Trans>You</Trans> : <Trans>Partner</Trans>}
                      </div>
                    </div>
                    <div className={'pb-3 px-3 space-y-2'}>
                      <span className={'text-sm sm:text-base'}>{msg.text}</span>
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
                    if (msg.type === 'user_message' || msg.type === 'partner_message') {
                      return (
                        <motion.div
                          key={msg.utteranceId ?? `${msg.type}-${msg.message.role}-${msg.receivedAt.getTime()}`}
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
                          <div className={'flex items-center justify-between pt-4 px-3'}>
                            <div
                              className={cn('text-xs capitalize font-medium leading-none opacity-50 tracking-tight')}
                            >
                              {msg.message.role === 'user' ? <Trans>You</Trans> : <Trans>Partner</Trans>}
                            </div>
                            <div
                              className={cn('text-xs capitalize font-medium leading-none opacity-50 tracking-tight')}
                            >
                              {msg.receivedAt.toLocaleTimeString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                                second: undefined,
                              })}
                            </div>
                          </div>
                          <div className={'pb-3 px-3 space-y-2'}>
                            {/* Committed content + ephemeral partial (no animation) */}
                            <span className={'text-sm sm:text-base'}>
                              {msg.partial
                                ? `${msg.message.content ? msg.message.content + ' ' : ''}${msg.partial}`
                                : msg.message.content}
                            </span>
                            {msg.translation && (
                              <div className={'text-sm opacity-70 pt-1'}>
                                <span>{msg.translation}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    }

                    return null;
                  })}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
});

export default Messages;
