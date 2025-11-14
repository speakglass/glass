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
import { Nav, type NavProps } from '@/components/nav';

const DEMO_LOCALES = ['en', 'ja', 'ko', 'zh', 'es', 'fr'] as const;
type DemoLocale = (typeof DEMO_LOCALES)[number];

const SUGGESTION_TARGETS: Record<DemoLocale, string> = {
  en: 'Tomorrow works for me. What time is good for you?',
  ja: '明日がいいな。何時ごろがいい？',
  ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
  zh: '我明天可以。几点方便？',
  es: 'Mañana me viene bien. ¿Qué hora te va bien?',
  fr: 'Demain me va bien. Quelle heure te convient ?',
};

const SUGGESTION_TRANSLATIONS: Record<DemoLocale, string> = {
  en: 'Tomorrow works for me. What time is good for you?',
  ja: '明日がいいな。何時ごろがいい？',
  ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
  zh: '我明天可以。几点方便？',
  es: 'Mañana me viene bien. ¿Qué hora te va bien?',
  fr: 'Demain me va bien. Quelle heure te convient ?',
};

const SUGGESTION_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'Tomorrow works for me. What time is good for you?',
    ja: 'トゥモロー ワークス フォー ミー。ワット タイム イズ グッド フォー ユー？',
    ko: '투모로우 웍스 포 미. 왓 타임 이즈 굿 포 유?',
    zh: 'tū-mó-ró wō-kè-sī fó mí. wà-t tài-m ì-z gú-d fó yóu?',
    es: 'Tumórou uorks for mi. Uát táim is gud for iú?',
    fr: 'Toumorou oueurks for mi. Ouat taïm iz goud for you?',
  },
  ja: {
    en: 'Ashita ga ii na. Nanji goro ga ii?',
    ja: '明日がいいな。何時ごろがいい？',
    ko: '아시타 가 이이 나. 난지 고로 가 이이?',
    zh: 'Ashita ga ii na. Nanji goro ga ii?',
    es: 'Ashita ga ii na. Nanji goro ga ii?',
    fr: 'Ashita ga ii na. Nanji goro ga ii?',
  },
  ko: {
    en: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
    ja: 'ナヌン ネイリ チョア。ミョッ シッジュム グェンチャナ？',
    ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
    zh: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
    es: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
    fr: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
  },
  zh: {
    en: 'Wǒ míngtiān kěyǐ. Jǐ diǎn fāngbiàn?',
    ja: 'ウォ ミンティエン クーイー。ジー ディエン ファンビエン？',
    ko: '워 밍티앤 커이. 지 디엔 팡비엔?',
    zh: '我明天可以。几点方便？',
    es: 'Uǒ míngtiān kěyǐ. Jǐ diǎn fāngbiàn?',
    fr: 'Uǒ míngtiān kěyǐ. Jǐ diǎn fāngbiàn?',
  },
  es: {
    en: 'ma-NYA-na meh vee-EH-neh bee-EN. keh O-ra teh vah bee-EN?',
    ja: 'マニャナ メ ビエネ ビエン。ケ オラ テ バ ビエン？',
    ko: '마냐나 메 비에네 비엔. 케 오라 테 바 비엔?',
    zh: 'ma-nyá-na me vi-é-ne bi-én. ké ó-ra te va bi-én?',
    es: 'Mañana me viene bien. ¿Qué hora te va bien?',
    fr: 'Mañana me viene bien. ¿Qué hora te va bien?',
  },
  fr: {
    en: 'duh-MAN muh vah bee-AN. kel UR tuh kon-vee-AN?',
    ja: 'ドゥマン ム ヴァ ビアン。ケル ウール トゥ コンヴィアン？',
    ko: '드망 므 바 비앙. 켈 우르 트 콩비앙?',
    zh: 'dè-mān mè và bi-ān. kél ūr tè kòng-vi-ān?',
    es: 'Deman me va bien. Kel eur te convián?',
    fr: 'Demain me va bien. Quelle heure te convient ?',
  },
};

