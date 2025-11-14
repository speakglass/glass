import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/glass-context';
import { useAccountSession } from '@/contexts/account-session-context';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone } from 'lucide-react';
import LiquidGlass from './liquid-glass';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

type SetupStep = 'start' | 'languages' | 'level' | 'mode' | 'scenario' | 'instructions' | 'connecting';

interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

interface ExamplePhrase {
  target: string; // Text in learning language
  pronunciation?: string; // Romanization/pronunciation guide
  translation: string; // Translation in native language
}

interface LanguageExample {
  withPronunciation: {
    words: { target: string; pronunciation: string }[];
  };
  withoutPronunciation: {
    target: string;
  };
}

// Example phrases for each language with translations
const LANGUAGE_EXAMPLES: Record<string, Record<string, ExamplePhrase>> = {
  en: {
    ko: {
      target: 'Thank you very much',
      pronunciation: '땡큐 베리 머치',
      translation: '정말 감사합니다',
    },
    ja: {
      target: 'Thank you very much',
      pronunciation: 'サンキュー ベリー マッチ',
      translation: '本当にありがとうございます',
    },
    zh: { target: 'Thank you very much', pronunciation: 'sang-kyu bay-ree ma-chee', translation: '非常感谢' },
    es: { target: 'Thank you very much', pronunciation: 'zenk yu beri mach', translation: 'Muchas gracias' },
    fr: { target: 'Thank you very much', pronunciation: 'sank iou vèri meutch', translation: 'Merci beaucoup' },
  },
  ko: {
    en: { target: '정말 감사합니다', pronunciation: 'jeong-mal gam-sa-ham-ni-da', translation: 'Thank you very much' },
    ja: {
      target: '정말 감사합니다',
      pronunciation: 'チョンマル カムサハムニダ',
      translation: '本当にありがとうございます',
    },
    zh: { target: '정말 감사합니다', pronunciation: 'jung-mal gam-sa-ham-nee-da', translation: '非常感谢' },
    es: { target: '정말 감사합니다', pronunciation: 'jeong-mal gam-sa-jam-ni-da', translation: 'Muchas gracias' },
    fr: { target: '정말 감사합니다', pronunciation: 'djeong-mal gam-sa-ham-ni-da', translation: 'Merci beaucoup' },
  },
  ja: {
    en: {
      target: 'ありがとうございます',
      pronunciation: 'a-ri-ga-tou go-za-i-ma-su',
      translation: 'Thank you very much',
    },
    ko: { target: 'ありがとうございます', pronunciation: '아리가토 고자이마스', translation: '정말 감사합니다' },
    zh: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-toh go-zai-ma-su', translation: '非常感谢' },
    es: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-sai-ma-su', translation: 'Muchas gracias' },
    fr: { target: 'ありがとうございます', pronunciation: 'a-ri-ga-tou go-zaï-ma-su', translation: 'Merci beaucoup' },
  },
  zh: {
    en: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Thank you very much',
    },
    ko: {
      target: '非常感谢',
      pronunciation: '페이창 간시에',
      translation: '정말 감사합니다',
    },
    ja: {
      target: '非常感谢',
      pronunciation: 'フェイチャン ガンシエ',
      translation: '本当にありがとうございます',
    },
    es: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Muchas gracias',
    },
    fr: {
      target: '非常感谢',
      pronunciation: 'fei-chang gan-xie',
      translation: 'Merci beaucoup',
    },
  },
  es: {
    en: { target: 'Muchas gracias', pronunciation: 'moo-chahs grah-see-ahs', translation: 'Thank you very much' },
    ko: { target: 'Muchas gracias', pronunciation: '무차스 그라시아스', translation: '정말 감사합니다' },
    ja: { target: 'Muchas gracias', pronunciation: 'ムーチャス グラシアス', translation: '本当にありがとうございます' },
    zh: { target: 'Muchas gracias', pronunciation: 'moo-chas gra-see-as', translation: '非常感谢' },
    fr: { target: 'Muchas gracias', pronunciation: 'moo-tchas gra-si-as', translation: 'Merci beaucoup' },
  },
  fr: {
    en: { target: 'Merci beaucoup', pronunciation: 'mehr-see boh-koo', translation: 'Thank you very much' },
    ko: { target: 'Merci beaucoup', pronunciation: '메르시 보쿠', translation: '정말 감사합니다' },
    ja: { target: 'Merci beaucoup', pronunciation: 'メルシー ボクー', translation: '本当にありがとうございます' },
    zh: { target: 'Merci beaucoup', pronunciation: 'mehr-see bo-koo', translation: '非常感谢' },
    es: { target: 'Merci beaucoup', pronunciation: 'mersi boku', translation: 'Muchas gracias' },
  },
};

