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

      // Step 1: Your conversation appears here
      {
        icon: '💬',
        title: t`I listen to your conversation`,
        content: (
          <p>
            <Trans>
              I'll listen to you and your partner, and translate what they say so you can understand each other.
            </Trans>
          </p>
        ),
        selector: '#glass-messages-content',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 12,
        pointerRadius: 12,
      },

      // Step 2: I'm listening to help you in real-time
      {
        icon: '🎧',
        title: t`This is where I help and suggest what to say`,
        content: (
          <p>
            <Trans>
              I&apos;ll listen and help here. I&apos;ll suggest what to say next, so just say it. I remember a bit from
              our chats to get better over time.
            </Trans>
          </p>
        ),
        selector: '#glass-ai-panel',
        side: 'top',
        showControls: false,
        showSkip: false,
        pointerPadding: 10,
        pointerRadius: 12,
      },

      // Step 3: Feedback
      {
        icon: '💭',
        title: t`I'll give you feedback`,
        content: (
          <p>
            <Trans>
              If your grammar, pronunciation, or word choice is off, I&apos;ll flag it and suggest a clearer, more
              natural option.
            </Trans>
          </p>
        ),
        selector: '#glass-ai-panel',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 10,
        pointerRadius: 12,
      },

      // Step 4: Quick Translation
      {
        icon: '⚡',
        title: t`Quick translation`,
        content: (
          <p>
            <Trans>
              Want to say something but don&apos;t know the sentence? Type in your language or a few keywords. I&apos;ll
              show the translation.
            </Trans>
          </p>
        ),
        selector: '#glass-translate-section',
        side: 'top',
        showControls: false,
        showSkip: false,
        pointerPadding: 10,
        pointerRadius: 12,
      },

      // Step 5: Ready to start
      {
        icon: '🎉',
        title: t`Congrats! You're all set.`,
        content: (
          <>
            <p className={'mb-3'}>
              <Trans>You've completed the tour and learned how I work.</Trans>
            </p>
            <p className={'font-medium'}>
              <Trans>Now let's start your first real conversation!</Trans>
            </p>
          </>
        ),
        showControls: true,
        showSkip: false,
      },
    ],
  },
];
