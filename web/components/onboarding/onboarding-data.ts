import type { Memory } from '@/lib/account-api';

// Types
export const DEMO_LOCALES = ['en', 'ja', 'ko', 'es', 'fr'] as const;
export type DemoLocale = (typeof DEMO_LOCALES)[number];

export type TextKey =
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

export type DemoConversationEntry = {
  role: 'other' | 'you';
  text: string;
  translationKey: TextKey;
};

export type DemoTemplate = {
  conversation: DemoConversationEntry[];
  additionalMessages: DemoConversationEntry[];
  suggestion: { targetText: string };
  feedbackBubble: { targetText: string };
  feedbackSummaryKey: TextKey;
  feedbackItemKey: TextKey;
};

export interface ExamplePhrase {
  target: string;
  pronunciation?: string;
  translation: string;
}

// Suggestion texts
export const SUGGESTION_TARGETS: Record<DemoLocale, string> = {
  en: 'Tomorrow works for me. What time is good for you?',
  ja: '明日がいいな。何時ごろがいい？',
  ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
  es: 'Mañana me viene bien. ¿Qué hora te va bien?',
  fr: 'Demain me va bien. Quelle heure te convient ?',
};

export const SUGGESTION_TRANSLATIONS: Record<DemoLocale, string> = {
  en: 'Tomorrow works for me. What time is good for you?',
  ja: '明日がいいな。何時ごろがいい？',
  ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
  es: 'Mañana me viene bien. ¿Qué hora te va bien?',
  fr: 'Demain me va bien. Quelle heure te convient ?',
};

export const SUGGESTION_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'Tomorrow works for me. What time is good for you?',
    ja: 'トゥモロー ワークス フォー ミー。ワット タイム イズ グッド フォー ユー？',
    ko: '투모로우 웍스 포 미. 왓 타임 이즈 굿 포 유?',
    es: 'Tumórou uorks for mi. Uát táim is gud for iú?',
    fr: 'Toumorou oueurks for mi. Ouat taïm iz goud for you?',
  },
  ja: {
    en: 'Ashita ga ii na. Nanji goro ga ii?',
    ja: '明日がいいな。何時ごろがいい？',
    ko: '아시타 가 이이 나. 난지 고로 가 이이?',
    es: 'Ashita ga ii na. Nanji goro ga ii?',
    fr: 'Ashita ga ii na. Nanji goro ga ii?',
  },
  ko: {
    en: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
    ja: 'ナヌン ネイリ チョア。ミョッ シッジュム グェンチャナ？',
    ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
    es: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
    fr: 'Naneun naeiri joah. Myeot sijjeum gwaenchanha?',
  },
  es: {
    en: 'ma-NYA-na meh vee-EH-neh bee-EN. keh O-ra teh vah bee-EN?',
    ja: 'マニャナ メ ビエネ ビエン。ケ オラ テ バ ビエン？',
    ko: '마냐나 메 비에네 비엔. 케 오라 테 바 비엔?',
    es: 'Mañana me viene bien. ¿Qué hora te va bien?',
    fr: 'Mañana me viene bien. ¿Qué hora te va bien?',
  },
  fr: {
    en: 'duh-MAN muh vah bee-AN. kel UR tuh kon-vee-AN?',
    ja: 'ドゥマン ム ヴァ ビアン。ケル ウール トゥ コンヴィアン？',
    ko: '드망 므 바 비앙. 켈 우르 트 콩비앙?',
    es: 'Deman me va bien. Kel eur te convián?',
    fr: 'Demain me va bien. Quelle heure te convient ?',
  },
};

// Wrong and correct responses
export const WRONG_RESPONSE_TEXT: Record<DemoLocale, string> = {
  en: "Great! Let's meet 3pm tomorrow then.",
  ja: 'いいね！じゃあ明日3時で会おう。',
  ko: '좋아! 그럼 내일 3시 만나자.',
  es: '¡Genial! Nos vemos 3pm mañana entonces.',
  fr: 'Super ! On se voit 15h demain alors.',
};

export const FEEDBACK_TARGETS: Record<DemoLocale, string> = {
  en: "Great! Let's meet at 3pm tomorrow then.",
  ja: 'いいね！じゃあ明日3時に会おう。',
  ko: '좋아! 그럼 내일 3시에 만나자.',
  es: '¡Genial! Nos vemos a las 3pm mañana entonces.',
  fr: 'Super ! On se voit à 15h demain alors.',
};

