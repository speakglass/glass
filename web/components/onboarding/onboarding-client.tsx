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
  LANGUAGES,
  normalizeLocale,
  getLocalizedText,
  getDemoTemplate,
  getLanguageExample,
} from './onboarding-data';

function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentStep, currentTour, startNextStep } = useNextStep();
  const { settings } = useGlass();
  const { snapshot } = useAccountSession();
  const [onboardingHintValue, setOnboardingHintValue] = useState('');
  const [onboardingRequestingHint, setOnboardingRequestingHint] = useState(false);
  const [onboardingShowHintResult, setOnboardingShowHintResult] = useState(false);
  const [onboardingShowTyping, setOnboardingShowTyping] = useState(false);
  const [onboardingFocused, setOnboardingFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Refs for timer cleanup
  const step2TimersRef = useRef<{ typing?: NodeJS.Timeout; request?: NodeJS.Timeout; result?: NodeJS.Timeout }>({});
  const clearStep2Timers = () => {
    if (step2TimersRef.current.typing) clearTimeout(step2TimersRef.current.typing);
    if (step2TimersRef.current.request) clearTimeout(step2TimersRef.current.request);
    if (step2TimersRef.current.result) clearTimeout(step2TimersRef.current.result);
    step2TimersRef.current = {};
  };

  // Mock conversation messages
  const learningLang = (settings.languages?.learningLang || 'en').toLowerCase();
  const nativeLang = (settings.languages?.nativeLang || 'en').toLowerCase();
  const learningLocale = normalizeLocale(learningLang);
  const nativeLocale = normalizeLocale(nativeLang);
  const demoTemplate = useMemo(() => getDemoTemplate(learningLocale), [learningLocale]);
  const needsPronunciation = settings.proficiency === 'cant_read';
  const typewriterText = useMemo(() => getLocalizedText('typingKeywords', nativeLocale), [nativeLocale]);

  const onboardingMessages = useMemo(() => {
    const allMessages =
      currentStep >= 3 ? [...demoTemplate.conversation, ...demoTemplate.additionalMessages] : demoTemplate.conversation;

    return allMessages.map((entry) => ({
      role: entry.role,
      text: entry.text,
      translation: getLocalizedText(entry.translationKey, nativeLocale),
    }));
  }, [demoTemplate, nativeLocale, currentStep]);

  // Mock CallSummary data for Step 4
  const mockCallSummaryData = useMemo(() => {
    const partnerMessage =
      demoTemplate.conversation.find((entry) => entry.role === 'other') ?? demoTemplate.conversation[0];
    const userMessage =
      demoTemplate.conversation.find((entry) => entry.role === 'you') ??
      demoTemplate.conversation[demoTemplate.conversation.length - 1] ??
      partnerMessage;

    // Get user's first name
    const userName = snapshot?.user?.name?.split(' ')[0] || '';

    // Create personalized feedback with user's name
    let summaryNative = getLocalizedText(demoTemplate.feedbackSummaryKey, nativeLocale);

    // Add personalized greeting with user's name at the beginning
    if (userName) {
      const greetings: Record<DemoLocale, string> = {
        en: `Hi ${userName}! `,
        ja: `${userName}さん、`,
        ko: `${userName}님, `,
        zh: `${userName}，`,
        es: `¡Hola ${userName}! `,
        fr: `Salut ${userName} ! `,
      };
      summaryNative = (greetings[nativeLocale] || '') + summaryNative;
    }

    const summaryCombined = summaryNative;
    const feedbackItemNative = getLocalizedText(demoTemplate.feedbackItemKey, nativeLocale);
    const partnerFollowUp =
      demoTemplate.conversation.find((entry) => entry.role === 'other' && entry !== partnerMessage) ??
      demoTemplate.conversation[2] ??
      partnerMessage;

    return {
      sessionId: 'onboarding-demo',
      scores: {
        fluency: 75,
        accuracy: 82,
        comprehensibility: 78,
      },
      extractedInfo: [
        { label: 'Topic', value: 'Daily activities and work', editable: true },
        { label: 'Preference', value: 'Enjoys learning languages', editable: true },
      ],
      feedback: summaryCombined,
      messages: [
        {
          speaker: 'partner',
          source: 'other',
          text: partnerMessage.text,
          translation: getLocalizedText(partnerMessage.translationKey, nativeLocale),
          utterance_id: 'u1',
        },
        {
          speaker: 'user',
          source: 'mic',
          text: userMessage.text,
          translation: getLocalizedText(userMessage.translationKey, nativeLocale),
          utterance_id: 'u2',
        },
        {
          speaker: 'partner',
          source: 'other',
          text: partnerFollowUp.text,
          translation: getLocalizedText(partnerFollowUp.translationKey, nativeLocale),
          utterance_id: 'u3',
        },
      ],
      feedbackItems: [
        {
          utterance_id: 'u2',
          text: feedbackItemNative,
        },
      ],
    };
  }, [demoTemplate, nativeLocale, learningLocale, needsPronunciation, snapshot]);

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
    if (step2TimersRef.current.request) clearTimeout(step2TimersRef.current.request);
    if (step2TimersRef.current.result) clearTimeout(step2TimersRef.current.result);

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

  const mockSuggestionData = useMemo(() => {
    if (currentStep === 2 && onboardingShowHintResult) {
      const translation = SUGGESTION_TRANSLATIONS[nativeLocale] ?? SUGGESTION_TRANSLATIONS.en;
      const pronunciation = needsPronunciation ? SUGGESTION_PRONUNCIATIONS[learningLocale]?.[nativeLocale] : undefined;
      return {
        targetText: demoTemplate.suggestion.targetText,
        pronunciation,
        translation,
        progress: 0,
      };
    }
    return undefined;
  }, [currentStep, onboardingShowHintResult, demoTemplate, learningLocale, nativeLocale, needsPronunciation]);

  const mockFeedbackData = useMemo(() => {
    if (currentStep === 3) {
      const translation = FEEDBACK_EXPLANATIONS[nativeLocale] ?? FEEDBACK_EXPLANATIONS.en;
      const pronunciation = needsPronunciation ? FEEDBACK_PRONUNCIATIONS[learningLocale]?.[nativeLocale] : undefined;
      return {
        targetText: demoTemplate.feedbackBubble.targetText,
        pronunciation,
        translation,
        progress: undefined, // No time limit
      };
    }
    return undefined;
  }, [currentStep, demoTemplate, learningLocale, nativeLocale, needsPronunciation]);

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

  return (
    <>
      <Nav />
      <NextStep
        steps={useMemo(() => getGlassTours(), [])}
        cardComponent={GlassOnboardingCard}
        shadowRgb="0,0,0"
        shadowOpacity="0.5"
        cardTransition={{ duration: 0.3, type: 'spring' }}
        onComplete={handleComplete}
        onSkip={handleSkip}
      >
        <div className={'fixed top-14 left-0 right-0 bottom-0 bg-background flex'}>
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
      {(currentStep === 3 || currentStep === 4 || currentStep === 5 || currentStep === 6) && (
        <div className={currentStep === 3 ? 'invisible' : ''}>
          <CallSummary
            {...mockCallSummaryData}
            memoryCountOverride={2}
            conversationCountOverride={3}
            initialShowMemory={currentStep === 5}
            onClose={() => {}}
            onStartNewCall={() => {}}
          />
        </div>
      )}
    </>
  );
}

