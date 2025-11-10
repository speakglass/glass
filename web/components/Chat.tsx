'use client';
import Messages from './Messages';
import Controls from './Controls';
import StartCall from './StartCall';
import CallSummary from './CallSummary';
import BottomPanel from './BottomPanel';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { useGlass } from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import Progress from '@/components/ui/progress';

export default function Chat() {
  const ref = useRef<ComponentRef<typeof Messages> | null>(null);
  const { status, conversationAnalysis, showSummary, closeSummary, startNewCallWithContext } = useGlass();
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Fake analysis progress: reach ~95% at 6s, then inch subtly while waiting
  useEffect(() => {
    if (status.value === 'analyzing' && !showSummary) {
      setAnalysisProgress(0);
      const startedAt = Date.now();
      const id = setInterval(() => {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        let p = 0;
        if (elapsedSec <= 6) {
          const t = elapsedSec / 6; // 0..1
          // easeOutCubic towards 95
          p = 95 * (1 - Math.pow(1 - t, 3));
        } else {
          const over = elapsedSec - 6;
          // Slowly creep up to 97 max
          p = 95 + Math.min(2, over * 0.5);
          // Subtle breathing so it doesn't look frozen
          p += 0.5 * Math.sin(Date.now() / 800);
        }
        p = Math.max(0, Math.min(97, p));
        setAnalysisProgress(p);
      }, 120);
      return () => clearInterval(id);
    } else {
      setAnalysisProgress(0);
    }
  }, [status.value, showSummary]);

  return (
    <div className={'relative grow flex flex-col mx-auto w-full overflow-hidden h-0 pt-14 pb-28 sm:pb-0'}>
      <Messages ref={ref} />

      {/* BottomPanel: persistent suggestions + controls */}
      {status.value === 'connected' && <BottomPanel />}

      <Controls />
      <StartCall />

      {/* Analyzing Loading Screen */}
      <AnimatePresence>
        {status.value === 'analyzing' && !showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={'fixed inset-0 z-100 flex items-center justify-center bg-background/95 backdrop-blur-md'}
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
              <div className={'w-[70%] max-w-md'}>
                <Progress value={analysisProgress} />
                <div className={'mt-2 text-xs text-muted-foreground text-center'}>{Math.round(analysisProgress)}%</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Summary */}
      <AnimatePresence>
        {showSummary && conversationAnalysis && (
          <CallSummary
            key={'call-summary'}
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