// Feedback explanations per learning language, translated to native language
export const FEEDBACK_EXPLANATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'When talking about specific times, use "at" before the time. Say "at 3pm" not just "3pm".',
    ja: '具体的な時刻を言うときは、時刻の前に「at」を付けます。「3pm」ではなく「at 3pm」と言います。',
    ko: '구체적인 시간을 말할 때는 시간 앞에 "at"을 붙여요. "3pm"이 아니라 "at 3pm"이라고 해야 해요.',
    es: 'Al hablar de horas específicas, usa "at" antes de la hora. Di "at 3pm", no solo "3pm".',
    fr: 'Pour parler d\'heures précises, utilise "at" avant l\'heure. Dis "at 3pm", pas juste "3pm".',
  },
  ja: {
    en: 'When talking about specific times, use "に" (ni) after the time. Say "3時に" not just "3時で".',
    ja: '具体的な時刻を言うときは、時刻の後に「に」を付けます。「3時で」ではなく「3時に」と言います。',
    ko: '구체적인 시간을 말할 때는 시간 뒤에 "に(니)"를 붙여요. "3時で(산지 데)"가 아니라 "3時に(산지 니)"라고 해야 해요.',
    es: 'Al hablar de horas específicas, usa "に" después de la hora. Di "3時に", no "3時で".',
    fr: 'Pour parler d\'heures précises, utilise "に" après l\'heure. Dis "3時に", pas "3時で".',
  },
  ko: {
    en: 'When talking about specific times, use "에" (e) after the time. Say "3시에" not just "3시".',
    ja: '具体的な時刻を言うときは、時刻の後に「에」を付けます。「3시」ではなく「3시에」と言います。',
    ko: '구체적인 시간을 말할 때는 시간 뒤에 "에"를 붙여요. "3시"가 아니라 "3시에"라고 해야 해요.',
    es: 'Al hablar de horas específicas, usa "에" después de la hora. Di "3시에", no solo "3시".',
    fr: 'Pour parler d\'heures précises, utilise "에" après l\'heure. Dis "3시에", pas juste "3시".',
  },
  es: {
    en: 'When talking about specific times, use "a las" before the time. Say "a las 3pm" not just "3pm".',
    ja: '具体的な時刻を言うときは、時刻の前に「a las」を付けます。「3pm」ではなく「a las 3pm」と言います。',
    ko: '구체적인 시간을 말할 때는 시간 앞에 "a las"를 붙여요. "3pm"이 아니라 "a las 3pm"이라고 해야 해요.',
    es: 'Al hablar de horas específicas, usa "a las" antes de la hora. Di "a las 3pm", no solo "3pm".',
    fr: 'Pour parler d\'heures précises, utilise "a las" avant l\'heure. Dis "a las 3pm", pas juste "3pm".',
  },
  fr: {
    en: 'When talking about specific times, use "à" before the time. Say "à 15h" not just "15h".',
    ja: '具体的な時刻を言うときは、時刻の前に「à」を付けます。「15h」ではなく「à 15h」と言います。',
    ko: '구체적인 시간을 말할 때는 시간 앞에 "à"를 붙여요. "15h"가 아니라 "à 15h"라고 해야 해요.',
    es: 'Al hablar de horas específicas, usa "à" antes de la hora. Di "à 15h", no solo "15h".',
    fr: 'Pour parler d\'heures précises, utilise "à" avant l\'heure. Dis "à 15h", pas juste "15h".',
  },
};