export default function OnboardingClient() {
  const { onboardingStatus, markOnboardingComplete } = useAccountSession();
  const { updateSettings, settings } = useGlass();
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<'native-lang' | 'learning-lang' | 'level' | 'tour'>('native-lang');

  // Initialize from settings or context if available
  const [languages, setLanguages] = useState({
    learningLang: settings.languages?.learningLang || '',
    nativeLang: settings.languages?.nativeLang || '',
  });
  const [proficiency, setProficiency] = useState<'cant_read' | 'can_read' | undefined>(
    settings.proficiency as 'cant_read' | 'can_read' | undefined
  );

  // Persist language selection across page transitions
  useEffect(() => {
    if (languages.nativeLang || languages.learningLang) {
      updateSettings({ languages });
    }
  }, [languages]);

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
      // Use router.push for smoother transition
      router.push(newPath);
    }
  };

  const handleLearningLangSelect = (code: string) => {
    setLanguages({
      ...languages,
      learningLang: code,
    });
  };

  const handleLevelComplete = async () => {
    try {
      // Save settings to context
      updateSettings({
        languages,
        proficiency,
      });

      // Mark onboarding as complete and save to database
      await markOnboardingComplete({
        learningLang: languages.learningLang,
        nativeLang: languages.nativeLang,
        proficiency: proficiency!,
      });

      // Show tour
      setStep('tour');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  // Show tour
  if (step === 'tour') {
    return <OnboardingTour />;
  }

  // Native language selection
  if (step === 'native-lang') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-6 sm:gap-8 max-w-2xl w-full px-1.5">
          <div className="text-center">
            <h2 className="text-2xl font-medium mb-2">
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
                  languages.nativeLang === lang.code && 'bg-accent border-foreground/30 ring-1 ring-foreground/20'
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
            className={cn('text-sm', !languages.nativeLang && 'opacity-50 cursor-not-allowed')}
          >
            <Trans>Next →</Trans>
          </Button>
        </div>
      </div>
    );
  }

  // Learning language selection
  if (step === 'learning-lang') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-6 sm:gap-8 max-w-2xl w-full px-1.5">
          <div className="text-center">
            <h2 className="text-2xl font-medium mb-2">
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
                    languages.learningLang === lang.code && 'bg-accent border-foreground/30 ring-1 ring-foreground/20',
                    isDisabled && 'opacity-40 cursor-not-allowed'
                  )}
                  onClick={() => !isDisabled && handleLearningLangSelect(lang.code)}
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
              className={cn('text-sm', !languages.learningLang && 'opacity-50 cursor-not-allowed')}
            >
              <Trans>Next →</Trans>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Level selection
  const phrase = getLanguageExample(languages.learningLang, languages.nativeLang);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6 sm:gap-8 px-1.5">
        <div className="text-center">
          <h2 className="text-2xl font-medium mb-2">
            <Trans>Do you want pronunciation help?</Trans>
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans>We'll show how to read sentences in your alphabet when helpful</Trans>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start">
          <button
            onClick={() => {
              setProficiency('cant_read');
            }}
            className={cn(
              'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
              'bg-card border border-border hover:border-foreground/30 hover:scale-[1.02]',
              proficiency === 'cant_read' && 'border-foreground/30 ring-2 ring-foreground/20'
            )}
          >
            <div className="flex flex-col gap-3">
              <div className="text-center">
                <div className="font-medium mb-1 text-base">
                  <Trans>Yes, show pronunciation</Trans>
                </div>
              </div>
              <div className="mt-auto">
                <div className="rounded-md px-5 py-3 text-left bg-muted border border-border">
                  <div className="text-sm leading-snug font-medium">{phrase?.target || 'Example phrase'}</div>
                  {phrase?.pronunciation && (
                    <div className="text-sky-600 dark:text-sky-400 text-sm leading-snug font-medium mt-0.5">
                      {phrase.pronunciation}
                    </div>
                  )}
                  {phrase?.translation && (
                    <div className="text-sm text-muted-foreground mt-1">{phrase.translation}</div>
                  )}
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setProficiency('can_read');
            }}
            className={cn(
              'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
              'bg-card border border-border hover:border-foreground/30 hover:scale-[1.02]',
              proficiency === 'can_read' && 'border-foreground/30 ring-2 ring-foreground/20'
            )}
          >
            <div className="flex flex-col gap-3">
              <div className="text-center">
                <div className="font-medium mb-1 text-base">
                  <Trans>No, I'm fine</Trans>
                </div>
              </div>
              <div className="mt-auto">
                <div className="rounded-md px-5 py-3 text-left bg-muted border border-border">
                  <div className="text-sm leading-snug font-medium">{phrase?.target || 'Example phrase'}</div>
                  {phrase?.translation && (
                    <div className="text-sm text-muted-foreground mt-1">{phrase.translation}</div>
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="flex justify-between items-center w-full max-w-[640px]">
          <button
            onClick={() => setStep('learning-lang')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trans>← Back</Trans>
          </button>
          <Button
            onClick={handleLevelComplete}
            disabled={!proficiency}
            variant="default"
            size="sm"
            className={cn('text-sm font-medium', !proficiency && 'opacity-50 cursor-not-allowed')}
          >
            <Trans>Start Tutorial</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
