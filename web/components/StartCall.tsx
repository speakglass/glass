import {
  useGlass,
  LanguageSettings,
  SessionConfig,
} from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone } from 'lucide-react';
import WaitlistModal from '@/components/WaitlistModal';
import LiquidGlass from './LiquidGlass';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/utils';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

type SetupStep =
  | 'start'
  | 'languages'
  | 'level'
  | 'mode'
  | 'scenario'
  | 'instructions'
  | 'connecting';

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

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

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
    zh: {
      target: 'Thank you very much',
      pronunciation: 'seng-kyou be-li ma-chi',
      translation: '非常感谢',
    },
    es: {
      target: 'Thank you very much',
      pronunciation: 'zenk yu beri mach',
      translation: 'Muchas gracias',
    },
    fr: {
      target: 'Thank you very much',
      pronunciation: 'sank iou vèri meutch',
      translation: 'Merci beaucoup',
    },
  },
  ko: {
    en: {
      target: '정말 감사합니다',
      pronunciation: 'jeongmal gamsahamnida',
      translation: 'Thank you very much',
    },
    ja: {
      target: '정말 감사합니다',
      pronunciation: 'チョンマル カムサハムニダ',
      translation: '本当にありがとうございます',
    },
    zh: {
      target: '정말 감사합니다',
      pronunciation: 'jeong-ma-er kam-sa-ha-mu-ni-da',
      translation: '非常感谢',
    },
    es: {
      target: '정말 감사합니다',
      pronunciation: 'jeongmal gamsahamnida',
      translation: 'Muchas gracias',
    },
    fr: {
      target: '정말 감사합니다',
      pronunciation: 'jeongmal gamsahamnida',
      translation: 'Merci beaucoup',
    },
  },
  ja: {
    en: {
      target: 'ありがとうございます',
      pronunciation: 'arigatou gozaimasu',
      translation: 'Thank you very much',
    },
    ko: {
      target: 'ありがとうございます',
      pronunciation: '아리가토 고자이마스',
      translation: '정말 감사합니다',
    },
    zh: {
      target: 'ありがとうございます',
      pronunciation: 'a-li-ga-tou go-za-i-ma-su',
      translation: '非常感谢',
    },
    es: {
      target: 'ありがとうございます',
      pronunciation: 'arigatou gozaimasu',
      translation: 'Muchas gracias',
    },
    fr: {
      target: 'ありがとうございます',
      pronunciation: 'arigatou gozaimasu',
      translation: 'Merci beaucoup',
    },
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
    en: {
      target: 'Muchas gracias',
      pronunciation: 'moo-chahs grah-see-ahs',
      translation: 'Thank you very much',
    },
    ko: {
      target: 'Muchas gracias',
      pronunciation: '무차스 그라시아스',
      translation: '정말 감사합니다',
    },
    ja: {
      target: 'Muchas gracias',
      pronunciation: 'ムーチャス グラシアス',
      translation: '本当にありがとうございます',
    },
    zh: {
      target: 'Muchas gracias',
      pronunciation: 'mu-cha-si ge-la-xi-ya-si',
      translation: '非常感谢',
    },
    fr: { target: 'Muchas gracias', translation: 'Merci beaucoup' },
  },
  fr: {
    en: {
      target: 'Merci beaucoup',
      pronunciation: 'mehr-see boh-koo',
      translation: 'Thank you very much',
    },
    ko: {
      target: 'Merci beaucoup',
      pronunciation: '메르시 보쿠',
      translation: '정말 감사합니다',
    },
    ja: {
      target: 'Merci beaucoup',
      pronunciation: 'メルシー ボクー',
      translation: '本当にありがとうございます',
    },
    zh: {
      target: 'Merci beaucoup',
      pronunciation: 'mei-er-xi bo-ku',
      translation: '非常感谢',
    },
    es: { target: 'Merci beaucoup', translation: 'Muchas gracias' },
  },
};

