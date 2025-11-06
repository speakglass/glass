'use client';
import Messages from './Messages';
import Controls from './Controls';
import StartCall from './StartCall';
import CallSummary from './CallSummary';
import { ComponentRef, useRef } from 'react';
import { useGlass } from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export default function Chat() {
  const timeout = useRef<number | null>(null);
  const ref = useRef<ComponentRef<typeof Messages> | null>(null);
  const { status, conversationAnalysis, showSummary, closeSummary, startNewCallWithContext } = useGlass();

  return (
    <div className={'relative grow flex flex-col mx-auto w-full overflow-hidden h-0'}>
      <Messages ref={ref} />
      <Controls />
      <StartCall />

      {/* Analyzing Loading Screen */}
      <AnimatePresence>
        {status.value === 'analyzing' && !showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={'fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-md'}
          >
            <div className={'flex flex-col items-center gap-6'}>
              <div className={'relative'}>
                <div className={'absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse'}></div>
                <Loader2 className={'size-16 text-primary animate-spin relative'} />
              </div>
              <div className={'text-center space-y-2'}>
                <h3 className={'text-2xl font-semibold'}>Analyzing Conversation</h3>
                <p className={'text-sm text-muted-foreground'}>Generating insights and feedback...</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Summary */}
      <AnimatePresence>
        {showSummary && conversationAnalysis && (
          <CallSummary
            sessionId={conversationAnalysis.sessionId}
            scores={conversationAnalysis.scores}
            extractedInfo={conversationAnalysis.extractedInfo}
            feedback={conversationAnalysis.feedback}
            messages={conversationAnalysis.messages}
            feedbackItems={conversationAnalysis.feedbackItems}
            onClose={closeSummary}
            onStartNewCall={startNewCallWithContext}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