const WRONG_RESPONSE_TEXT: Record<DemoLocale, string> = {
  en: "Great! Let's meet 3pm tomorrow then.",
  ja: 'いいね！じゃあ明日3時で会おう。',
  ko: '좋아! 그럼 내일 3시 만나자.',
  zh: '太好了！那明天3点见。',
  es: '¡Genial! Nos vemos 3pm mañana entonces.',
  fr: 'Super ! On se voit 15h demain alors.',
};

const FEEDBACK_TARGETS: Record<DemoLocale, string> = {
  en: "Great! Let's meet at 3pm tomorrow then.",
  ja: 'いいね！じゃあ明日3時に会おう。',
  ko: '좋아! 그럼 내일 3시에 만나자.',
  zh: '太好了！那明天3点见吧。',
  es: '¡Genial! Nos vemos a las 3pm mañana entonces.',
  fr: 'Super ! On se voit à 15h demain alors.',
};

const FEEDBACK_EXPLANATIONS: Record<DemoLocale, string> = {
  en: 'When talking about specific times, use "at" before the time. Say "at 3pm" not just "3pm".',
  ja: '具体的な時刻を言うときは、時刻の前に「at」を付けます。「3pm」ではなく「at 3pm」と言います。',
  ko: '구체적인 시간을 말할 때는 시간 앞에 "at"을 붙여요. "3pm"이 아니라 "at 3pm"이라고 해야 해요.',
  zh: '说具体时间时，要在时间前加 "at"。要说 "at 3pm"，不能只说 "3pm"。',
  es: 'Al hablar de horas específicas en inglés, usa "at" antes de la hora. Di "at 3pm", no solo "3pm".',
  fr: 'Pour parler d\'heures précises en anglais, utilise "at" avant l\'heure. Dis "at 3pm", pas juste "3pm".',
};

const FEEDBACK_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: "Great! Let's meet at 3pm tomorrow then.",
    ja: 'グレイト！レッツ ミート アット スリー ピーエム トゥモロー ゼン。',
    ko: '그레이트! 렛츠 밋 앳 쓰리 피엠 투모로우 덴.',
    zh: 'grè-t! lè-cí mí-t à-t sī-rí pí-èm tū-mó-ró zèn.',
    es: 'Gréit! Lets mit at zri pi-em tumórou zen.',
    fr: 'Gréït! Lets mit at sri pi-èm toumorou zèn.',
  },
  ja: {
    en: 'Ii ne! Jaa ashita sanji ni aou.',
    ja: 'いいね！じゃあ明日3時に会おう。',
    ko: '이이 네! 쟈 아시타 산지 니 아오.',
    zh: 'Ii ne! Jaa ashita sanji ni aou.',
    es: 'Ii ne! Yaa ashita sanyi ni aou.',
    fr: 'Ii né! Jaa ashita sanji ni aou.',
  },
  ko: {
    en: 'Joah! Geureom naeil sesie mannaja.',
    ja: 'チョア！グロム ネイル セシエ マンナジャ。',
    ko: '좋아! 그럼 내일 3시에 만나자.',
    zh: 'Joah! Geureom naeil sesie mannaja.',
    es: 'Yoah! Gueureom naeil sesie mannaya.',
    fr: 'Joah! Geureom naeil sésié mannaja.',
  },
  zh: {
    en: 'Tài hǎo le! Nà míngtiān sāndiǎn jiàn ba.',
    ja: 'タイ ハオ ラ！ナ ミンティエン サンディエン ジエン バ。',
    ko: '타이 하오 러! 나 밍티앤 산디엔 지엔 바.',
    zh: '太好了！那明天3点见吧。',
    es: 'Tài hǎo le! Nà míngtiān sāndiǎn jiàn ba.',
    fr: 'Tài hǎo le! Nà míngtiān sāndiǎn jiàn ba.',
  },
  es: {
    en: 'He-nee-AL! nos VE-mos ah las TRES pe-em ma-NYA-na en-TON-ses.',
    ja: 'ヘニアル！ノス ベモス ア ラス トレス ピーエム マニャナ エントンセス。',
    ko: '헤니알! 노스 베모스 아 라스 트레스 피엠 마냐나 엔톤세스.',
    zh: 'he-ni-ál! nós vé-mós a las trés pe-èm ma-nyá-na en-tón-ses.',
    es: '¡Genial! Nos vemos a las 3pm mañana entonces.',
    fr: '¡Genial! Nos vemos a las 3pm mañana entonces.',
  },
  fr: {
    en: 'su-PAIR! ohn suh vwah ah kahn-zUR ah duh-MAN ah-LOR.',
    ja: 'スペール！オン ス ヴワ ア カンズール ア ドゥマン アロール。',
    ko: '수페르! 옹 스 부와 아 캉즈르 아 드망 알로르.',
    zh: 'sū-pér! ōng sè vuà a kān-zúr a dè-mān a-lòr.',
    es: 'Super! On se vua a kanzur a deman alor.',
    fr: 'Super ! On se voit à 15h demain alors.',
  },
};