export const FEEDBACK_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: "Great! Let's meet at 3pm tomorrow then.",
    ja: 'グレイト！レッツ ミート アット スリー ピーエム トゥモロー ゼン。',
    ko: '그레이트! 렛츠 밋 앳 쓰리 피엠 투모로우 덴.',
    es: 'Gréit! Lets mit at zri pi-em tumórou zen.',
    fr: 'Gréït! Lets mit at sri pi-èm toumorou zèn.',
  },
  ja: {
    en: 'Ii ne! Jaa ashita sanji ni aou.',
    ja: 'いいね！じゃあ明日3時に会おう。',
    ko: '이이 네! 쟈 아시타 산지 니 아오.',
    es: 'Ii ne! Yaa ashita sanyi ni aou.',
    fr: 'Ii né! Jaa ashita sanji ni aou.',
  },
  ko: {
    en: 'Joah! Geureom naeil sesie mannaja.',
    ja: 'チョア！グロム ネイル セシエ マンナジャ。',
    ko: '좋아! 그럼 내일 3시에 만나자.',
    es: 'Yoah! Gueureom naeil sesie mannaya.',
    fr: 'Joah! Geureom naeil sésié mannaja.',
  },
  es: {
    en: 'He-nee-AL! nos VE-mos ah las TRES pe-em ma-NYA-na en-TON-ses.',
    ja: 'ヘニアル！ノス ベモス ア ラス トレス ピーエム マニャナ エントンセス。',
    ko: '헤니알! 노스 베모스 아 라스 트레스 피엠 마냐나 엔톤세스.',
    es: '¡Genial! Nos vemos a las 3pm mañana entonces.',
    fr: '¡Genial! Nos vemos a las 3pm mañana entonces.',
  },
  fr: {
    en: 'su-PAIR! ohn suh vwah ah kahn-zUR ah duh-MAN ah-LOR.',
    ja: 'スペール！オン ス ヴワ ア カンズール ア ドゥマン アロール。',
    ko: '수페르! 옹 스 부와 아 캉즈르 아 드망 알로르.',
    es: 'Super! On se vua a kanzur a deman alor.',
    fr: 'Super ! On se voit à 15h demain alors.',
  },
};

