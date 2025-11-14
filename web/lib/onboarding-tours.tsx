import type { Tour } from 'nextstepjs';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

// Build tours lazily so i18n functions run after Lingui is initialized (client side)
export const getGlassTours = (): Tour[] => [
  {
    tour: 'first-time-user',
    steps: [
      // Step 0: Welcome
      {
        icon: <img src="/glass-ai.png" alt="Glass AI" className={'w-8 h-8 rounded-full'} />,
        title: t`Hey! I'm Glass.`,
        content: (
          <>
            <p className={'mb-3'}>
              <Trans>I'm here to help you communicate and learn a new language through real conversations.</Trans>
            </p>
            <p>
              <Trans>Let me show you how I'll help you.</Trans>
            </p>
          </>
        ),
        showControls: false,
        showSkip: false,
      },

      // Step 1: I help you understand
      {
        icon: '👂',
        title: t`I help you understand`,
        content: (
          <p>
            <Trans>I listen and translate what they say in real time. You'll never miss a word.</Trans>
          </p>
        ),
        selector: '#glass-messages-cards',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 12,
        pointerRadius: 12,
      },

      // Step 2: I help you speak
      {
        icon: '💬',
        title: t`I help you speak`,
        content: (
          <p>
            <Trans>Just type a few words in your language. I'll turn them into a full sentence you can speak.</Trans>
          </p>
        ),
        selector: '#glass-input-and-suggestion',
        side: 'top',
        showControls: false,
        showSkip: false,
        pointerPadding: 10,
        pointerRadius: 12,
      },

      // Step 3: I help you learn
      {
        icon: '✨',
        title: t`I help you learn`,
        content: (
          <p>
            <Trans>
              After each conversation, I'll give you feedback on your grammar, pronunciation, and vocabulary. So you
              keep improving naturally.
            </Trans>
          </p>
        ),
        selector: '#glass-ai-with-feedback',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 10,
        pointerRadius: 12,
      },

      // Step 4: After the conversation - Review
      {
        icon: '📊',
        title: t`After each conversation`,
        content: (
          <p>
            <Trans>
              I'll turn your real conversations into learning materials. Review the conversation history and feedback.
            </Trans>
          </p>
        ),
        selector: '#glass-scores-feedback',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 20,
        pointerRadius: 12,
      },

      // Step 5: Memory section
      {
        icon: '🧠',
        title: t`I remember you`,
        content: (
          <p>
            <Trans>
              I remember things about you and get smarter at giving feedback and suggestions the more we talk.
            </Trans>
          </p>
        ),
        selector: '#glass-memory-section',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 20,
        pointerRadius: 12,
      },

      // Step 6: Ready to start
      {
        icon: '🎉',
        title: t`You're all set!`,
        content: (
          <>
            <p className={'mb-3'}>
              <Trans>You're ready to have real conversations. No fear, no hesitation.</Trans>
            </p>
            <p className={'font-medium'}>
              <Trans>Let's start your first conversation!</Trans>
            </p>
          </>
        ),
        selector: undefined,
        showControls: true,
        showSkip: false,
      },
    ],
  },
];