// Get example for language pair, fallback to Japanese->English if not found
const getLanguageExample = (
  learningLang: string,
  nativeLang: string
): ExamplePhrase | undefined => {
  return (
    LANGUAGE_EXAMPLES[learningLang]?.[nativeLang] ||
    LANGUAGE_EXAMPLES['ja']?.['en']
  );
};

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<SetupStep>('start');
  const [languages, setLanguages] = useState<LanguageSettings>({
    learningLang: '',
    nativeLang: '',
  });
  const [selectedMode, setSelectedMode] = useState<'practice' | 'real' | null>(
    null
  );
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customScenario, setCustomScenario] = useState<string>('');
  // Global waitlist modal trigger
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistSessionId, setWaitlistSessionId] = useState('');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { sessionId?: string }
        | undefined;
      setWaitlistSessionId(detail?.sessionId || '');
      setShowWaitlistModal(true);
    };
    window.addEventListener('glass:open-waitlist', handler as EventListener);
    return () =>
      window.removeEventListener(
        'glass:open-waitlist',
        handler as EventListener
      );
  }, []);
  const [proficiency, setProficiency] = useState<'cant_read' | 'can_read' | ''>(
    (settings.proficiency as 'cant_read' | 'can_read' | undefined) ||
      'cant_read'
  );

  const isConnecting = status.value === 'connecting' || step === 'connecting';
  const glassMode = settings.glassMode ?? false;

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

  const getSelectedRingClass = () => {
    return glassMode
      ? 'ring-2 ring-white/50'
      : 'border-foreground/30 ring-1 ring-foreground/20';
  };

  const getScaleClass = () => {
    return glassMode
      ? 'hover:scale-105 active:scale-95'
      : 'hover:scale-[1.01] active:scale-[0.99]';
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

  // Reset step when disconnected
  useEffect(() => {
    if (status.value === 'disconnected' || status.value === 'idle') {
      setStep('start');
      setLanguages({ learningLang: '', nativeLang: '' });
      setSelectedMode(null);
      setSelectedScenario('');
      setCustomScenario('');
      // Keep proficiency from settings, don't reset it
    }
  }, [status.value]);

  const handleLanguageSelect = (type: 'learning' | 'native', code: string) => {
    const wasComplete = languages.learningLang && languages.nativeLang;
    const newLanguages = {
      ...languages,
      [type === 'learning' ? 'learningLang' : 'nativeLang']: code,
    };
    setLanguages(newLanguages);

    // Auto-advance only when both languages are selected for the first time
    // If already complete, user must click Next to proceed
    if (newLanguages.learningLang && newLanguages.nativeLang && !wasComplete) {
      setTimeout(() => setStep('level'), 300);
    }
  };

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
    // Check if user has seen onboarding
    const hasSeenOnboarding =
      typeof window !== 'undefined'
        ? localStorage.getItem('glass_onboarding_completed') === 'true'
        : false;

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

    if (!hasSeenOnboarding) {
      // Save config to localStorage and redirect to onboarding page
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'glass_pending_session_config',
          JSON.stringify(config)
        );
      }
      router.push('/onboarding');
      return;
    }

    // Proceed with connection
    setStep('connecting');
    try {
      await connect(config);
    } catch {
      toast.error(t`Unable to start call`);
      setStep('instructions');
    }
  };

  return (
    <AnimatePresence>
      {status.value === 'idle' ||
      status.value === 'connecting' ||
      status.value === 'disconnected' ? (
        <motion.div
          key="overlay"
          ref={containerRef}
          className={
            'fixed inset-0 p-3 sm:p-4 flex items-center justify-center bg-background'
          }
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
                    onClick={() => setStep('languages')}
                    style={{ position: 'fixed', top: '50%', left: '50%' }}
                    displacementScale={64}
                    blurAmount={0.2}
                    saturation={130}
                    aberrationIntensity={2}
                    elasticity={0.35}
                    cornerRadius={100}
                    padding="16px 32px"
                  >
                    <div
                      className={
                        'flex items-center gap-2 min-w-[140px] justify-center'
                      }
                    >
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
                    <Button
                      className={'z-50 flex items-center gap-1.5 rounded-full'}
                      onClick={() => setStep('languages')}
                    >
                      <span>
                        <Phone
                          className={'size-4 opacity-50 fill-current'}
                          strokeWidth={0}
                        />
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

          {/* Level (Reading ability) Selection */}
          {step === 'level' &&
            (() => {
              const phrase = getLanguageExample(
                languages.learningLang,
                languages.nativeLang
              );

              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={'flex flex-col items-center gap-6 sm:gap-8 px-1.5'}
                >
                  <div className={'text-center'}>
                    <h2
                      className={`${getTextClass(
                        'title'
                      )} text-2xl font-medium mb-2`}
                    >
                      <Trans>Do you want pronunciation help?</Trans>
                    </h2>
                    <p className={`${getTextClass('body')} text-sm`}>
                      <Trans>
                        We'll show how to read suggestions in your alphabet when
                        helpful
                      </Trans>
                    </p>
                  </div>
                  <div
                    className={
                      'flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start'
                    }
                  >
                    <button
                      onClick={() => {
                        setProficiency('cant_read');
                        updateSettings({ proficiency: 'cant_read' });
                        setStep('mode');
                      }}
                      className={cn(
                        'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
                        getCardClass(),
                        getScaleClass(),
                        proficiency === 'cant_read' && getSelectedRingClass()
                      )}
                    >
                      <div className={'flex flex-col gap-3'}>
                        <div className={'text-center'}>
                          <div
                            className={`${getTextClass(
                              'title'
                            )} font-medium mb-1 text-base`}
                          >
                            <Trans>Yes, show pronunciation</Trans>
                          </div>
                          <div className={`${getTextClass('body')} text-xs`}>
                            <Trans>Make suggestions readable for me</Trans>
                          </div>
                        </div>
                        <div className={'mt-auto'}>
                          <div
                            className={cn(
                              'rounded-md px-3 py-2 text-left',
                              glassMode
                                ? 'bg-white/5 border border-white/10'
                                : 'bg-muted border border-border'
                            )}
                          >
                            <div
                              className={`${getTextClass(
                                'title'
                              )} text-sm leading-snug`}
                            >
                              {phrase?.target || 'Example phrase'}
                            </div>
                            {phrase?.pronunciation && (
                              <div
                                className={
                                  'text-emerald-400 opacity-80 text-sm mt-0.5'
                                }
                              >
                                {phrase.pronunciation}
                              </div>
                            )}
                            {phrase?.translation && (
                              <div
                                className={`${getTextClass(
                                  'muted'
                                )} text-xs mt-1`}
                              >
                                {phrase.translation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setProficiency('can_read');
                        updateSettings({ proficiency: 'can_read' });
                        setStep('mode');
                      }}
                      className={cn(
                        'px-5 py-4 sm:px-8 sm:py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-full sm:w-[280px] max-w-[360px] sm:max-w-none mx-auto sm:mx-0',
                        getCardClass(),
                        getScaleClass(),
                        proficiency === 'can_read' && getSelectedRingClass()
                      )}
                    >
                      <div className={'flex flex-col gap-3'}>
                        <div className={'text-center'}>
                          <div
                            className={`${getTextClass(
                              'title'
                            )} font-medium mb-1 text-base`}
                          >
                            <Trans>No, I'm fine</Trans>
                          </div>
                          <div className={`${getTextClass('body')} text-xs`}>
                            <Trans>Show suggestions only</Trans>
                          </div>
                        </div>
                        <div className={'mt-auto'}>
                          <div
                            className={cn(
                              'rounded-md px-3 py-2 text-left',
                              glassMode
                                ? 'bg-white/5 border border-white/10'
                                : 'bg-muted border border-border'
                            )}
                          >
                            <div
                              className={`${getTextClass(
                                'title'
                              )} text-sm leading-snug`}
                            >
                              {phrase?.target || 'Example phrase'}
                            </div>
                            {phrase?.translation && (
                              <div
                                className={`${getTextClass(
                                  'muted'
                                )} text-xs mt-1`}
                              >
                                {phrase.translation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className={'flex justify-between items-center w-full'}>
                    <button
                      onClick={() => setStep('languages')}
                      className={getBackButtonClass()}
                    >
                      <Trans>← Back</Trans>
                    </button>
                    <Button
                      onClick={() => setStep('mode')}
                      disabled={!proficiency}
                      variant={glassMode ? 'ghost' : 'ghost'}
                      size="sm"
                      className={cn(
                        'text-sm',
                        !proficiency && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Trans>Next →</Trans>
                    </Button>
                  </div>
                </motion.div>
              );
            })()}
          {step === 'languages' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={
                'flex flex-col items-center gap-6 sm:gap-8 max-w-2xl mx-auto px-1.5'
              }
            >
              <div className={'text-center'}>
                <h2
                  className={`${getTextClass(
                    'title'
                  )} text-2xl font-medium mb-2`}
                >
                  <Trans>Choose Your Languages</Trans>
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  <Trans>Select the language you want to practice</Trans>
                </p>
              </div>

              <div className={'flex flex-col gap-5 sm:gap-6 w-full'}>
                {/* Learning Language */}
                <div className={'flex flex-col gap-3'}>
                  <p
                    className={`${getTextClass(
                      'subtitle'
                    )} text-sm font-medium text-center`}
                  >
                    <Trans>I want to learn</Trans>
                  </p>
                  <div
                    className={'flex gap-1.5 sm:gap-2 flex-wrap justify-center'}
                  >
                    {LANGUAGES.map((lang) => (
                      <Button
                        key={`learn-${lang.code}`}
                        variant={glassMode ? 'translucent' : 'outline'}
                        size="sm"
                        className={cn(
                          'rounded-full focus-visible:ring-2 transition-all',
                          getScaleClass(),
                          languages.learningLang === lang.code
                            ? glassMode
                              ? 'scale-105 bg-white/20 border-white/40 ring-2 ring-white/50'
                              : 'bg-accent border-foreground/30 ring-1 ring-foreground/20 text-foreground dark:bg-primary/10 dark:text-primary'
                            : 'opacity-90 hover:opacity-100'
                        )}
                        onClick={() =>
                          handleLanguageSelect('learning', lang.code)
                        }
                      >
                        <span className={'text-lg'}>{lang.flag}</span>
                        <span className={'font-medium text-sm'}>
                          {lang.name}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Native Language */}
                <div className={'flex flex-col gap-3'}>
                  <p
                    className={`${getTextClass(
                      'subtitle'
                    )} text-sm font-medium text-center`}
                  >
                    <Trans>I speak</Trans>
                  </p>
                  <div
                    className={'flex gap-1.5 sm:gap-2 flex-wrap justify-center'}
                  >
                    {LANGUAGES.map((lang) => {
                      const isDisabled = languages.learningLang === lang.code;
                      return (
                        <Button
                          key={`native-${lang.code}`}
                          variant={glassMode ? 'translucent' : 'outline'}
                          size="sm"
                          disabled={isDisabled}
                          className={cn(
                            'rounded-full focus-visible:ring-2 transition-all',
                            !isDisabled && getScaleClass(),
                            languages.nativeLang === lang.code
                              ? glassMode
                                ? 'scale-105 bg-white/20 border-white/40 ring-2 ring-white/50'
                                : 'bg-accent border-foreground/30 ring-1 ring-foreground/20 text-foreground dark:bg-primary/10 dark:text-primary'
                              : isDisabled
                              ? 'opacity-40 cursor-not-allowed'
                              : 'opacity-90 hover:opacity-100'
                          )}
                          onClick={() =>
                            !isDisabled &&
                            handleLanguageSelect('native', lang.code)
                          }
                        >
                          <span className={'text-lg'}>{lang.flag}</span>
                          <span className={'font-medium text-sm'}>
                            {lang.name}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button
                  onClick={() => setStep('start')}
                  className={getBackButtonClass()}
                >
                  <Trans>← Back</Trans>
                </button>
                <Button
                  onClick={() => setStep('level')}
                  disabled={!languages.learningLang || !languages.nativeLang}
                  variant={glassMode ? 'ghost' : 'ghost'}
                  size="sm"
                  className={cn(
                    'text-sm',
                    (!languages.learningLang || !languages.nativeLang) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Trans>Next →</Trans>
                </Button>
              </div>
            </motion.div>
          )}

          {/* Mode Selection */}
          {step === 'mode' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-6 sm:gap-8 px-1.5'}
            >
              <div className={'text-center'}>
                <h2
                  className={`${getTextClass(
                    'title'
                  )} text-2xl font-medium mb-2`}
                >
                  <Trans>How would you like to use Glass?</Trans>
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  <Trans>Choose your preferred mode</Trans>
                </p>
              </div>

              <div
                className={
                  'flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-start'
                }
              >
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
                      className={
                        'h-[24px] w-[24px] sm:h-[28px] sm:w-[28px] object-cover rounded-full'
                      }
                    />
                    <div className={'text-center'}>
                      <div
                        className={`${getTextClass(
                          'title'
                        )} font-medium mb-1 text-base`}
                      >
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
                    {/* Meeting platform logos */}
                    <div className={'flex gap-3 items-center justify-center'}>
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg"
                        alt="Zoom"
                        className={'h-7 w-7 object-contain opacity-80'}
                      />
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/9/9b/Google_Meet_icon_%282020%29.svg"
                        alt="Google Meet"
                        className={'h-7 w-7 object-contain opacity-80'}
                      />
                      <img
                        src="https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg"
                        alt="Microsoft Teams"
                        className={'h-7 w-7 object-contain opacity-80'}
                      />
                    </div>
                    <div className={'text-center'}>
                      <div
                        className={`${getTextClass(
                          'title'
                        )} font-medium mb-1 text-base`}
                      >
                        <Trans>Real Talk</Trans>
                      </div>
                      <div className={`${getTextClass('body')} text-xs`}>
                        <Trans>Language Exchange • Meetings</Trans>
                      </div>
                      {/* Mobile unavailability notice */}
                      <div
                        className={
                          'sm:hidden inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-1 rounded-full border ' +
                          (glassMode
                            ? 'border-white/30 text-white/70'
                            : 'border-border text-muted-foreground')
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
                <button
                  onClick={() => setStep('level')}
                  className={getBackButtonClass()}
                >
                  <Trans>← Back</Trans>
                </button>
                <Button
                  onClick={() =>
                    setStep(
                      selectedMode === 'practice' ? 'scenario' : 'instructions'
                    )
                  }
                  disabled={!selectedMode}
                  variant={glassMode ? 'ghost' : 'ghost'}
                  size="sm"
                  className={cn(
                    'text-sm',
                    !selectedMode && 'opacity-50 cursor-not-allowed'
                  )}
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
              className={
                'flex flex-col items-center gap-5 sm:gap-6 max-w-2xl mx-auto px-1.5'
              }
            >
              <div className={'text-center'}>
                <h2
                  className={`${getTextClass(
                    'title'
                  )} text-2xl font-medium mb-2`}
                >
                  <Trans>Choose a scenario</Trans>
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  <Trans>What would you like to practice?</Trans>
                </p>
              </div>

              <div className={'grid grid-cols-2 gap-3.5 sm:gap-4 w-full'}>
                {[
                  {
                    id: 'casual',
                    emoji: '💬',
                    title: t`Casual Chat`,
                    desc: t`Everyday conversation`,
                  },
                  {
                    id: 'airport',
                    emoji: '✈️',
                    title: t`Airport Check-in`,
                    desc: t`Travel & Immigration`,
                  },
                  {
                    id: 'restaurant',
                    emoji: '🍽️',
                    title: t`Restaurant`,
                    desc: t`Ordering food & drinks`,
                  },
                  {
                    id: 'interview',
                    emoji: '💼',
                    title: t`Job Interview`,
                    desc: t`Professional conversation`,
                  },
                  {
                    id: 'shopping',
                    emoji: '🛍️',
                    title: t`Shopping`,
                    desc: t`Retail & bargaining`,
                  },
                  {
                    id: 'phone',
                    emoji: '📞',
                    title: t`Phone Call`,
                    desc: t`Telephone etiquette`,
                  },
                ].map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => handleScenarioSelect(scenario.id)}
                    className={cn(
                      'px-3 py-2.5 sm:px-6 sm:py-4 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                      getCardClass(),
                      getScaleClass(),
                      selectedScenario === scenario.id &&
                        (glassMode
                          ? 'bg-white/20 border-white/40'
                          : 'bg-accent border-foreground/30')
                    )}
                  >
                    <div className={'flex items-start gap-2 sm:gap-3'}>
                      <span className={'text-lg sm:text-2xl'}>
                        {scenario.emoji}
                      </span>
                      <div>
                        <div
                          className={`${getTextClass(
                            'title'
                          )} font-medium mb-0.5 text-sm sm:text-base`}
                        >
                          {scenario.title}
                        </div>
                        <div className={`${getTextClass('muted')} text-xs`}>
                          {scenario.desc}
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
                      (glassMode
                        ? 'bg-white/20 border-white/40'
                        : 'bg-accent border-foreground/30')
                  )}
                >
                  <div className={'flex items-center gap-3'}>
                    <span className={'text-lg sm:text-2xl'}>✨</span>
                    <div className={'text-left'}>
                      <div
                        className={`${getTextClass(
                          'title'
                        )} font-medium mb-0.5 text-sm sm:text-base`}
                      >
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
                <button
                  onClick={() => setStep('mode')}
                  className={getBackButtonClass()}
                >
                  <Trans>← Back</Trans>
                </button>
                <Button
                  onClick={handleStartCall}
                  disabled={
                    !selectedScenario ||
                    (selectedScenario === 'custom' && !customScenario.trim())
                  }
                  variant={glassMode ? 'translucent' : 'default'}
                  className={cn(
                    'rounded-full px-6 py-2 sm:px-8 sm:py-2.5',
                    (!selectedScenario ||
                      (selectedScenario === 'custom' &&
                        !customScenario.trim())) &&
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
              className={
                'flex flex-col items-center gap-5 sm:gap-6 max-w-lg mx-auto px-1.5'
              }
            >
              <div className={'text-center'}>
                <h2
                  className={`${getTextClass(
                    'title'
                  )} text-2xl font-medium mb-2`}
                >
                  {selectedMode === 'practice' ? (
                    <Trans>Practice Mode</Trans>
                  ) : (
                    <Trans>Real Talk Mode</Trans>
                  )}
                </h2>
              </div>

              <div
                className={cn(
                  'rounded-2xl p-4 sm:p-6',
                  glassMode
                    ? 'bg-white/10 backdrop-blur-sm border border-white/20'
                    : 'bg-card border border-border'
                )}
              >
                {selectedMode === 'practice' ? (
                  <div className={getTextClass('title')}>
                    {selectedScenario === 'custom' && customScenario ? (
                      <div>
                        <p
                          className={`text-xs ${getTextClass(
                            'muted'
                          )} mb-1.5 sm:mb-2`}
                        >
                          <Trans>Scenario:</Trans>
                        </p>
                        <p className={'text-sm'}>{customScenario}</p>
                      </div>
                    ) : selectedScenario ? (
                      <div>
                        <p
                          className={`text-xs ${getTextClass(
                            'muted'
                          )} mb-1.5 sm:mb-2`}
                        >
                          <Trans>Scenario:</Trans>
                        </p>
                        <p className={'text-base font-medium'}>
                          {selectedScenario === 'airport' &&
                            '✈️ Airport Check-in'}
                          {selectedScenario === 'restaurant' && '🍽️ Restaurant'}
                          {selectedScenario === 'interview' &&
                            '💼 Job Interview'}
                          {selectedScenario === 'shopping' && '🛍️ Shopping'}
                          {selectedScenario === 'casual' && '💬 Casual Chat'}
                          {selectedScenario === 'phone' && '📞 Phone Call'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={cn(getTextClass('title'), 'space-y-3')}>
                    <p
                      className={
                        'text-base leading-relaxed font-medium mb-2.5 sm:mb-3'
                      }
                    >
                      <Trans>Follow these steps:</Trans>
                    </p>
                    <div
                      className={cn(
                        'text-sm space-y-2',
                        getTextClass('subtitle')
                      )}
                    >
                      <p>
                        <Trans>
                          1. Open your meeting (Zoom, Google Meet, or Teams)
                        </Trans>
                      </p>
                      <p>
                        <Trans>2. Click "Start" below</Trans>
                      </p>
                      <p>
                        <Trans>3. Share your meeting tab</Trans>
                      </p>
                      <p>
                        <Trans>4. Make sure to enable "Share audio"</Trans>
                      </p>
                      <p className={'text-yellow-500 font-medium'}>
                        <Trans>⚠️ Make sure to enable "Share audio"</Trans>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button
                  onClick={() => setStep('mode')}
                  className={getBackButtonClass()}
                >
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
                  <div
                    className={
                      'flex items-center gap-2 min-w-[140px] justify-center'
                    }
                  >
                    <Loader2 className={'size-4 opacity-50 animate-spin'} />
                    <span className="text-white font-medium whitespace-nowrap">
                      <Trans>Connecting...</Trans>
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
                  <Button
                    className={'z-50 flex items-center gap-1.5 rounded-full'}
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

      {/* Global Waitlist Modal */}
      <WaitlistModal
        key="waitlist-modal"
        isOpen={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        onSuccess={() => setShowWaitlistModal(false)}
        sessionId={waitlistSessionId}
        scores={{ fluency: 0, accuracy: 0, comprehensibility: 0 }}
        extractedInfo={[]}
      />
    </AnimatePresence>
  );
}