// Create language-pair-specific feedback summaries, tips, and items
// Structure: [learningLang][nativeLang] = text
export const FEEDBACK_SUMMARIES: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "Let\'s meet 3pm tomorrow then." The message was clear, but in English, we need "at" before specific times. So it would be more natural to say "Let\'s meet at 3pm tomorrow then." Your tone was friendly and you made good use of casual expressions like "Great!" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: "素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「Let's meet 3pm tomorrow then」と言いましたね。メッセージは伝わりましたが、英語では具体的な時刻の前に「at」を付ける必要があります。つまり「Let's meet at 3pm tomorrow then」と言う方がより自然です。トーンは親しみやすく、「Great!」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨",
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "Let\'s meet 3pm tomorrow then"이라고 말씀하셨는데, 메시지는 잘 전달되었지만 영어에서는 구체적인 시간 앞에 "at"을 붙여야 해요. 그래서 "Let\'s meet at 3pm tomorrow then"이라고 말하는 게 더 자연스러워요. 톤도 친근했고 "Great!" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 영어를 구사하실 수 있을 거예요! ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "Let\'s meet 3pm tomorrow then." El mensaje estaba claro, pero en inglés necesitamos "at" antes de horas específicas. Así que sería más natural decir "Let\'s meet at 3pm tomorrow then." Tu tono fue amigable y usaste bien expresiones casuales como "Great!" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "Let\'s meet 3pm tomorrow then." Le message était clair, mais en anglais, on a besoin de "at" avant les heures précises. Donc il serait plus naturel de dire "Let\'s meet at 3pm tomorrow then." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "Great!" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
  ja: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "じゃあ明日3時で会おう" (Let\'s meet at 3 o\'clock tomorrow). The message was clear, but in Japanese, we need "に" (ni) after specific times for meetings. So it would be more natural to say "じゃあ明日3時に会おう." Your tone was friendly and you made good use of casual expressions like "いいね!" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: '素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「じゃあ明日3時で会おう」と言いましたね。メッセージは伝わりましたが、日本語では待ち合わせの時刻には「に」を使う必要があります。つまり「じゃあ明日3時に会おう」と言う方がより自然です。トーンは親しみやすく、「いいね！」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨',
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "じゃあ明日3時で会おう(쟈 아시타 산지 데 아오)"라고 말씀하셨는데, 메시지는 잘 전달되었지만 일본어에서는 만나는 시간에 "に(니)"를 사용해야 해요. 그래서 "じゃあ明日3時に会おう(쟈 아시타 산지 니 아오)"라고 말하는 게 더 자연스러워요. 톤도 친근했고 "いいね!(이이네!)" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 일본어를 구사하실 수 있을 거예요! ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "じゃあ明日3時で会おう." El mensaje estaba claro, pero en japonés necesitamos "に" después de horas específicas para encuentros. Así que sería más natural decir "じゃあ明日3時に会おう." Tu tono fue amigable y usaste bien expresiones casuales como "いいね!" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "じゃあ明日3時で会おう." Le message était clair, mais en japonais, on a besoin de "に" après les heures précises pour les rendez-vous. Donc il serait plus naturel de dire "じゃあ明日3時に会おう." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "いいね!" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
  ko: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "그럼 내일 3시 만나자" (Let\'s meet at 3 o\'clock tomorrow). The message was clear, but in Korean, we need "에" (e) after specific times for meetings. So it would be more natural to say "그럼 내일 3시에 만나자." Your tone was friendly and you made good use of casual expressions like "좋아!" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: '素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「그럼 내일 3시 만나자」（それじゃ明日3時会おう）と言いましたね。メッセージは伝わりましたが、韓国語では待ち合わせの時刻には「에」を使う必要があります。つまり「그럼 내일 3시에 만나자」と言う方がより自然です。トーンは親しみやすく、「좋아!」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨',
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "그럼 내일 3시 만나자"라고 말씀하셨는데, 메시지는 잘 전달되었지만 한국어에서는 만나는 시간에 "에"를 붙여야 해요. 그래서 "그럼 내일 3시에 만나자"라고 말하는 게 더 자연스러워요. 톤도 친근했고 "좋아!" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 한국어를 구사하실 수 있을 거예요! ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "그럼 내일 3시 만나자." El mensaje estaba claro, pero en coreano necesitamos "에" después de horas específicas para encuentros. Así que sería más natural decir "그럼 내일 3시에 만나자." Tu tono fue amigable y usaste bien expresiones casuales como "좋아!" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "그럼 내일 3시 만나자." Le message était clair, mais en coréen, on a besoin de "에" après les heures précises pour les rendez-vous. Donc il serait plus naturel de dire "그럼 내일 3시에 만나자." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "좋아!" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
  es: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "Nos vemos 3pm mañana entonces." The message was clear, but in Spanish, we need "a las" before specific times. So it would be more natural to say "Nos vemos a las 3pm mañana entonces." Your tone was friendly and you made good use of casual expressions like "¡Genial!" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: '素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「Nos vemos 3pm mañana entonces」と言いましたね。メッセージは伝わりましたが、スペイン語では具体的な時刻の前に「a las」を付ける必要があります。つまり「Nos vemos a las 3pm mañana entonces」と言う方がより自然です。トーンは親しみやすく、「¡Genial!」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨',
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "Nos vemos 3pm mañana entonces"라고 말씀하셨는데, 메시지는 잘 전달되었지만 스페인어에서는 구체적인 시간 앞에 "a las"를 붙여야 해요. 그래서 "Nos vemos a las 3pm mañana entonces"라고 말하는 게 더 자연스러워요. 톤도 친근했고 "¡Genial!" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 스페인어를 구사하실 수 있을 거예요! ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "Nos vemos 3pm mañana entonces." El mensaje estaba claro, pero en español necesitamos "a las" antes de horas específicas. Así que sería más natural decir "Nos vemos a las 3pm mañana entonces." Tu tono fue amigable y usaste bien expresiones casuales como "¡Genial!" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "Nos vemos 3pm mañana entonces." Le message était clair, mais en espagnol, on a besoin de "a las" avant les heures précises. Donc il serait plus naturel de dire "Nos vemos a las 3pm mañana entonces." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "¡Genial!" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
  fr: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. I noticed you said "On se voit 15h demain alors." The message was clear, but in French, we need "à" before specific times. So it would be more natural to say "On se voit à 15h demain alors." Your tone was friendly and you made good use of casual expressions like "Super !" which really helps build rapport. Keep practicing this way, and you\'ll sound even more natural in no time! ✨',
    ja: '素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。「On se voit 15h demain alors」と言いましたね。メッセージは伝わりましたが、フランス語では具体的な時刻の前に「à」を付ける必要があります。つまり「On se voit à 15h demain alors」と言う方がより自然です。トーンは親しみやすく、「Super !」のようなカジュアルな表現をうまく使っていて、良い関係を築くのに役立っています。このように練習を続ければ、すぐにもっと自然に聞こえるようになりますよ！✨',
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. "On se voit 15h demain alors"라고 말씀하셨는데, 메시지는 잘 전달되었지만 프랑스어에서는 구체적인 시간 앞에 "à"를 붙여야 해요. 그래서 "On se voit à 15h demain alors"라고 말하는 게 더 자연스러워요. 톤도 친근했고 "Super !" 같은 캐주얼한 표현을 잘 활용하셨는데, 이게 친밀감을 형성하는 데 정말 도움이 돼요. 이런 식으로 계속 연습하면 곧 훨씬 자연스러운 프랑스어를 구사하실 수 있을 거예요! ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. Noté que dijiste "On se voit 15h demain alors." El mensaje estaba claro, pero en francés necesitamos "à" antes de horas específicas. Así que sería más natural decir "On se voit à 15h demain alors." Tu tono fue amigable y usaste bien expresiones casuales como "Super !" que realmente ayudan a crear conexión. ¡Sigue practicando así y sonarás aún más natural en poco tiempo! ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. J\'ai remarqué que tu as dit "On se voit 15h demain alors." Le message était clair, mais en français, on a besoin de "à" avant les heures précises. Donc il serait plus naturel de dire "On se voit à 15h demain alors." Ton ton était amical et tu as bien utilisé des expressions décontractées comme "Super !" ce qui aide vraiment à créer du lien. Continue à pratiquer comme ça, et tu sonneras encore plus naturel très bientôt ! ✨',
  },
};