type TextKey =
  | 'greeting'
  | 'greetingReply'
  | 'askDay'
  | 'replyBusy'
  | 'typingKeywords'
  | 'askDetails'
  | 'userWrongResponse'
  | 'feedbackSummary'
  | 'feedbackTip'
  | 'feedbackItem';

const TEXT_LIBRARY: Record<TextKey, Record<DemoLocale, string>> = {
  greeting: {
    en: 'When are you free this week? We should hang out!',
    ja: '今週いつ空いてる？遊ぼうよ！',
    ko: '이번 주에 언제 시간 돼? 우리 놀자!',
    zh: '这周你什么时候有空？我们出去玩吧！',
    es: '¿Cuándo tienes tiempo esta semana? ¡Salgamos!',
    fr: "T'es libre quand cette semaine ? On devrait se voir !",
  },
  greetingReply: {
    en: 'Pretty good! How about you?',
    ja: 'まあまあかな！君は？',
    ko: '괜찮아! 너는?',
    zh: '还不错！你呢？',
    es: '¡Bien! ¿Y tú?',
    fr: 'Plutôt bien ! Et toi ?',
  },
  askDay: {
    en: 'How was your day?',
    ja: '今日はどうでしたか？',
    ko: '오늘 어땠어요?',
    zh: '你今天怎么样？',
    es: '¿Cómo estuvo tu día?',
    fr: "Comment s'est passée ta journée ?",
  },
  replyBusy: {
    en: 'Tomorrow works for me. What time is good for you?',
    ja: '明日がいいな。何時ごろがいい？',
    ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
    zh: '我明天可以。几点方便？',
    es: 'Mañana me viene bien. ¿Qué hora te va bien?',
    fr: 'Demain me va bien. Quelle heure te convient ?',
  },
  typingKeywords: {
    en: 'tomorrow what time',
    ja: '明日 何時',
    ko: '내일 몇시',
    zh: '明天 几点',
    es: 'mañana qué hora',
    fr: 'demain quelle heure',
  },
  askDetails: {
    en: 'How about 3pm?',
    ja: '3時はどう？',
    ko: '3시 어때?',
    zh: '3点怎么样？',
    es: '¿Qué tal a las 3?',
    fr: '15h, ça te va ?',
  },
  userWrongResponse: {
    en: "Great! Let's meet 3pm tomorrow then.",
    ja: 'いいね！じゃあ明日3時で会おう。',
    ko: '좋아! 그럼 내일 3시 만나자.',
    zh: '太好了！那明天3点见。',
    es: '¡Genial! Nos vemos 3pm mañana entonces.',
    fr: 'Super ! On se voit 15h demain alors.',
  },
  feedbackSummary: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "Let\'s meet 3pm tomorrow then." The message was clear, but in English, we need "at" before specific times. So it would be more natural to say "Let\'s meet at 3pm tomorrow then." Your tone was friendly and you made good use of casual expressions like "Great!" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: "素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「じゃあ明日3時で会おう」と言いましたね。メッセージは伝わりましたが、英語では具体的な時刻の前に「at」を付ける必要があります。つまり「Let's meet at 3pm tomorrow then」と言う方がより自然です。トーンは親しみやすく、「Great!」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨",
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "그럼 내일 3시 만나자"라고 말씀하셨는데, 메시지는 잘 전달되었지만 영어에서는 구체적인 시간 앞에 "at"을 붙여야 해요. 그래서 "Let\'s meet at 3pm tomorrow then"이라고 말하는 게 더 자연스러워요. 톤도 친근했고 "Great!" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 영어를 구사하실 수 있을 거예요! ✨',
    zh: '做得很好！整个对话中，你表达得自信又清晰。我注意到你说了"那明天3点见"。意思很明确，但在英语中，具体时间前需要加"at"。所以说"Let\'s meet at 3pm tomorrow then"会更自然。你的语气很友好，而且善用了"Great!"这样的口语表达，这对建立良好关系很有帮助。继续这样练习，你很快就能说得更自然了！✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "Nos vemos 3pm mañana entonces." El mensaje estaba claro, pero en inglés necesitamos "at" antes de horas específicas. Así que sería más natural decir "Let\'s meet at 3pm tomorrow then." Tu tono fue amigable y usaste bien expresiones casuales como "¡Genial!" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "On se voit 15h demain alors." Le message était clair, mais en anglais, on a besoin de "at" avant les heures précises. Donc il serait plus naturel de dire "Let\'s meet at 3pm tomorrow then." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "Super !" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
  feedbackTip: {
    en: 'Remember: Use "at" with specific times (at 3pm, at noon, at midnight).',
    ja: '覚えておきましょう：具体的な時刻には「at」を使います（at 3pm、at noon、at midnight）。',
    ko: '기억하세요: 구체적인 시간에는 "at"을 사용해요 (at 3pm, at noon, at midnight).',
    zh: '记住：具体时间要用 "at" (at 3pm, at noon, at midnight)。',
    es: 'Recuerda: Usa "at" con horas específicas en inglés (at 3pm, at noon, at midnight).',
    fr: 'Rappel : Utilise "at" avec des heures précises en anglais (at 3pm, at noon, at midnight).',
  },
  feedbackItem: {
    en: 'Add "at" before the time: "Let\'s meet at 3pm" (not "meet 3pm").',
    ja: "時刻の前に「at」を付けましょう：「Let's meet at 3pm」（「meet 3pm」ではありません）。",
    ko: '시간 앞에 "at"을 넣으세요: "Let\'s meet at 3pm" ("meet 3pm"이 아니에요).',
    zh: '在时间前加 "at"："Let\'s meet at 3pm"（不是 "meet 3pm"）。',
    es: 'Agrega "at" antes de la hora en inglés: "Let\'s meet at 3pm" (no "meet 3pm").',
    fr: 'Ajoute "at" avant l\'heure en anglais : "Let\'s meet at 3pm" (pas "meet 3pm").',
  },
};

