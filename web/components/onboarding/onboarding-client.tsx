'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useNextStep, NextStep } from 'nextstepjs';
import { getGlassTours } from '@/lib/onboarding-tours';
import { GlassOnboardingCard } from '@/components/onboarding/glass-onboarding-card';
import Messages from '@/components/messages';
import OnboardingBottomPanel from '@/components/onboarding/bottom-panel-demo';
import CallSummary from '@/components/call-summary';
import { useGlass } from '@/contexts/glass-context';
import { useAccountSession } from '@/contexts/account-session-context';
import { Button } from '@/components/ui/button';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { cn } from '@/utils';
import { changeLanguage } from '@/utils/language';
import { LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';
import { Nav } from '@/components/nav';
import {
  type DemoLocale,
  SUGGESTION_TRANSLATIONS,
  SUGGESTION_PRONUNCIATIONS,
  FEEDBACK_EXPLANATIONS,
  FEEDBACK_PRONUNCIATIONS,
  FEEDBACK_SUMMARIES,
  FEEDBACK_TIPS,
  FEEDBACK_ITEMS,
  LANGUAGES,
  normalizeLocale,
  getLocalizedText,
  getDemoTemplate,
  getDemoMemoryRecords,
} from './onboarding-data';
import type { LearningLevel } from '@/types/learning-level';
import {
  isLearningLevel,
  needsPronunciationSupport,
} from '@/types/learning-level';

function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentStep, currentTour, startNextStep } = useNextStep();
  const { settings } = useGlass();
  const { snapshot } = useAccountSession();
  const [onboardingHintValue, setOnboardingHintValue] = useState('');
  const [onboardingRequestingHint, setOnboardingRequestingHint] =
    useState(false);
  const [onboardingShowHintResult, setOnboardingShowHintResult] =
    useState(false);
  const [onboardingShowTyping, setOnboardingShowTyping] = useState(false);
  const [onboardingFocused, setOnboardingFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Refs for timer cleanup
  const step2TimersRef = useRef<{
    typing?: NodeJS.Timeout;
    request?: NodeJS.Timeout;
    result?: NodeJS.Timeout;
  }>({});
  const clearStep2Timers = () => {
    if (step2TimersRef.current.typing)
      clearTimeout(step2TimersRef.current.typing);
    if (step2TimersRef.current.request)
      clearTimeout(step2TimersRef.current.request);
    if (step2TimersRef.current.result)
      clearTimeout(step2TimersRef.current.result);
    step2TimersRef.current = {};
  };

  // Store Step 4 scroll position to restore when returning from Step 5
  const step4ScrollPositionRef = useRef<number | null>(null);
  const step4HasBeenVisitedRef = useRef(false);

  // Mock conversation messages
  const learningLang = (settings.languages?.learningLang || 'en').toLowerCase();
  const nativeLang = (settings.languages?.nativeLang || 'en').toLowerCase();
  const learningLocale = normalizeLocale(learningLang);
  const nativeLocale = normalizeLocale(nativeLang);
  const demoTemplate = useMemo(
    () => getDemoTemplate(learningLocale),
    [learningLocale]
  );
  const tourLevel = isLearningLevel(settings.languageLevel)
    ? settings.languageLevel
    : undefined;
  const tourNeedsPronunciation = needsPronunciationSupport(tourLevel);
  const typewriterText = useMemo(
    () => getLocalizedText('typingKeywords', nativeLocale),
    [nativeLocale]
  );

  const onboardingMessages = useMemo(() => {
    const allMessages =
      currentStep >= 3
        ? [...demoTemplate.conversation, ...demoTemplate.additionalMessages]
        : demoTemplate.conversation;

    return allMessages.map((entry) => ({
      role: entry.role,
      text: entry.text,
      translation: getLocalizedText(entry.translationKey, nativeLocale),
    }));
  }, [demoTemplate, nativeLocale, currentStep]);

  // Mock CallSummary data for Step 4
  const mockCallSummaryData = useMemo(() => {
    const partnerMessage =
      demoTemplate.conversation.find((entry) => entry.role === 'other') ??
      demoTemplate.conversation[0];
    const userMessage =
      demoTemplate.conversation.find((entry) => entry.role === 'you') ??
      demoTemplate.conversation[demoTemplate.conversation.length - 1] ??
      partnerMessage;

    // Get user's first name
    const userName = snapshot?.user?.name?.split(' ')[0] || '';

    // Get language-pair-specific feedback
    let summaryNative =
      FEEDBACK_SUMMARIES[learningLocale]?.[nativeLocale] ||
      FEEDBACK_SUMMARIES.en?.en ||
      '';

    // Add personalized greeting with user's name at the beginning
    if (userName) {
      const greetings: Record<DemoLocale, string> = {
        en: `Hi ${userName}! `,
        ja: `${userName}さん、`,
        ko: `${userName}님, `,
        es: `¡Hola ${userName}! `,
        fr: `Salut ${userName} ! `,
      };
      summaryNative = (greetings[nativeLocale] || '') + summaryNative;
    }

    const summaryCombined = summaryNative;
    const feedbackItemNative =
      FEEDBACK_ITEMS[learningLocale]?.[nativeLocale] ||
      FEEDBACK_ITEMS.en?.en ||
      '';
    const partnerFollowUp =
      demoTemplate.conversation.find(
        (entry) => entry.role === 'other' && entry !== partnerMessage
      ) ??
      demoTemplate.conversation[2] ??
      partnerMessage;

    return {
      sessionId: 'onboarding-demo',
      durationSeconds: 120,
      learningLang: learningLocale,
      nativeLang: nativeLocale,
      scores: {
        fluency: 75,
        accuracy: 82,
        comprehensibility: 78,
      },
      partner: {
        id: 'partner-8f76e9b6-1b2c-4d5e-9f70-123456789abc',
        name: partnerMessage.role === 'other' ? 'Emma' : 'Glass AI',
        avatarUrl: '/partners/emma.png',
      },
      feedback: summaryCombined,
      initialMemories: getDemoMemoryRecords(nativeLocale),
      messages: [
        {
          text: partnerMessage.text,
          translation: getLocalizedText(
            partnerMessage.translationKey,
            nativeLocale
          ),
          utterance_id: 'u1',
          role: 'partner',
          partner_id: 'partner-8f76e9b6-1b2c-4d5e-9f70-123456789abc',
        },
        {
          text: userMessage.text,
          translation: getLocalizedText(
            userMessage.translationKey,
            nativeLocale
          ),
          utterance_id: 'u2',
          role: 'user',
        },
        {
          text: partnerFollowUp.text,
          translation: getLocalizedText(
            partnerFollowUp.translationKey,
            nativeLocale
          ),
          utterance_id: 'u3',
          role: 'partner',
          partner_id: 'partner-8f76e9b6-1b2c-4d5e-9f70-123456789abc',
        },
      ],
      feedbackItems: [
        {
          utteranceId: 'u2',
          text: feedbackItemNative,
        },
      ],
    };
  }, [
    demoTemplate,
    nativeLocale,
    learningLocale,
    tourNeedsPronunciation,
    snapshot,
  ]);

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
  }, [currentTour, startNextStep]);

  // Step 2: simulate typing (Help you speak - Guided suggestion step)
  useEffect(() => {
    if (currentStep !== 2) {
      clearStep2Timers();
      setOnboardingShowTyping(false);
      setOnboardingRequestingHint(false);
      setOnboardingShowHintResult(false);
      setOnboardingFocused(false);
      setOnboardingHintValue('');
      return;
    }

    setOnboardingShowTyping(false);
    setOnboardingRequestingHint(false);
    setOnboardingShowHintResult(false);
    setOnboardingHintValue('');
    setOnboardingFocused(true);

    step2TimersRef.current.typing = setTimeout(() => {
      if (currentStep === 2) {
        setOnboardingShowTyping(true);
      }
    }, 500);

    return () => {
      clearStep2Timers();
    };
  }, [currentStep]);

  // Handle typewriter completion - triggered by Typewriter component callback
  const handleTypingComplete = () => {
    // Only proceed if we're still on Step 2
    if (currentStep !== 2) return;

    // State 3 & 4: Request → Show result
    // Set requesting first to avoid showing "Get Suggestions" between typing and loading
    setOnboardingRequestingHint(true);
    setOnboardingShowTyping(false);
    setOnboardingHintValue(typewriterText);
    if (step2TimersRef.current.request)
      clearTimeout(step2TimersRef.current.request);
    if (step2TimersRef.current.result)
      clearTimeout(step2TimersRef.current.result);

    step2TimersRef.current.request = setTimeout(() => {
      if (currentStep !== 2) {
        setOnboardingRequestingHint(false);
        step2TimersRef.current.request = undefined;
        return;
      }

      step2TimersRef.current.result = setTimeout(() => {
        if (currentStep !== 2) {
          setOnboardingRequestingHint(false);
          step2TimersRef.current.result = undefined;
          return;
        }
        setOnboardingRequestingHint(false);
        setOnboardingShowHintResult(true);
        step2TimersRef.current.result = undefined;
      }, 900);
      step2TimersRef.current.request = undefined;
    }, 300);
  };

  // Step 3: Clear Step 2 states when entering
  useEffect(() => {
    if (currentStep === 3) {
      clearStep2Timers();
      // Clear Step 2 states
      setOnboardingShowTyping(false);
      setOnboardingRequestingHint(false);
      setOnboardingShowHintResult(false);
      setOnboardingFocused(false);
      setOnboardingHintValue('');
    }
  }, [currentStep]);

  // Step 4: Scroll to scores-feedback section - restore position if returning from Step 5
  useEffect(() => {
    if (currentStep === 4 && typeof window !== 'undefined') {
      const width = window.innerWidth;
      const isMobile = width < 768;
      const shouldScroll = width <= 1366;

      if (!shouldScroll) {
        step4HasBeenVisitedRef.current = true;
        return;
      }

      const callSummaryContainer = document.querySelector(
        '#glass-call-summary'
      ) as HTMLElement;
      const scoresSection = document.querySelector('#glass-scores-feedback');

      if (!scoresSection || !callSummaryContainer) return;

      // If returning from Step 5, restore saved scroll position immediately
      if (
        step4HasBeenVisitedRef.current &&
        step4ScrollPositionRef.current !== null
      ) {
        // Restore scroll position synchronously to prevent visual jumps
        callSummaryContainer.scrollTop = step4ScrollPositionRef.current;

        // Use requestAnimationFrame to ensure scroll is applied before NextStep recalculation
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Trigger resize to force NextStep to recalculate position
            window.dispatchEvent(new Event('resize'));
          });
        });

        return;
      }

      // First time visiting Step 4 - calculate and save scroll position
      const timeouts: NodeJS.Timeout[] = [];

      const scrollTimeout = setTimeout(() => {
        if (isMobile) {
          const containerRect = callSummaryContainer.getBoundingClientRect();
          const elementRect = scoresSection.getBoundingClientRect();
          const containerScrollTop = callSummaryContainer.scrollTop;

          const elementTopRelative =
            elementRect.top - containerRect.top + containerScrollTop;
          const cardHeight = 200;
          const containerHeight = containerRect.height;
          const targetScrollTop =
            elementTopRelative - (containerHeight - cardHeight) / 2;

          const finalScrollTop = Math.max(0, targetScrollTop);
          callSummaryContainer.scrollTop = finalScrollTop;

          // Save position for future returns
          step4ScrollPositionRef.current = finalScrollTop;
          step4HasBeenVisitedRef.current = true;

          // Single recalculation after scroll
          const recalcTimeout = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
          }, 150);
          timeouts.push(recalcTimeout);
        } else {
          // Desktop: scroll to center
          scoresSection.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest',
          });

          // Save position after scrollIntoView
          const saveTimeout = setTimeout(() => {
            step4ScrollPositionRef.current = callSummaryContainer.scrollTop;
            step4HasBeenVisitedRef.current = true;

            // Single recalculation
            const recalcTimeout = setTimeout(() => {
              window.dispatchEvent(new Event('resize'));
            }, 150);
            timeouts.push(recalcTimeout);
          }, 100);
          timeouts.push(saveTimeout);
        }
      }, 200);

      timeouts.push(scrollTimeout);

      return () => {
        timeouts.forEach((timeout) => clearTimeout(timeout));
      };
    }
  }, [currentStep]);

  // Step 5: Scroll to memory section on mobile
  useEffect(() => {
    if (currentStep === 5 && typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        // First scroll immediately to get element in viewport
        const memorySection = document.querySelector('#glass-memory-section');
        if (memorySection) {
          // Immediate scroll first
          memorySection.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest',
          });

          // Then smooth scroll after a brief delay
          setTimeout(() => {
            memorySection.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            });
          }, 100);
        }
      }
    }
  }, [currentStep]);

  const mockSuggestionData = useMemo(() => {
    if (currentStep === 2 && onboardingShowHintResult) {
      const translation =
        SUGGESTION_TRANSLATIONS[nativeLocale] ?? SUGGESTION_TRANSLATIONS.en;
      const pronunciation = tourNeedsPronunciation
        ? SUGGESTION_PRONUNCIATIONS[learningLocale]?.[nativeLocale]
        : undefined;
      return {
        targetText: demoTemplate.suggestion.targetText,
        pronunciation,
        translation,
        progress: 0,
      };
    }
    return undefined;
  }, [
    currentStep,
    onboardingShowHintResult,
    demoTemplate,
    learningLocale,
    nativeLocale,
    tourNeedsPronunciation,
  ]);

  const mockFeedbackData = useMemo(() => {
    if (currentStep === 3) {
      const translation =
        FEEDBACK_EXPLANATIONS[learningLocale]?.[nativeLocale] ??
        FEEDBACK_EXPLANATIONS.en?.en ??
        '';
      const pronunciation = tourNeedsPronunciation
        ? FEEDBACK_PRONUNCIATIONS[learningLocale]?.[nativeLocale]
        : undefined;
      return {
        targetText: demoTemplate.feedbackBubble.targetText,
        pronunciation,
        translation,
        progress: undefined, // No time limit
      };
    }
    return undefined;
  }, [
    currentStep,
    demoTemplate,
    learningLocale,
    nativeLocale,
    tourNeedsPronunciation,
  ]);

  const handleComplete = async () => {
    // Extract language from pathname
    const lang = pathname.split('/')[1] || 'en';
    // Fade out before navigation for smooth transition
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.2s ease-out';
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Go to dashboard after onboarding
    router.replace(`/${lang}/dashboard`);
  };

  const handleSkip = async () => {
    // Extract language from pathname
    const lang = pathname.split('/')[1] || 'en';
    // Fade out before navigation for smooth transition
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.2s ease-out';
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Go to dashboard
    router.replace(`/${lang}/dashboard`);
  };

  const tours = useMemo(() => getGlassTours(), []);
  const tour = tours[0];
  const totalSteps = tour?.steps?.length || 0;

  return (
    <>
      <Nav />
      <NextStep
        steps={tours}
        cardComponent={(props) => {
          return <GlassOnboardingCard {...props} />;
        }}
        shadowRgb="0,0,0"
        shadowOpacity="0.5"
        cardTransition={{ duration: 0.3, type: 'spring' }}
        onComplete={handleComplete}
        onSkip={handleSkip}
      >
        <div
          className={'fixed top-14 left-0 right-0 bottom-0 bg-background flex'}
        >
          <div
            className={
              'relative flex h-full w-full max-w-6xl mx-auto flex-col overflow-hidden pt-4 pb-28 sm:pb-0 px-4 sm:px-8'
            }
          >
            {/* Messages */}
            <Messages mockMessages={onboardingMessages} />

            {/* BottomPanel */}
            <OnboardingBottomPanel
              suggestion={mockSuggestionData}
              feedback={mockFeedbackData}
              hintInput={onboardingHintValue}
              requestingHint={onboardingRequestingHint}
              showHintResult={onboardingShowHintResult}
              showTyping={onboardingShowTyping}
              simulateFocus={onboardingFocused}
              typewriterText={typewriterText}
              onTypingComplete={handleTypingComplete}
              onHintChange={setOnboardingHintValue}
            />
          </div>
        </div>
      </NextStep>

      {/* CallSummary Modal - Step 3, 4, 5, 6 - Pre-render from step 3 for smooth transition */}
      {(currentStep === 3 ||
        currentStep === 4 ||
        currentStep === 5 ||
        currentStep === 6) && (
        <div className={currentStep === 3 ? 'invisible' : ''}>
          <CallSummary
            {...mockCallSummaryData}
            conversationCountOverride={3}
            onClose={() => {}}
          />
        </div>
      )}
    </>
  );
}