export const FEEDBACK_TIPS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'Remember: Use "at" with specific times (at 3pm, at noon, at midnight).',
    ja: '覚えておきましょう：具体的な時刻には「at」を使います（at 3pm、at noon、at midnight）。',
    ko: '기억하세요: 구체적인 시간에는 "at"을 사용해요 (at 3pm, at noon, at midnight).',
    es: 'Recuerda: Usa "at" con horas específicas (at 3pm, at noon, at midnight).',
    fr: 'Rappel : Utilise "at" avec des heures précises (at 3pm, at noon, at midnight).',
  },
  ja: {
    en: 'Remember: Use "に" (ni) with specific times for meetings (3時に, 正午に, 深夜に).',
    ja: '覚えておきましょう：待ち合わせの時刻には「に」を使います（3時に、正午に、深夜に）。',
    ko: '기억하세요: 만나는 시간에는 "に(니)"를 사용해요 (3時に, 正午に, 深夜に).',
    es: 'Recuerda: Usa "に" con horas de encuentro (3時に, 正午に, 深夜に).',
    fr: 'Rappel : Utilise "に" avec des heures de rendez-vous (3時に, 正午に, 深夜に).',
  },
  ko: {
    en: 'Remember: Use "에" (e) with specific times for meetings (3시에, 정오에, 한밤중에).',
    ja: '覚えておきましょう：待ち合わせの時刻には「에」を使います（3시에、정오에、한밤중에）。',
    ko: '기억하세요: 만나는 시간에는 "에"를 붙여요 (3시에, 정오에, 한밤중에).',
    es: 'Recuerda: Usa "에" con horas de encuentro (3시에, 정오에, 한밤중에).',
    fr: 'Rappel : Utilise "에" avec des heures de rendez-vous (3시에, 정오에, 한밤중에).',
  },
  es: {
    en: 'Remember: Use "a las" with specific times (a las 3pm, a las 12, a la medianoche).',
    ja: '覚えておきましょう：具体的な時刻には「a las」を使います（a las 3pm、a las 12、a la medianoche）。',
    ko: '기억하세요: 구체적인 시간에는 "a las"를 사용해요 (a las 3pm, a las 12, a la medianoche).',
    es: 'Recuerda: Usa "a las" con horas específicas (a las 3pm, a las 12, a la medianoche).',
    fr: 'Rappel : Utilise "a las" avec des heures précises (a las 3pm, a las 12, a la medianoche).',
  },
  fr: {
    en: 'Remember: Use "à" with specific times (à 15h, à midi, à minuit).',
    ja: '覚えておきましょう：具体的な時刻には「à」を使います（à 15h、à midi、à minuit）。',
    ko: '기억하세요: 구체적인 시간에는 "à"를 사용해요 (à 15h, à midi, à minuit).',
    es: 'Recuerda: Usa "à" con horas específicas (à 15h, à midi, à minuit).',
    fr: 'Rappel : Utilise "à" avec des heures précises (à 15h, à midi, à minuit).',
  },
};

