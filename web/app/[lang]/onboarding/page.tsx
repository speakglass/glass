'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNextStep, NextStep } from 'nextstepjs';
import { getGlassTours } from '@/lib/onboarding-tours';
import { GlassOnboardingCard } from '@/components/onboarding/GlassOnboardingCard';
import Messages from '@/components/Messages';
import BottomPanel from '@/components/BottomPanel';
import { useGlass, SessionConfig } from '@/contexts/GlassContext';

export default function OnboardingPage() {
  const router = useRouter();
  const { connect } = useGlass();
  const { currentStep, currentTour, startNextStep } = useNextStep();
  const [onboardingTranslateValue, setOnboardingTranslateValue] = useState('');
  const [onboardingTranslating, setOnboardingTranslating] = useState(false);
  const [onboardingShowTranslateResult, setOnboardingShowTranslateResult] = useState(false);
  const [onboardingSuggestionProgress, setOnboardingSuggestionProgress] = useState(100);
  const [onboardingFeedbackProgress, setOnboardingFeedbackProgress] = useState(100);
  const [onboardingTranslationProgress, setOnboardingTranslationProgress] = useState(100);
  const [isMobile, setIsMobile] = useState(false);

  // Mock conversation messages
  const onboardingMessages = useMemo(
    () => [
      {
        role: 'other' as const,
        text: '今日はどうでしたか？',
        translation: 'How was your day?',
      },
      {
        role: 'you' as const,
        text: '今日は忙しかったけど、楽しかったです。',
        translation: 'I was busy today, but it was fun.',
      },
      {
        role: 'other' as const,
        text: '何をしましたか？',
        translation: 'What did you do?',
      },
    ],
    []
  );

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Start tour on mount
  useEffect(() => {
    if (!currentTour) {
      startNextStep('first-time-user');
    }
  }, []);

  // Step 4: simulate typing (Quick translation step)
  useEffect(() => {
    if (currentStep !== 4) {
      setOnboardingTranslateValue('');
      setOnboardingTranslating(false);
      setOnboardingShowTranslateResult(false);
      return;
    }
    let cancelled = false;
    const demoText = 'Nice to meet you';
    setOnboardingTranslateValue('');
    setOnboardingTranslating(false);
    setOnboardingShowTranslateResult(false);
    let i = 0;
    const typeNext = () => {
      if (cancelled) return;
      if (i <= demoText.length) {
        setOnboardingTranslateValue(demoText.slice(0, i));
        i++;
        setTimeout(typeNext, 70);
      } else {
        setTimeout(() => {
          setOnboardingTranslating(true);
          setTimeout(() => {
            if (cancelled) return;
            setOnboardingTranslating(false);
            setOnboardingShowTranslateResult(true);
          }, 900);
        }, 300);
      }
    };
    const startId = setTimeout(typeNext, 250);
    return () => {
      cancelled = true;
      clearTimeout(startId);
    };
  }, [currentStep]);

  // Progress animations for Step 2, 3, 4
  useEffect(() => {
    // Step 2: Suggestion progress (merged help + suggestion step)
    if (currentStep === 2) {
      setOnboardingSuggestionProgress(100);
      const duration = 8000;
      const interval = 50;
      const decrement = (100 / duration) * interval;
      let current = 100;

      const timer = setInterval(() => {
        current -= decrement;
        if (current <= 0) {
          clearInterval(timer);
          setOnboardingSuggestionProgress(0);
        } else {
          setOnboardingSuggestionProgress(current);
        }
      }, interval);

      return () => clearInterval(timer);
    }

    // Step 3: Feedback progress
    if (currentStep === 3) {
      setOnboardingFeedbackProgress(100);
      const duration = 8000;
      const interval = 50;
      const decrement = (100 / duration) * interval;
      let current = 100;

      const timer = setInterval(() => {
        current -= decrement;
        if (current <= 0) {
          clearInterval(timer);
          setOnboardingFeedbackProgress(0);
        } else {
          setOnboardingFeedbackProgress(current);
        }
      }, interval);

      return () => clearInterval(timer);
    }

    // Step 4: Translation progress (starts when result shows)
    if (currentStep === 4 && onboardingShowTranslateResult) {
      setOnboardingTranslationProgress(100);
      const duration = 8000;
      const interval = 50;
      const decrement = (100 / duration) * interval;
      let current = 100;

      const timer = setInterval(() => {
        current -= decrement;
        if (current <= 0) {
          clearInterval(timer);
          setOnboardingTranslationProgress(0);
        } else {
          setOnboardingTranslationProgress(current);
        }
      }, interval);

      return () => clearInterval(timer);
    }
  }, [currentStep, onboardingShowTranslateResult]);

  // Get suggestion data based on current step
  const getMockSuggestion = () => {
    if (currentStep === 2) {
      return {
        type: 'answer' as const,
        targetText: '私はソフトウェアエンジニアです。',
        pronunciation: 'Watashi wa sofutowea enjinia desu.',
        translation: "I'm a software engineer.",
        progress: onboardingSuggestionProgress,
      };
    }
    if (currentStep === 3) {
      return {
        type: 'feedback' as const,
        targetText: '私は学校に行きます。',
        pronunciation: 'Watashi wa gakkou ni ikimasu.',
        translation: 'Try "I go to" instead of "I am go to" for more natural phrasing.',
        progress: onboardingFeedbackProgress,
      };
    }
    if (currentStep === 4 && onboardingShowTranslateResult) {
      return {
        type: 'translate' as const,
        targetText: 'はじめまして。',
        pronunciation: 'Hajimemashite.',
        translation: 'Nice to meet you.',
        progress: onboardingTranslationProgress,
      };
    }
    return undefined;
  };

  const handleComplete = async () => {
    localStorage.setItem('glass_onboarding_completed', 'true');

    // Check if there's a pending session config
    const pendingConfigStr = localStorage.getItem('glass_pending_session_config');
    if (pendingConfigStr) {
      try {
        const config: SessionConfig = JSON.parse(pendingConfigStr);
        // Clear the pending config
        localStorage.removeItem('glass_pending_session_config');
        // Start the call with the saved config
        await connect(config);
        // Go to home page to show the chat UI (replace to avoid going back to onboarding)
        router.replace('/');
      } catch (error) {
        console.error('Failed to start call after onboarding:', error);
        router.replace('/');
      }
    } else {
      // No pending config, go to home
      router.replace('/');
    }
  };

  const handleSkip = () => {
    localStorage.setItem('glass_onboarding_completed', 'true');
    // If there is a pending config, start that session instead of going home
    const pendingConfigStr = localStorage.getItem('glass_pending_session_config');
    if (pendingConfigStr) {
      try {
        const config: SessionConfig = JSON.parse(pendingConfigStr);
        // Clear the pending config
        localStorage.removeItem('glass_pending_session_config');
        // Start the call with the saved config
        // Note: not awaiting here to avoid blocking UI on skip
        connect(config).finally(() => {
          // Navigate to chat UI
          router.replace('/');
        });
      } catch {
        router.replace('/');
      }
    } else {
      router.replace('/');
    }
  };

  return (
    <NextStep
      steps={useMemo(() => getGlassTours(), [])}
      cardComponent={GlassOnboardingCard}
      shadowRgb="0,0,0"
      shadowOpacity="0.5"
      cardTransition={{ duration: 0.3, type: 'spring' }}
      onComplete={handleComplete}
      onSkip={handleSkip}
    >
      <div className={'fixed inset-0 bg-background flex'}>
        <div
          className={
            'relative flex h-full w-full max-w-6xl mx-auto flex-col overflow-hidden pt-14 pb-28 sm:pb-0 px-4 sm:px-8'
          }
        >
          {/* Messages */}
          <Messages mockMessages={onboardingMessages} />

          {/* BottomPanel */}
          <BottomPanel
            isMockMode={true}
            mockSuggestion={getMockSuggestion()}
            mockTranslateInput={onboardingTranslateValue}
            mockTranslating={onboardingTranslating}
            mockShowTranslateResult={onboardingShowTranslateResult}
            onMockTranslateChange={setOnboardingTranslateValue}
          />
        </div>
      </div>
    </NextStep>
  );
}