// Get example for language pair, fallback to Japanese->English if not found
const getLanguageExample = (learningLang: string, nativeLang: string): ExamplePhrase | undefined => {
  return LANGUAGE_EXAMPLES[learningLang]?.[nativeLang] || LANGUAGE_EXAMPLES['ja']?.['en'];
};

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const { onboardingStatus, snapshot } = useAccountSession();
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<SetupStep>('start');

  // Initialize languages from user profile (from onboarding)
  const [languages, setLanguages] = useState<LanguageSettings>({
    learningLang: snapshot?.user.learningLang || settings.languages?.learningLang || '',
    nativeLang: snapshot?.user.nativeLang || settings.languages?.nativeLang || '',
  });
  const [selectedMode, setSelectedMode] = useState<'practice' | 'real' | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customScenario, setCustomScenario] = useState<string>('');
  const [proficiency, setProficiency] = useState<'cant_read' | 'can_read' | undefined>(
    (settings.proficiency as 'cant_read' | 'can_read' | undefined) || undefined
  );

  const isConnecting = status.value === 'connecting' || step === 'connecting';
  const glassMode = settings.glassMode ?? false;

  // Removed: Auto-start language selection moved to onboarding flow

  // Helper functions for conditional styling
  const getTextClass = (type: 'title' | 'subtitle' | 'body' | 'muted') => {
    if (glassMode) {
      switch (type) {
        case 'title':
          return 'text-white';
        case 'subtitle':
          return 'text-white/90';
        case 'body':
          return 'text-white/70';
        case 'muted':
          return 'text-white/60';
      }
    } else {
      switch (type) {
        case 'title':
          return 'text-foreground';
        case 'subtitle':
          return 'text-foreground';
        case 'body':
          return 'text-muted-foreground';
        case 'muted':
          return 'text-muted-foreground';
      }
    }
  };

  const getCardClass = () => {
    return glassMode
      ? 'backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/15 hover:border-white/30'
      : 'bg-card border border-border hover:bg-accent/50 hover:border-border';
  };

  const getScaleClass = () => {
    return glassMode ? 'hover:scale-105 active:scale-95' : 'hover:scale-[1.01] active:scale-[0.99]';
  };

  const getBackButtonClass = () => {
    return glassMode
      ? 'text-white/70 hover:text-white text-sm transition-colors'
      : 'text-muted-foreground hover:text-foreground text-sm transition-colors';
  };

  // Sync proficiency from settings
  useEffect(() => {
    if (settings.proficiency) {
      setProficiency(settings.proficiency as 'cant_read' | 'can_read');
    }
  }, [settings.proficiency]);

  // Sync languages from user profile when snapshot loads
  useEffect(() => {
    if (snapshot?.user.learningLang && snapshot?.user.nativeLang) {
      const userLanguages = {
        learningLang: snapshot.user.learningLang,
        nativeLang: snapshot.user.nativeLang,
      };
      setLanguages(userLanguages);
      // Also update settings
      updateSettings({ languages: userLanguages });
    }
  }, [snapshot, updateSettings]);

  // Reset step when disconnected
  useEffect(() => {
    console.log('[StartCall] Status effect triggered:', status.value);
    if (status.value === 'disconnected' || status.value === 'idle') {
      console.log('[StartCall] Resetting to start screen');
      setStep('start');
      // Keep languages from user profile
      if (snapshot?.user.learningLang && snapshot?.user.nativeLang) {
        setLanguages({
          learningLang: snapshot.user.learningLang,
          nativeLang: snapshot.user.nativeLang,
        });
      }
      setSelectedMode(null);
      setSelectedScenario('');
      setCustomScenario('');
      // Keep proficiency from settings, don't reset it
    }
  }, [status.value, snapshot]);

  const handleLanguageSelect = (type: 'learning' | 'native', code: string) => {
    const newLanguages = {
      ...languages,
      [type === 'learning' ? 'learningLang' : 'nativeLang']: code,
    };
    setLanguages(newLanguages);

    // Update settings
    updateSettings({ languages: newLanguages });
  };

  // Removed: Level completion logic moved to onboarding flow

  const handleModeSelect = (mode: 'practice' | 'real') => {
    setSelectedMode(mode);
    if (mode === 'practice') {
      setStep('scenario');
    } else {
      setStep('instructions');
    }
  };

  const handleScenarioSelect = (scenario: string) => {
    setSelectedScenario(scenario);
    // Just set the selection, don't navigate
  };

  const handleStartCall = async () => {
    // Build config
    const config: SessionConfig = {
      languages,
      mode: selectedMode!,
      scenario:
        selectedMode === 'practice'
          ? selectedScenario === 'custom'
            ? `custom:${customScenario}`
            : selectedScenario
          : undefined,
    };

    // Proceed with connection (onboarding should already be completed at this point)
    setStep('connecting');
    try {
      await connect(config);
    } catch {
      toast.error(t`Unable to start call`);
      setStep('instructions');
    }
  };

  // Redirect to onboarding if not completed
  if (onboardingStatus !== null && !onboardingStatus.completed) {
    const lang = pathname.split('/')[1] || 'en';
    router.push(`/${lang}/onboarding`);
    return null;
  }

  // Debug: Log when StartCall UI should show
  const shouldShow = status.value === 'idle' || status.value === 'connecting' || status.value === 'disconnected';
  console.log('[StartCall] Should show UI:', shouldShow, 'status:', status.value);

  return (
    <AnimatePresence>
      {shouldShow ? (
        <motion.div
          key="overlay"
          ref={containerRef}
          className={'fixed inset-0 p-3 sm:p-4 flex items-center justify-center bg-background'}
          style={
            glassMode
              ? {
                  backgroundImage: 'url(/background.png)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : undefined
          }
          initial="initial"
          animate="enter"
          exit="exit"
          variants={{
            initial: { opacity: 0 },
            enter: { opacity: 1 },
            exit: { opacity: 0 },
          }}
        >
          {/* Start Call Button */}
          {step === 'start' && (
            <>
              <div className={'flex flex-col items-center gap-3'}>
                {glassMode ? (
                  <LiquidGlass
                    mouseContainer={containerRef}
                    className={'z-50'}
                    onClick={() => setStep('mode')}
                    style={{ position: 'fixed', top: '50%', left: '50%' }}
                    displacementScale={64}
                    blurAmount={0.2}
                    saturation={130}
                    aberrationIntensity={2}
                    elasticity={0.35}
                    cornerRadius={100}
                    padding="16px 32px"
                  >
                    <div className={'flex items-center gap-2 min-w-[140px] justify-center'}>
                      <Phone className={'size-4 text-green-400'} />
                      <span className="text-white font-medium whitespace-nowrap">
                        <Trans>Start Call</Trans>
                      </span>
                    </div>
                  </LiquidGlass>
                ) : (
                  <motion.div
                    variants={{
                      initial: { scale: 0.5 },
                      enter: { scale: 1 },
                      exit: { scale: 0.5 },
                    }}
                  >
                    <Button className={'z-50 flex items-center gap-1.5 rounded-full'} onClick={() => setStep('mode')}>
                      <span>
                        <Phone className={'size-4 opacity-50 fill-current'} strokeWidth={0} />
                      </span>
                      <span>
                        <Trans>Start Call</Trans>
                      </span>
                    </Button>
                  </motion.div>
                )}
              </div>
            </>
          )}

          {/* Removed: Language and Level selection moved to onboarding */}

          {/* Mode Selection */}
          {step === 'mode' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-6 sm:gap-8 px-1.5'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  <Trans>How would you like to use Glass?</Trans>
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  <Trans>Choose your preferred mode</Trans>
                </p>
              </div>

              <div className={'flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start'}>
                <button
                  onClick={() => handleModeSelect('practice')}
                  className={cn(
                    'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
                    getCardClass(),
                    getScaleClass()
                  )}
                >
                  <div className={'flex flex-col items-center gap-3'}>
                    <img
                      src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80"
                      alt="Practice person"
                      className={'h-[24px] w-[24px] sm:h-[28px] sm:w-[28px] object-cover rounded-full'}
                    />
                    <div className={'text-center'}>
                      <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                        <Trans>Practice</Trans>
                      </div>
                      <div className={`${getTextClass('body')} text-xs`}>
                        <Trans>Tutorial with AI</Trans>
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect('real')}
                  className={cn(
                    'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0 relative',
                    getCardClass(),
                    getScaleClass(),
                    // Disable interactions and subtly dim on mobile
                    'pointer-events-none opacity-60 sm:pointer-events-auto sm:opacity-100'
                  )}
                >
                  {/* Recommended Badge */}
                  <div
                    className={
                      'absolute -top-2 -right-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold shadow-lg'
                    }
                  >
                    <Trans>RECOMMENDED</Trans>
                  </div>

                  <div className={'flex flex-col items-center gap-3'}>
                    {/* Call platform logos */}
                    <div className={'flex gap-2 items-center justify-center'}>
                      <svg
                        className={'h-6 w-6 opacity-80'}
                        viewBox="0 0 71 55"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
                          fill="#5865F2"
                        />
                      </svg>
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg"
                        alt="Zoom"
                        className={'h-6 w-6 object-contain opacity-80'}
                      />
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg"
                        alt="Google Meet"
                        className={'h-6 w-6 object-contain opacity-80'}
                      />
                      <img
                        src="https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg"
                        alt="Microsoft Teams"
                        className={'h-6 w-6 object-contain opacity-80'}
                      />
                    </div>
                    <div className={'text-center'}>
                      <div className={`${getTextClass('title')} font-medium mb-1 text-base`}>
                        <Trans>Real Talk</Trans>
                      </div>
                      <div className={`${getTextClass('body')} text-xs`}>
                        <Trans>Language Exchange • Calls</Trans>
                      </div>
                      {/* Mobile unavailability notice */}
                      <div
                        className={
                          'sm:hidden inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-1 rounded-full border ' +
                          (glassMode ? 'border-white/30 text-white/70' : 'border-border text-muted-foreground')
                        }
                      >
                        <span className={'leading-none text-xs'}>
                          <Trans>Unavailable on mobile</Trans>
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button onClick={() => setStep('start')} className={getBackButtonClass()}>
                  <Trans>← Back</Trans>
                </button>
                <Button
                  onClick={() => setStep(selectedMode === 'practice' ? 'scenario' : 'instructions')}
                  disabled={!selectedMode}
                  variant={glassMode ? 'translucent' : 'default'}
                  size="sm"
                  className={cn('text-sm', !selectedMode && 'opacity-50 cursor-not-allowed')}
                >
                  <Trans>Next →</Trans>
                </Button>
              </div>
            </motion.div>
          )}

          {/* Scenario Selection (Practice Mode Only) */}
          {step === 'scenario' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  <Trans>Choose a scenario</Trans>
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  <Trans>What would you like to practice?</Trans>
                </p>
              </div>

              <div className={'grid grid-cols-2 gap-3.5 sm:gap-4 w-full'}>
                {[
                  { id: 'casual', emoji: '💬' },
                  { id: 'restaurant', emoji: '🍽️' },
                  { id: 'interview', emoji: '💼' },
                  { id: 'phone', emoji: '📞' },
                ].map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => handleScenarioSelect(scenario.id)}
                    className={cn(
                      'px-3 py-2.5 sm:px-6 sm:py-4 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                      getCardClass(),
                      getScaleClass(),
                      selectedScenario === scenario.id &&
                        (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent border-foreground/30')
                    )}
                  >
                    <div className={'flex items-start gap-2 sm:gap-3'}>
                      <span className={'text-lg sm:text-2xl'}>{scenario.emoji}</span>
                      <div>
                        <div className={`${getTextClass('title')} font-medium mb-0.5 text-sm sm:text-base`}>
                          {scenario.id === 'casual' && <Trans>Casual Chat</Trans>}
                          {scenario.id === 'restaurant' && <Trans>Restaurant</Trans>}
                          {scenario.id === 'interview' && <Trans>Job Interview</Trans>}
                          {scenario.id === 'phone' && <Trans>Phone Call</Trans>}
                        </div>
                        <div className={`${getTextClass('muted')} text-xs`}>
                          {scenario.id === 'casual' && <Trans>Everyday conversation</Trans>}
                          {scenario.id === 'restaurant' && <Trans>Ordering food & drinks</Trans>}
                          {scenario.id === 'interview' && <Trans>Professional conversation</Trans>}
                          {scenario.id === 'phone' && <Trans>Telephone etiquette</Trans>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom Scenario */}
              <div className={'w-full'}>
                <button
                  onClick={() => handleScenarioSelect('custom')}
                  className={cn(
                    'w-full px-3 py-2.5 sm:px-6 sm:py-4 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2',
                    getCardClass(),
                    getScaleClass(),
                    selectedScenario === 'custom' &&
                      (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent border-foreground/30')
                  )}
                >
                  <div className={'flex items-center gap-3'}>
                    <span className={'text-lg sm:text-2xl'}>✨</span>
                    <div className={'text-left'}>
                      <div className={`${getTextClass('title')} font-medium mb-0.5 text-sm sm:text-base`}>
                        <Trans>Custom Scenario</Trans>
                      </div>
                      <div className={`${getTextClass('muted')} text-xs`}>
                        <Trans>Describe your own situation</Trans>
                      </div>
                    </div>
                  </div>
                </button>

                {selectedScenario === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={'mt-3'}
                  >
                    <textarea
                      value={customScenario}
                      onChange={(e) => setCustomScenario(e.target.value)}
                      placeholder={t`Describe the scenario you want to practice...`}
                      className={cn(
                        'w-full px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-lg resize-none focus:outline-none text-sm',
                        glassMode
                          ? 'backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:border-white/40'
                          : 'bg-background border border-input text-foreground placeholder:text-muted-foreground focus:border-ring'
                      )}
                      rows={3}
                    />
                  </motion.div>
                )}
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button onClick={() => setStep('mode')} className={getBackButtonClass()}>
                  <Trans>← Back</Trans>
                </button>
                <Button
                  onClick={handleStartCall}
                  disabled={!selectedScenario || (selectedScenario === 'custom' && !customScenario.trim())}
                  variant={glassMode ? 'translucent' : 'default'}
                  className={cn(
                    'rounded-full px-6 py-2 sm:px-8 sm:py-2.5',
                    (!selectedScenario || (selectedScenario === 'custom' && !customScenario.trim())) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Trans>Start</Trans>
                </Button>
              </div>
            </motion.div>
          )}

          {/* Instructions Screen */}
          {step === 'instructions' && selectedMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-5 sm:gap-6 max-w-lg mx-auto px-1.5'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  {selectedMode === 'practice' ? <Trans>Practice Mode</Trans> : <Trans>Real Talk Mode</Trans>}
                </h2>
              </div>

              <div
                className={cn(
                  'rounded-2xl p-4 sm:p-6',
                  glassMode ? 'bg-white/10 backdrop-blur-sm border border-white/20' : 'bg-card border border-border'
                )}
              >
                {selectedMode === 'practice' ? (
                  <div className={getTextClass('title')}>
                    {selectedScenario === 'custom' && customScenario ? (
                      <div>
                        <p className={`text-xs ${getTextClass('muted')} mb-1.5 sm:mb-2`}>
                          <Trans>Scenario:</Trans>
                        </p>
                        <p className={'text-sm'}>{customScenario}</p>
                      </div>
                    ) : selectedScenario ? (
                      <div>
                        <p className={`text-xs ${getTextClass('muted')} mb-1.5 sm:mb-2`}>
                          <Trans>Scenario:</Trans>
                        </p>
                        <p className={'text-base font-medium'}>
                          {selectedScenario === 'airport' && (
                            <>
                              ✈️ <Trans>Airport Check-in</Trans>
                            </>
                          )}
                          {selectedScenario === 'restaurant' && (
                            <>
                              🍽️ <Trans>Restaurant</Trans>
                            </>
                          )}
                          {selectedScenario === 'interview' && (
                            <>
                              💼 <Trans>Job Interview</Trans>
                            </>
                          )}
                          {selectedScenario === 'shopping' && (
                            <>
                              🛍️ <Trans>Shopping</Trans>
                            </>
                          )}
                          {selectedScenario === 'casual' && (
                            <>
                              💬 <Trans>Casual Chat</Trans>
                            </>
                          )}
                          {selectedScenario === 'phone' && (
                            <>
                              📞 <Trans>Phone Call</Trans>
                            </>
                          )}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={cn(getTextClass('title'), 'space-y-3')}>
                    <p className={'text-base leading-relaxed font-medium mb-2.5 sm:mb-3'}>
                      <Trans>Follow these steps:</Trans>
                    </p>
                    <div className={cn('text-sm space-y-2.5', getTextClass('subtitle'))}>
                      <p>
                        <Trans>1. Join a Discord voice chat or online call</Trans>
                      </p>
                      <p>
                        <Trans>2. Click "Start" below</Trans>
                      </p>
                      <div className={'space-y-1.5'}>
                        <p>
                          <Trans>3. Share your tab or screen with audio:</Trans>
                        </p>
                        <div className={'pl-3 space-y-1 text-xs'}>
                          <p className={getTextClass('body')}>
                            <Trans>• Browser tab → Enable "Share tab audio"</Trans>
                          </p>
                          <p className={getTextClass('body')}>
                            <Trans>• Desktop app → Enable "Share system audio"</Trans>
                          </p>
                        </div>
                      </div>
                      <p>
                        <Trans>4. Start talking and let Glass assist you</Trans>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button onClick={() => setStep('mode')} className={getBackButtonClass()}>
                  <Trans>← Back</Trans>
                </button>
                <Button
                  variant={glassMode ? 'translucent' : 'default'}
                  onClick={handleStartCall}
                  className={'rounded-full px-6 py-2 sm:px-8 sm:py-2.5'}
                >
                  <Trans>Start</Trans>
                </Button>
              </div>
            </motion.div>
          )}

          {/* Connecting State */}
          {step === 'connecting' && (
            <>
              {glassMode ? (
                <LiquidGlass
                  mouseContainer={containerRef}
                  className={'z-50'}
                  style={{ position: 'fixed', top: '50%', left: '50%' }}
                  displacementScale={64}
                  blurAmount={0.1}
                  saturation={130}
                  aberrationIntensity={2}
                  cornerRadius={100}
                  padding="16px 32px"
                >
                  <div className={'flex items-center gap-2 min-w-[140px] justify-center'}>
                    <Loader2 className={'size-4 opacity-50 animate-spin'} />
                    <span className="text-white font-medium whitespace-nowrap">
                      <Trans>Connecting...</Trans>
                    </span>
                  </div>
                </LiquidGlass>
              ) : (
                <motion.div initial={false} animate={{ scale: 1 }} exit={{ scale: 1 }}>
                  <Button
                    className={'z-50 flex items-center gap-1.5 rounded-full px-6 py-2 sm:px-8 sm:py-2.5 min-w-[140px]'}
                    disabled
                  >
                    <Loader2 className={'size-4 opacity-50 animate-spin'} />
                    <span>
                      <Trans>Connecting...</Trans>
                    </span>
                  </Button>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
