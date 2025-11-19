'use client';
import Messages from './messages';
import Controls from './controls';
import StartCall from './start-call';
import CallSummary from './call-summary';
import BottomPanel from './bottom-panel';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { useGlass } from '@/contexts/glass-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import Progress from '@/components/ui/progress';
import { Trans } from '@lingui/react/macro';

export default function Chat() {
  const ref = useRef<ComponentRef<typeof Messages> | null>(null);
  const { status, conversationAnalysis, showSummary, closeSummary } = useGlass();
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Debug: Log render conditions
  console.log('[Chat] Rendering with:', {
    status: status.value,
    showSummary,
    hasAnalysis: !!conversationAnalysis,
  });

  // Fade in on mount (after onboarding transition)
  useEffect(() => {
    document.body.style.opacity = '1';
    document.body.style.transition = 'opacity 0.3s ease-in';
  }, []);

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
    <div className={'relative grow flex flex-col mx-auto w-full overflow-hidden h-0 pt-14'}>
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
                <h3 className={'text-2xl font-semibold'}>
                  <Trans>Analyzing Conversation</Trans>
                </h3>
                <p className={'text-sm text-muted-foreground'}>
                  <Trans>Generating insights and feedback...</Trans>
                </p>
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
            conversationId={conversationAnalysis.conversationId}
            scores={conversationAnalysis.scores}
            feedback={conversationAnalysis.feedback}
            messages={conversationAnalysis.messages}
            feedbackItems={conversationAnalysis.feedbackItems}
            partner={conversationAnalysis.partner ?? null}
            durationSeconds={conversationAnalysis.durationSeconds}
            learningLang={conversationAnalysis.learningLang}
            nativeLang={conversationAnalysis.nativeLang}
            initialMemories={conversationAnalysis.memories}
            onClose={closeSummary}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