const isDemoLocale = (value: string): value is DemoLocale => DEMO_LOCALES.includes(value as DemoLocale);

const normalizeLocale = (locale: string): DemoLocale => {
  const lowered = locale.toLowerCase();
  return isDemoLocale(lowered) ? (lowered as DemoLocale) : 'en';
};

const getLocalizedText = (key: TextKey, locale: string): string => {
  const normalized = normalizeLocale(locale);
  return TEXT_LIBRARY[key][normalized] ?? TEXT_LIBRARY[key].en;
};

type DemoConversationEntry = {
  role: 'other' | 'you';
  text: string;
  translationKey: TextKey;
};

type DemoTemplate = {
  conversation: DemoConversationEntry[];
  additionalMessages: DemoConversationEntry[];
  suggestion: { targetText: string };
  feedbackBubble: { targetText: string };
  feedbackSummaryKey: TextKey;
  feedbackItemKey: TextKey;
};

const DEMO_TEMPLATES: Record<string, DemoTemplate> = {
  ja: {
    conversation: [{ role: 'other', text: '今週いつ空いてる？遊ぼうよ！', translationKey: 'greeting' }],
    additionalMessages: [
      { role: 'you', text: '明日がいいな。何時ごろがいい？', translationKey: 'replyBusy' },
      { role: 'other', text: '3時はどう？', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.ja, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.ja },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.ja },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
  ko: {
    conversation: [{ role: 'other', text: '이번 주에 언제 시간 돼? 우리 놀자!', translationKey: 'greeting' }],
    additionalMessages: [
      { role: 'you', text: '나는 내일이 좋아. 몇 시쯤 괜찮아?', translationKey: 'replyBusy' },
      { role: 'other', text: '3시 어때?', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.ko, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.ko },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.ko },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
  zh: {
    conversation: [{ role: 'other', text: '这周你什么时候有空？我们出去玩吧！', translationKey: 'greeting' }],
    additionalMessages: [
      { role: 'you', text: '我明天可以。几点方便？', translationKey: 'replyBusy' },
      { role: 'other', text: '3点怎么样？', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.zh, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.zh },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.zh },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
  es: {
    conversation: [
      { role: 'other', text: '¿Cuándo tienes tiempo esta semana? ¡Salgamos!', translationKey: 'greeting' },
    ],
    additionalMessages: [
      { role: 'you', text: 'Mañana me viene bien. ¿Qué hora te va bien?', translationKey: 'replyBusy' },
      { role: 'other', text: '¿Qué tal a las 3?', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.es, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.es },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.es },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
  fr: {
    conversation: [
      { role: 'other', text: "T'es libre quand cette semaine ? On devrait se voir !", translationKey: 'greeting' },
    ],
    additionalMessages: [
      { role: 'you', text: 'Demain me va bien. Quelle heure te convient ?', translationKey: 'replyBusy' },
      { role: 'other', text: '15h, ça te va ?', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.fr, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.fr },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.fr },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
  en: {
    conversation: [
      { role: 'other', text: 'When are you free this week? We should hang out!', translationKey: 'greeting' },
    ],
    additionalMessages: [
      { role: 'you', text: 'Tomorrow works for me. What time is good for you?', translationKey: 'replyBusy' },
      { role: 'other', text: 'How about 3pm?', translationKey: 'askDetails' },
      { role: 'you', text: WRONG_RESPONSE_TEXT.en, translationKey: 'userWrongResponse' },
    ],
    suggestion: { targetText: SUGGESTION_TARGETS.en },
    feedbackBubble: { targetText: FEEDBACK_TARGETS.en },
    feedbackSummaryKey: 'feedbackSummary',
    feedbackItemKey: 'feedbackItem',
  },
};

const getDemoTemplate = (learningLang: string): DemoTemplate => DEMO_TEMPLATES[learningLang] ?? DEMO_TEMPLATES.en;

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

    const summaryLearning = demoTemplate.feedbackBubble.targetText;
    const summaryPron = needsPronunciation ? FEEDBACK_PRONUNCIATIONS[learningLocale]?.[nativeLocale] : undefined;
    const summaryParts = [summaryNative];
    if (summaryLearning) summaryParts.push('', summaryLearning);
    if (needsPronunciation && summaryPron) summaryParts.push(summaryPron);
    const summaryCombined = summaryParts.filter((part) => part !== undefined).join('\n');
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
          text: [feedbackItemNative, summaryLearning, needsPronunciation && summaryPron ? summaryPron : null]
            .filter(Boolean)
            .join('\n'),
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

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

interface ExamplePhrase {
  target: string;
  pronunciation?: string;
  translation: string;
}

// Shorter examples for onboarding level selection
const SHORT_EXAMPLES: Record<DemoLocale, string> = {
  en: 'What time works for you tomorrow?',
  ja: '明日は何時がいいですか？',
  ko: '내일 몇 시가 좋아?',
  zh: '明天几点方便？',
  es: '¿Qué hora te va bien mañana?',
  fr: 'Quelle heure te convient demain ?',
};

const SHORT_EXAMPLE_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'What time works for you tomorrow?',
    ja: 'ワット タイム ワークス フォー ユー トゥモロー？',
    ko: '왓 타임 웍스 포 유 투모로우?',
    zh: 'wà-t tài-m wō-kè-sī fó yóu tū-mó-ró?',
    es: 'Uát táim uorks for iú tumórou?',
    fr: 'Ouat taïm oueurks for you toumorou?',
  },
  ja: {
    en: 'Ashita wa nanji ga ii desu ka?',
    ja: '明日は何時がいいですか？',
    ko: '아시타 와 난지 가 이 데스 카?',
    zh: 'Ashita wa nanji ga ii desu ka?',
    es: 'Ashita wa nanyi ga ii desu ka?',
    fr: 'Ashita wa nanji ga ii déss ka?',
  },
  ko: {
    en: 'Naeir myeot siga joah?',
    ja: 'ネイル ミョッ シガ チョア？',
    ko: '내일 몇 시가 좋아?',
    zh: 'Naeir myeot siga joah?',
    es: 'Naeir myeot siga yoah?',
    fr: 'Naeir myeot siga joah?',
  },
  zh: {
    en: 'Míngtiān jǐ diǎn fāngbiàn?',
    ja: 'ミンティエン ジー ディエン ファンビエン？',
    ko: '밍티앤 지 디엔 팡비엔?',
    zh: '明天几点方便？',
    es: 'Míngtiān jǐ diǎn fāngbiàn?',
    fr: 'Míngtiān jǐ diǎn fāngbiàn?',
  },
  es: {
    en: 'keh O-ra teh vah bee-EN ma-NYA-na?',
    ja: 'ケ オラ テ バ ビエン マニャナ？',
    ko: '케 오라 테 바 비엔 마냐나?',
    zh: 'ké ó-ra te va bi-én ma-nyá-na?',
    es: '¿Qué hora te va bien mañana?',
    fr: '¿Qué hora te va bien mañana?',
  },
  fr: {
    en: 'kel UR tuh kon-vee-AN duh-MAN?',
    ja: 'ケル ウール トゥ コンヴィアン ドゥマン？',
    ko: '켈 우르 트 콩비앙 드망?',
    zh: 'kél ūr tè kòng-vi-ān dè-mān?',
    es: 'Kel eur te convián deman?',
    fr: 'Quelle heure te convient demain ?',
  },
};

const SHORT_EXAMPLE_TRANSLATIONS: Record<DemoLocale, string> = {
  en: 'What time works for you tomorrow?',
  ja: '明日は何時がいいですか？',
  ko: '내일 몇 시가 좋아?',
  zh: '明天几点方便？',
  es: '¿Qué hora te va bien mañana?',
  fr: 'Quelle heure te convient demain ?',
};

const LANGUAGE_EXAMPLES: Record<string, Record<string, ExamplePhrase>> = DEMO_LOCALES.reduce((matrix, learning) => {
  matrix[learning] = {} as Record<string, ExamplePhrase>;
  DEMO_LOCALES.forEach((native) => {
    if (learning === native) return;
    matrix[learning][native] = {
      target: SHORT_EXAMPLES[learning],
      pronunciation: SHORT_EXAMPLE_PRONUNCIATIONS[learning]?.[native],
      translation: SHORT_EXAMPLE_TRANSLATIONS[native],
    };
  });
  return matrix;
}, {} as Record<string, Record<string, ExamplePhrase>>);

const getLanguageExample = (learningLang: string, nativeLang: string): ExamplePhrase | undefined => {
  const learning = normalizeLocale(learningLang);
  const native = normalizeLocale(nativeLang);
  return (
    LANGUAGE_EXAMPLES[learning]?.[native] ?? {
      target: SHORT_EXAMPLES[learning],
      pronunciation: SHORT_EXAMPLE_PRONUNCIATIONS[learning]?.[native],
      translation: SHORT_EXAMPLE_TRANSLATIONS[native],
    }
  );
};