export const FEEDBACK_ITEMS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'Add "at" before the time: "Let\'s meet at 3pm" (not "meet 3pm").',
    ja: "時刻の前に「at」を付けましょう：「Let's meet at 3pm」（「meet 3pm」ではありません）。",
    ko: '시간 앞에 "at"을 넣으세요: "Let\'s meet at 3pm" ("meet 3pm"이 아니에요).',
    es: 'Agrega "at" antes de la hora: "Let\'s meet at 3pm" (no "meet 3pm").',
    fr: 'Ajoute "at" avant l\'heure : "Let\'s meet at 3pm" (pas "meet 3pm").',
  },
  ja: {
    en: 'Use "に" (ni) after the time: "3時に会おう" (not "3時で会おう").',
    ja: '時刻の後に「に」を付けましょう：「3時に会おう」（「3時で会おう」ではありません）。',
    ko: '시간 뒤에 "に"를 넣으세요: "3時に会おう(산지 니 아오)" ("3時で会おう(산지 데 아오)"가 아니에요).',
    es: 'Añade "に" después de la hora: "3時に会おう" (no "3時で会おう").',
    fr: 'Ajoute "に" après l\'heure : "3時に会おう" (pas "3時で会おう").',
  },
  ko: {
    en: 'Use "에" (e) after the time: "3시에 만나자" (not "3시 만나자").',
    ja: '時刻の後に「에」を付けましょう：「3시에 만나자」（「3시 만나자」ではありません）。',
    ko: '시간 뒤에 "에"를 넣으세요: "3시에 만나자" ("3시 만나자"가 아니에요).',
    es: 'Añade "에" después de la hora: "3시에 만나자" (no "3시 만나자").',
    fr: 'Ajoute "에" après l\'heure : "3시에 만나자" (pas "3시 만나자").',
  },
  es: {
    en: 'Add "a las" before the time: "Nos vemos a las 3pm" (not "Nos vemos 3pm").',
    ja: '時刻の前に「a las」を付けましょう：「Nos vemos a las 3pm」（「Nos vemos 3pm」ではありません）。',
    ko: '시간 앞에 "a las"를 넣으세요: "Nos vemos a las 3pm" ("Nos vemos 3pm"이 아니에요).',
    es: 'Agrega "a las" antes de la hora: "Nos vemos a las 3pm" (no "Nos vemos 3pm").',
    fr: 'Ajoute "a las" avant l\'heure : "Nos vemos a las 3pm" (pas "Nos vemos 3pm").',
  },
  fr: {
    en: 'Add "à" before the time: "On se voit à 15h" (not "On se voit 15h").',
    ja: '時刻の前に「à」を付けましょう：「On se voit à 15h」（「On se voit 15h」ではありません）。',
    ko: '시간 앞에 "à"를 넣으세요: "On se voit à 15h" ("On se voit 15h"가 아니에요).',
    es: 'Agrega "à" antes de la hora: "On se voit à 15h" (no "On se voit 15h").',
    fr: 'Ajoute "à" avant l\'heure : "On se voit à 15h" (pas "On se voit 15h").',
  },
};