export default function OnboardingClient() {
  const { onboardingStatus, markOnboardingComplete, token } =
    useAccountSession();
  const { updateSettings, settings } = useGlass();
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<
    'native-lang' | 'learning-lang' | 'level' | 'tour'
  >('native-lang');
  const [languages, setLanguages] = useState({
    learningLang: settings.languages?.learningLang || '',
    nativeLang: settings.languages?.nativeLang || '',
  });
  const initialLevel = isLearningLevel(settings.languageLevel)
    ? settings.languageLevel
    : undefined;
  const [languageLevel, setLanguageLevel] = useState<LearningLevel | ''>(
    initialLevel ?? ''
  );
  const [savingLanguageLevel, setSavingLanguageLevel] = useState(false);
  const [languageLevelError, setLanguageLevelError] = useState<string | null>(
    null
  );
  const resolvedLevel = (languageLevel || initialLevel || undefined) as
    | LearningLevel
    | undefined;
  const needsPronunciation = needsPronunciationSupport(resolvedLevel);

  // Define language level options inside component so translations update when language changes
  const languageLevelOptions = useMemo(
    () => [
      {
        value: 'zero' as LearningLevel,
        label: t`Zero`,
        description: t`I am starting from zero and need full guidance.`,
        icon: '🥚',
      },
      {
        value: 'beginner' as LearningLevel,
        label: t`Beginner`,
        description: t`I can say simple phrases but need help forming sentences.`,
        icon: '🌱',
      },
      {
        value: 'intermediate' as LearningLevel,
        label: t`Intermediate`,
        description: t`I can explain ideas, ask follow-up questions, and manage most conversations.`,
        icon: '🌼',
      },
      {
        value: 'advanced' as LearningLevel,
        label: t`Advanced`,
        description: t`I can discuss complex topics and want to sound more natural.`,
        icon: '🌟',
      },
    ],
    [] // Re-evaluate when component re-renders with new language
  );

  // Persist language selection across page transitions
  useEffect(() => {
    if (languages.nativeLang || languages.learningLang) {
      updateSettings({ languages });
    }
  }, [languages]);

  useEffect(() => {
    setLanguageLevel('');
    setLanguageLevelError(null);
  }, [languages.learningLang]);

  // If onboarding is already completed, show tour directly
  if (onboardingStatus && onboardingStatus.completed) {
    if (step !== 'tour') {
      setStep('tour');
    }
  }

  const handleNativeLangSelect = (code: string) => {
    // Update state first
    const newLanguages = {
      ...languages,
      nativeLang: code,
    };
    setLanguages(newLanguages);

    // Change UI language if the selected language is supported
    if (LOCALIZED_LANGUAGE_CODES.includes(code as any)) {
      const newPath = changeLanguage(code, pathname, LOCALIZED_LANGUAGE_CODES);
      // Force full page reload to reinitialize Lingui with new locale
      window.location.href = newPath;
    }
  };

  const handleLearningLangSelect = (code: string) => {
    setLanguages({
      ...languages,
      learningLang: code,
    });
  };

  const handleLanguageLevelNext = async () => {
    if (!languages.learningLang || !languages.nativeLang || !languageLevel) {
      setLanguageLevelError(t`Select a level to continue`);
      return;
    }
    if (!token) {
      setLanguageLevelError(
        t`Authentication is required. Please refresh and try again.`
      );
      return;
    }
    setLanguageLevelError(null);
    setSavingLanguageLevel(true);
    try {
      updateSettings({
        languages,
        languageLevel,
      });
      await markOnboardingComplete({
        learningLang: languages.learningLang,
        nativeLang: languages.nativeLang,
        languageLevel: languageLevel,
      });
      setStep('tour');
    } catch (error) {
      console.error('[Onboarding] Failed to save language level', error);
      setLanguageLevelError(t`Unable to save level. Please try again.`);
    } finally {
      setSavingLanguageLevel(false);
    }
  };

  // Show tour
  if (step === 'tour') {
    return <OnboardingTour />;
  }

  // Native language selection
  if (step === 'native-lang') {
    return (
      <>
        <Nav />
        <div className="fixed top-14 left-0 right-0 bottom-0 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-6 sm:gap-8 max-w-2xl w-full px-1.5">
            <div className="text-center">
              <h2 className="sm:text-2xl text-xl font-medium mb-2">
                <Trans>What is your native language?</Trans>
              </h2>
              <p className="text-sm text-muted-foreground">
                <Trans>Select the language you speak fluently</Trans>
              </p>
            </div>

            <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center">
              {LANGUAGES.map((lang: any) => (
                <Button
                  key={`native-${lang.code}`}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'rounded-full focus-visible:ring-2 transition-all hover:scale-105',
                    languages.nativeLang === lang.code &&
                      'bg-accent border-foreground/30 ring-1 ring-foreground/20'
                  )}
                  onClick={() => handleNativeLangSelect(lang.code)}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="font-medium text-sm">{lang.name}</span>
                </Button>
              ))}
            </div>

            <Button
              onClick={() => setStep('learning-lang')}
              disabled={!languages.nativeLang}
              variant="default"
              size="sm"
              className={cn(
                'text-sm',
                !languages.nativeLang && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Trans>Next →</Trans>
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Learning language selection
  if (step === 'learning-lang') {
    return (
      <>
        <Nav />
        <div className="fixed top-14 left-0 right-0 bottom-0 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-6 sm:gap-8 max-w-2xl w-full px-1.5">
            <div className="text-center">
              <h2 className="sm:text-2xl text-xl font-medium mb-2">
                <Trans>Which language do you want to learn?</Trans>
              </h2>
              <p className="text-sm text-muted-foreground">
                <Trans>Choose the language you want to practice speaking</Trans>
              </p>
            </div>

            <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center">
              {LANGUAGES.map((lang: any) => {
                const isDisabled = languages.nativeLang === lang.code;
                return (
                  <Button
                    key={`learn-${lang.code}`}
                    variant="outline"
                    size="sm"
                    disabled={isDisabled}
                    className={cn(
                      'rounded-full focus-visible:ring-2 transition-all',
                      !isDisabled && 'hover:scale-105',
                      languages.learningLang === lang.code &&
                        'bg-accent border-foreground/30 ring-1 ring-foreground/20',
                      isDisabled && 'opacity-40 cursor-not-allowed'
                    )}
                    onClick={() =>
                      !isDisabled && handleLearningLangSelect(lang.code)
                    }
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span className="font-medium text-sm">{lang.name}</span>
                  </Button>
                );
              })}
            </div>

            <div className="flex justify-between items-center w-full">
              <button
                onClick={() => setStep('native-lang')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trans>← Back</Trans>
              </button>
              <Button
                onClick={() => setStep('level')}
                disabled={!languages.learningLang}
                variant="default"
                size="sm"
                className={cn(
                  'text-sm',
                  !languages.learningLang && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Trans>Next →</Trans>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === 'level') {
    return (
      <>
        <Nav />
        <div className="fixed top-14 left-0 right-0 bottom-0 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3 sm:gap-8 px-1.5 w-full max-w-md">
            <div className="text-center space-y-2">
              <h2 className="sm:text-2xl text-xl font-medium pt-2 sm:pt-0">
                <Trans>How confident are you in this language?</Trans>
              </h2>
              <p className="text-sm text-muted-foreground max-w-lg">
                <Trans>
                  Select the description that feels closest to your speaking
                  ability.
                </Trans>
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full">
              {languageLevelOptions.map((option) => {
                const isActive = languageLevel === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setLanguageLevel(option.value)}
                    className={cn(
                      'w-full rounded-xl border bg-card px-3 py-2.5 sm:px-4 sm:py-3 flex items-start gap-2.5 sm:gap-3 text-left transition-all cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'bg-accent/50 border-foreground/30'
                        : 'border-border'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-base sm:text-lg',
                        isActive
                          ? 'bg-foreground/10 text-foreground'
                          : 'bg-muted/50 text-muted-foreground'
                      )}
                      aria-hidden
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm sm:text-base mb-0.5">
                        {option.label}
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {languageLevelError && (
              <p className="text-sm text-red-500">{languageLevelError}</p>
            )}

            <div className="flex justify-between items-center w-full">
              <button
                onClick={() => setStep('learning-lang')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trans>← Back</Trans>
              </button>
              <Button
                onClick={handleLanguageLevelNext}
                disabled={!languageLevel || savingLanguageLevel}
                variant="default"
                size="sm"
                className={cn(
                  'text-sm font-medium',
                  (!languageLevel || savingLanguageLevel) && 'opacity-50'
                )}
              >
                {savingLanguageLevel ? (
                  <Trans>Saving…</Trans>
                ) : (
                  <Trans>Next →</Trans>
                )}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
