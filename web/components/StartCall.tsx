import { useGlass, LanguageSettings, SessionConfig } from '@/contexts/GlassContext';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Phone } from 'lucide-react';
import WaitlistModal from '@/components/WaitlistModal';
import LiquidGlass from './LiquidGlass';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { Button } from './ui/button';
import { cn } from '@/utils';

type SetupStep = 'start' | 'languages' | 'level' | 'mode' | 'scenario' | 'instructions' | 'connecting';

interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

export default function StartCall() {
  const { status, connect, updateSettings, settings } = useGlass();
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<SetupStep>('start');
  const [languages, setLanguages] = useState<LanguageSettings>({
    learningLang: '',
    nativeLang: '',
  });
  const [selectedMode, setSelectedMode] = useState<'practice' | 'real' | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [customScenario, setCustomScenario] = useState<string>('');
  // Global waitlist modal trigger
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistSessionId, setWaitlistSessionId] = useState('');
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string } | undefined;
      setWaitlistSessionId(detail?.sessionId || '');
      setShowWaitlistModal(true);
    };
    window.addEventListener('glass:open-waitlist', handler as EventListener);
    return () => window.removeEventListener('glass:open-waitlist', handler as EventListener);
  }, []);
  const [proficiency, setProficiency] = useState<'cant_read' | 'can_read' | ''>(
    (settings.proficiency as 'cant_read' | 'can_read' | undefined) || 'cant_read'
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
    return glassMode ? 'ring-2 ring-white/50' : 'border-foreground/30 ring-1 ring-foreground/20';
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
    const newLanguages = {
      ...languages,
      [type === 'learning' ? 'learningLang' : 'nativeLang']: code,
    };
    setLanguages(newLanguages);

    // Auto-advance when both languages are selected
    if (newLanguages.learningLang && newLanguages.nativeLang) {
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
    setStep('connecting');
    try {
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
      await connect(config);
    } catch {
      toast.error('Unable to start call');
      setStep('instructions');
    }
  };

  return (
    <AnimatePresence>
      {status.value === 'idle' || status.value === 'connecting' || status.value === 'disconnected' ? (
        <motion.div
          ref={containerRef}
          className={'fixed inset-0 p-4 flex items-center justify-center bg-background'}
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
                    <div className={'flex items-center gap-2 min-w-[140px] justify-center'}>
                      <Phone className={'size-4 text-green-400'} />
                      <span className="text-white font-medium whitespace-nowrap">Start Call</span>
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
                        <Phone className={'size-4 opacity-50 fill-current'} strokeWidth={0} />
                      </span>
                      <span>Start Call</span>
                    </Button>
                  </motion.div>
                )}
              </div>
            </>
          )}

          {/* Level (Reading ability) Selection */}
          {step === 'level' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-8 max-w-xl mx-auto'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  Do you want pronunciation help?
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>
                  We'll show how to read suggestions in your alphabet when helpful
                </p>
              </div>
              <div className={'flex gap-6'}>
                <button
                  onClick={() => {
                    setProficiency('cant_read');
                    updateSettings({ proficiency: 'cant_read' });
                    setStep('mode');
                  }}
                  className={cn(
                    'px-8 py-6 h-[200px] rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-[300px]',
                    getCardClass(),
                    getScaleClass(),
                    proficiency === 'cant_read' && getSelectedRingClass()
                  )}
                >
                  <div className={'flex h-full flex-col'}>
                    <div className={'text-center'}>
                      <div className={`${getTextClass('title')} font-medium mb-1`}>Yes, show pronunciation</div>
                      <div className={`${getTextClass('body')} text-xs`}>Make suggestions readable for me</div>
                    </div>
                    <div className={'mt-auto'}>
                      <div
                        className={cn(
                          'rounded-md px-3 py-2 text-left',
                          glassMode ? 'bg-white/5 border border-white/10' : 'bg-muted border border-border'
                        )}
                      >
                        <div className={'flex items-end gap-3'}>
                          <div>
                            <div className={`${getTextClass('title')} text-sm tracking-wide`}>ありがとう</div>
                            <div className={'text-emerald-400 opacity-80 text-sm mt-0.5'}>arigatou</div>
                          </div>
                          <div>
                            <div className={`${getTextClass('title')} text-sm tracking-wide`}>ございます</div>
                            <div className={'text-emerald-400 opacity-80 text-sm mt-0.5'}>gozaimasu</div>
                          </div>
                        </div>
                        <div className={`${getTextClass('muted')} text-[11px] mt-1`}>Thank you very much</div>
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
                    'px-8 py-6 h-[200px] rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-[300px]',
                    getCardClass(),
                    getScaleClass(),
                    proficiency === 'can_read' && getSelectedRingClass()
                  )}
                >
                  <div className={'flex h-full flex-col'}>
                    <div className={'text-center'}>
                      <div className={`${getTextClass('title')} font-medium mb-1`}>No, I'm fine</div>
                      <div className={`${getTextClass('body')} text-xs`}>Show suggestions only</div>
                    </div>
                    <div className={'mt-auto'}>
                      <div
                        className={cn(
                          'rounded-md px-3 py-2 text-left',
                          glassMode ? 'bg-white/5 border border-white/10' : 'bg-muted border border-border'
                        )}
                      >
                        <div className={`${getTextClass('title')} text-sm tracking-wide`}>ありがとうございます</div>
                        <div className={`${getTextClass('muted')} text-[11px] mt-1`}>Thank you very much</div>
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className={'flex justify-between items-center w-full max-w-xl'}>
                <button onClick={() => setStep('languages')} className={getBackButtonClass()}>
                  ← Back
                </button>
                <Button
                  onClick={() => setStep('mode')}
                  disabled={!proficiency}
                  variant={glassMode ? 'ghost' : 'ghost'}
                  size="sm"
                  className={cn('text-sm', !proficiency && 'opacity-50 cursor-not-allowed')}
                >
                  Next →
                </Button>
              </div>
            </motion.div>
          )}
          {step === 'languages' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={'flex flex-col items-center gap-8 max-w-2xl mx-auto'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>Choose Your Languages</h2>
                <p className={`${getTextClass('body')} text-sm`}>Select the language you want to practice</p>
              </div>

              <div className={'flex flex-col gap-6 w-full'}>
                {/* Learning Language */}
                <div className={'flex flex-col gap-3'}>
                  <p className={`${getTextClass('subtitle')} text-sm font-medium text-center`}>I want to learn</p>
                  <div className={'flex gap-2 flex-wrap justify-center'}>
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
                        onClick={() => handleLanguageSelect('learning', lang.code)}
                      >
                        <span className={'text-lg'}>{lang.flag}</span>
                        <span className={'font-medium'}>{lang.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Native Language */}
                <div className={'flex flex-col gap-3'}>
                  <p className={`${getTextClass('subtitle')} text-sm font-medium text-center`}>I speak</p>
                  <div className={'flex gap-2 flex-wrap justify-center'}>
                    {LANGUAGES.map((lang) => (
                      <Button
                        key={`native-${lang.code}`}
                        variant={glassMode ? 'translucent' : 'outline'}
                        size="sm"
                        className={cn(
                          'rounded-full focus-visible:ring-2 transition-all',
                          getScaleClass(),
                          languages.nativeLang === lang.code
                            ? glassMode
                              ? 'scale-105 bg-white/20 border-white/40 ring-2 ring-white/50'
                              : 'bg-accent border-foreground/30 ring-1 ring-foreground/20 text-foreground dark:bg-primary/10 dark:text-primary'
                            : 'opacity-90 hover:opacity-100'
                        )}
                        onClick={() => handleLanguageSelect('native', lang.code)}
                      >
                        <span className={'text-lg'}>{lang.flag}</span>
                        <span className={'font-medium'}>{lang.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button onClick={() => setStep('start')} className={getBackButtonClass()}>
                  ← Back
                </button>
                <Button
                  onClick={() => setStep('level')}
                  disabled={!languages.learningLang || !languages.nativeLang}
                  variant={glassMode ? 'ghost' : 'ghost'}
                  size="sm"
                  className={cn(
                    'text-sm',
                    (!languages.learningLang || !languages.nativeLang) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  Next →
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
              className={'flex flex-col items-center gap-8'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  How would you like to use Glass?
                </h2>
                <p className={`${getTextClass('body')} text-sm`}>Choose your preferred mode</p>
              </div>

              <div className={'flex gap-6'}>
                <button
                  onClick={() => handleModeSelect('practice')}
                  className={cn(
                    'px-8 py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-[200px]',
                    getCardClass(),
                    getScaleClass()
                  )}
                >
                  <div className={'flex flex-col items-center gap-3'}>
                    <img
                      src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80"
                      alt="Practice person"
                      className={'h-[28px] w-[28px] object-cover rounded-full'}
                    />
                    <div className={'text-center'}>
                      <div className={`${getTextClass('title')} font-medium mb-1`}>Practice</div>
                      <div className={`${getTextClass('body')} text-xs`}>Tutorial with AI</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect('real')}
                  className={cn(
                    'px-8 py-6 rounded-2xl transition-all cursor-pointer outline-none focus-visible:ring-2 w-[200px] relative',
                    getCardClass(),
                    getScaleClass()
                  )}
                >
                  {/* Recommended Badge */}
                  <div
                    className={
                      'absolute -top-2 -right-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold shadow-lg'
                    }
                  >
                    RECOMMENDED
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
                      <div className={`${getTextClass('title')} font-medium mb-1`}>Real Talk</div>
                      <div className={`${getTextClass('body')} text-xs`}>Language Exchange • Meetings</div>
                    </div>
                  </div>
                </button>
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button onClick={() => setStep('languages')} className={getBackButtonClass()}>
                  ← Back
                </button>
                <Button
                  onClick={() => setStep(selectedMode === 'practice' ? 'scenario' : 'instructions')}
                  disabled={!selectedMode}
                  variant={glassMode ? 'ghost' : 'ghost'}
                  size="sm"
                  className={cn('text-sm', !selectedMode && 'opacity-50 cursor-not-allowed')}
                >
                  Next →
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
              className={'flex flex-col items-center gap-6 max-w-2xl mx-auto'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>Choose a scenario</h2>
                <p className={`${getTextClass('body')} text-sm`}>What would you like to practice?</p>
              </div>

              <div className={'grid grid-cols-2 gap-4 w-full'}>
                {[
                  { id: 'casual', emoji: '💬', title: 'Casual Chat', desc: 'Everyday conversation' },
                  { id: 'airport', emoji: '✈️', title: 'Airport Check-in', desc: 'Travel & Immigration' },
                  { id: 'restaurant', emoji: '🍽️', title: 'Restaurant', desc: 'Ordering food & drinks' },
                  { id: 'interview', emoji: '💼', title: 'Job Interview', desc: 'Professional conversation' },
                  { id: 'shopping', emoji: '🛍️', title: 'Shopping', desc: 'Retail & bargaining' },
                  { id: 'phone', emoji: '📞', title: 'Phone Call', desc: 'Telephone etiquette' },
                ].map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => handleScenarioSelect(scenario.id)}
                    className={cn(
                      'px-6 py-4 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2 text-left',
                      getCardClass(),
                      getScaleClass(),
                      selectedScenario === scenario.id &&
                        (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent border-foreground/30')
                    )}
                  >
                    <div className={'flex items-start gap-3'}>
                      <span className={'text-2xl'}>{scenario.emoji}</span>
                      <div>
                        <div className={`${getTextClass('title')} font-medium mb-0.5`}>{scenario.title}</div>
                        <div className={`${getTextClass('muted')} text-xs`}>{scenario.desc}</div>
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
                    'w-full px-6 py-4 rounded-xl transition-all cursor-pointer outline-none focus-visible:ring-2',
                    getCardClass(),
                    getScaleClass(),
                    selectedScenario === 'custom' &&
                      (glassMode ? 'bg-white/20 border-white/40' : 'bg-accent border-foreground/30')
                  )}
                >
                  <div className={'flex items-center gap-3'}>
                    <span className={'text-2xl'}>✨</span>
                    <div className={'text-left'}>
                      <div className={`${getTextClass('title')} font-medium mb-0.5`}>Custom Scenario</div>
                      <div className={`${getTextClass('muted')} text-xs`}>Describe your own situation</div>
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
                      placeholder="Describe the scenario you want to practice..."
                      className={cn(
                        'w-full px-4 py-3 rounded-lg resize-none focus:outline-none',
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
                  ← Back
                </button>
                <Button
                  onClick={handleStartCall}
                  disabled={!selectedScenario || (selectedScenario === 'custom' && !customScenario.trim())}
                  variant={glassMode ? 'translucent' : 'default'}
                  className={cn(
                    'rounded-full px-8 py-2.5',
                    (!selectedScenario || (selectedScenario === 'custom' && !customScenario.trim())) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  Start
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
              className={'flex flex-col items-center gap-6 max-w-lg mx-auto'}
            >
              <div className={'text-center'}>
                <h2 className={`${getTextClass('title')} text-2xl font-medium mb-2`}>
                  {selectedMode === 'practice' ? 'Practice Mode' : 'Real Talk Mode'}
                </h2>
              </div>

              <div
                className={cn(
                  'rounded-2xl p-6',
                  glassMode ? 'bg-white/10 backdrop-blur-sm border border-white/20' : 'bg-card border border-border'
                )}
              >
                {selectedMode === 'practice' ? (
                  <div className={getTextClass('title')}>
                    {selectedScenario === 'custom' && customScenario ? (
                      <div>
                        <p className={`text-xs ${getTextClass('muted')} mb-2`}>Scenario:</p>
                        <p className={'text-sm'}>{customScenario}</p>
                      </div>
                    ) : selectedScenario ? (
                      <div>
                        <p className={`text-xs ${getTextClass('muted')} mb-2`}>Scenario:</p>
                        <p className={'text-base font-medium'}>
                          {selectedScenario === 'airport' && '✈️ Airport Check-in'}
                          {selectedScenario === 'restaurant' && '🍽️ Restaurant'}
                          {selectedScenario === 'interview' && '💼 Job Interview'}
                          {selectedScenario === 'shopping' && '🛍️ Shopping'}
                          {selectedScenario === 'casual' && '💬 Casual Chat'}
                          {selectedScenario === 'phone' && '📞 Phone Call'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={cn(getTextClass('title'), 'space-y-3')}>
                    <p className={'text-sm leading-relaxed font-medium mb-3'}>Follow these steps:</p>
                    <div className={cn('text-sm space-y-2.5', getTextClass('subtitle'))}>
                      <p>1. Open your meeting (Zoom, Google Meet, or Teams)</p>
                      <p>2. Click "Start" below</p>
                      <p>3. Share your meeting tab</p>
                      <p className={'text-yellow-500 font-medium'}>⚠️ Make sure to enable "Share audio"</p>
                    </div>
                  </div>
                )}
              </div>

              <div className={'flex justify-between items-center w-full'}>
                <button
                  onClick={() => setStep(selectedMode === 'practice' ? 'scenario' : 'mode')}
                  className={getBackButtonClass()}
                >
                  ← Back
                </button>
                <Button
                  variant={glassMode ? 'translucent' : 'default'}
                  onClick={handleStartCall}
                  className={'rounded-full px-8 py-2.5'}
                >
                  Start
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
                    <span className="text-white font-medium whitespace-nowrap">Connecting...</span>
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
                  <Button className={'z-50 flex items-center gap-1.5 rounded-full'} disabled>
                    <Loader2 className={'size-4 opacity-50 animate-spin'} />
                    <span>Connecting...</span>
                  </Button>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      ) : null}

      {/* Global Waitlist Modal */}
      <WaitlistModal
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