// Text library for all conversation texts
export const TEXT_LIBRARY: Record<TextKey, Record<DemoLocale, string>> = {
  greeting: {
    en: 'When are you free this week? We should hang out!',
    ja: '今週いつ空いてる？遊ぼうよ！',
    ko: '이번 주에 언제 시간 돼? 우리 놀자!',
    es: '¿Cuándo tienes tiempo esta semana? ¡Salgamos!',
    fr: "T'es libre quand cette semaine ? On devrait se voir !",
  },
  greetingReply: {
    en: 'Pretty good! How about you?',
    ja: 'まあまあかな！君は？',
    ko: '괜찮아! 너는?',
    es: '¡Bien! ¿Y tú?',
    fr: 'Plutôt bien ! Et toi ?',
  },
  askDay: {
    en: 'How was your day?',
    ja: '今日はどうでしたか？',
    ko: '오늘 어땠어요?',
    es: '¿Cómo estuvo tu día?',
    fr: "Comment s'est passée ta journée ?",
  },
  replyBusy: {
    en: 'Tomorrow works for me. What time is good for you?',
    ja: '明日がいいな。何時ごろがいい？',
    ko: '나는 내일이 좋아. 몇 시쯤 괜찮아?',
    es: 'Mañana me viene bien. ¿Qué hora te va bien?',
    fr: 'Demain me va bien. Quelle heure te convient ?',
  },
  typingKeywords: {
    en: 'tomorrow what time',
    ja: '明日 何時',
    ko: '내일 몇시',
    es: 'mañana qué hora',
    fr: 'demain quelle heure',
  },
  askDetails: {
    en: 'How about 3pm?',
    ja: '3時はどう？',
    ko: '3시 어때?',
    es: '¿Qué tal a las 3?',
    fr: '15h, ça te va ?',
  },
  userWrongResponse: {
    en: "Great! Let's meet 3pm tomorrow then.",
    ja: 'いいね！じゃあ明日3時で会おう。',
    ko: '좋아! 그럼 내일 3시 만나자.',
    es: '¡Genial! Nos vemos 3pm mañana entonces.',
    fr: 'Super ! On se voit 15h demain alors.',
  },
  // Legacy single-level feedback (for backward compatibility, just use native lang)
  feedbackSummary: {
    en: 'Great job! You communicated confidently and clearly throughout the conversation. ✨',
    ja: '素晴らしいです！会話全体を通して、自信を持って明確にコミュニケーションを取れていました。✨',
    ko: '잘하셨어요! 대화 전체에서 자신감 있고 명확하게 의사소통을 하셨네요. ✨',
    es: '¡Muy bien! Te comunicaste con confianza y claridad durante toda la conversación. ✨',
    fr: 'Excellent travail ! Tu as communiqué avec confiance et clarté tout au long de la conversation. ✨',
  },
  feedbackTip: {
    en: 'Remember: Practice makes perfect!',
    ja: '覚えておきましょう：練習は完璧を作ります！',
    ko: '기억하세요: 연습이 완벽을 만들어요!',
    es: 'Recuerda: ¡La práctica hace al maestro!',
    fr: "Rappel : C'est en forgeant qu'on devient forgeron !",
  },
  feedbackItem: {
    en: 'Keep practicing to improve.',
    ja: '上達するために練習を続けましょう。',
    ko: '계속 연습하면 실력이 늘어요.',
    es: 'Sigue practicando para mejorar.',
    fr: "Continue à pratiquer pour t'améliorer.",
  },
};

// Demo templates
export const DEMO_TEMPLATES: Record<string, DemoTemplate> = {
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

// Languages for selection
export const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

// Short examples for level selection
export const SHORT_EXAMPLES: Record<DemoLocale, string> = {
  en: 'What time works for you tomorrow?',
  ja: '明日は何時がいいですか？',
  ko: '내일 몇 시가 좋아?',
  es: '¿Qué hora te va bien mañana?',
  fr: 'Quelle heure te convient demain ?',
};

export const SHORT_EXAMPLE_PRONUNCIATIONS: Record<DemoLocale, Record<DemoLocale, string>> = {
  en: {
    en: 'What time works for you tomorrow?',
    ja: 'ワット タイム ワークス フォー ユー トゥモロー？',
    ko: '왓 타임 웍스 포 유 투모로우?',
    es: 'Uát táim uorks for iú tumórou?',
    fr: 'Ouat taïm oueurks for you toumorou?',
  },
  ja: {
    en: 'Ashita wa nanji ga ii desu ka?',
    ja: '明日は何時がいいですか？',
    ko: '아시타 와 난지 가 이 데스 카?',
    es: 'Ashita wa nanyi ga ii desu ka?',
    fr: 'Ashita wa nanji ga ii déss ka?',
  },
  ko: {
    en: 'Naeir myeot siga joah?',
    ja: 'ネイル ミョッ シガ チョア？',
    ko: '내일 몇 시가 좋아?',
    es: 'Naeir myeot siga yoah?',
    fr: 'Naeir myeot siga joah?',
  },
  es: {
    en: 'keh O-ra teh vah bee-EN ma-NYA-na?',
    ja: 'ケ オラ テ バ ビエン マニャナ？',
    ko: '케 오라 테 바 비엔 마냐나?',
    es: '¿Qué hora te va bien mañana?',
    fr: '¿Qué hora te va bien mañana?',
  },
  fr: {
    en: 'kel UR tuh kon-vee-AN duh-MAN?',
    ja: 'ケル ウール トゥ コンヴィアン ドゥマン？',
    ko: '켈 우르 트 콩비앙 드망?',
    es: 'Kel eur te convián deman?',
    fr: 'Quelle heure te convient demain ?',
  },
};

export const SHORT_EXAMPLE_TRANSLATIONS: Record<DemoLocale, string> = {
  en: 'What time works for you tomorrow?',
  ja: '明日は何時がいいですか？',
  ko: '내일 몇 시가 좋아?',
  es: '¿Qué hora te va bien mañana?',
  fr: 'Quelle heure te convient demain ?',
};

// Language examples matrix
export const LANGUAGE_EXAMPLES: Record<string, Record<string, ExamplePhrase>> = DEMO_LOCALES.reduce(
  (matrix, learning) => {
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
  },
  {} as Record<string, Record<string, ExamplePhrase>>
);

const makeDemoMemories = (
  locale: DemoLocale,
  entries: { user: string; partner: string; interaction: string }
): Memory[] => [
  {
    id: `demo-memory-${locale}-user`,
    text: entries.user,
    category: 'fact',
    retention: 'long_term',
    scope: 'user',
  },
  {
    id: `demo-memory-${locale}-partner`,
    text: entries.partner,
    category: 'fact',
    retention: 'long_term',
    scope: 'partner',
  },
  {
    id: `demo-memory-${locale}-interaction`,
    text: entries.interaction,
    category: 'context',
    retention: 'short_term',
    scope: 'interaction',
  },
];

export const DEMO_MEMORY_RECORDS: Record<DemoLocale, Memory[]> = {
  en: makeDemoMemories('en', {
    user: 'You mentioned wanting to hang out this week and prefer afternoon meetups.',
    partner: 'Emma prefers scheduling around 3pm and keeps the tone relaxed.',
    interaction: 'You agreed to meet tomorrow at 3pm to hang out.',
  }),
  ja: makeDemoMemories('ja', {
    user: '今週は友達と遊ぶのが好きで、午後が都合よさそうだと話していました。',
    partner: 'Emmaさんは午後3時頃を提案していて、リラックスした予定を好むようです。',
    interaction: '明日午後3時に会うことで話がまとまりました。',
  }),
  ko: makeDemoMemories('ko', {
    user: '이번 주에 친구들과 만나고 싶어하고 오후 시간이 괜찮다고 말씀하셨어요.',
    partner: 'Emma는 오후 3시쯤을 추천하며 편안한 약속을 선호해요.',
    interaction: '내일 오후 3시에 만나기로 했어요.',
  }),
  es: makeDemoMemories('es', {
    user: 'Dijiste que esta semana prefieres salir con amigos y que la tarde te viene bien.',
    partner: 'Emma puede a las 3pm y disfruta de planes relajados.',
    interaction: 'Quedaron en verse mañana a las 3pm para pasar el rato.',
  }),
  fr: makeDemoMemories('fr', {
    user: "Tu as dit que tu voulais sortir avec des amis cette semaine et que l'après-midi te convenait.",
    partner: 'Emma est dispo vers 15h et aime les plans détendus.',
    interaction: 'Vous avez convenu de vous voir demain à 15h pour passer un bon moment.',
  }),
};

// Helper functions
export const isDemoLocale = (value: string): value is DemoLocale => DEMO_LOCALES.includes(value as DemoLocale);

export const normalizeLocale = (locale: string): DemoLocale => {
  const lowered = locale.toLowerCase();
  return isDemoLocale(lowered) ? (lowered as DemoLocale) : 'en';
};

export const getDemoMemoryRecords = (locale: string): Memory[] => DEMO_MEMORY_RECORDS[normalizeLocale(locale)];

export const getLocalizedText = (key: TextKey, locale: string): string => {
  const normalized = normalizeLocale(locale);
  return TEXT_LIBRARY[key][normalized] ?? TEXT_LIBRARY[key].en;
};

export const getDemoTemplate = (learningLang: string): DemoTemplate =>
  DEMO_TEMPLATES[learningLang] ?? DEMO_TEMPLATES.en;

export const getLanguageExample = (learningLang: string, nativeLang: string): ExamplePhrase | undefined => {
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
