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
        icon: (
          <img
            src="/glass-ai.png"
            alt="Glass AI"
            className={'w-8 h-8 rounded-full'}
          />
        ),
        title: t`Hey! I'm Glass.`,
        content: (
          <>
            <p className={'mb-3'}>
              <Trans>
                I'm here to help you communicate and learn a new language
                through real conversations and practice.
              </Trans>
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
              I'll listen to you and your partner, and translate what they say
              so you can understand each other.
            </Trans>
          </p>
        ),
        selector: '#glass-messages-scroll-area',
        side: 'bottom',
        showControls: false,
        showSkip: false,
        pointerPadding: 12,
        pointerRadius: 12,
      },

      // Step 2: I'm listening to help you in real-time
      {
        icon: '🎧',
        title: t`This is where I help you`,
        content: (
          <p>
            <Trans>
              As I listen to the conversation, everything I do to help you will
              appear right here.
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

      // Step 3: Suggestions
      {
        icon: '✨',
        title: t`I'll suggest what to say next`,
        content: (
          <p>
            <Trans>
              I'll suggest what you could say next, so just read it out loud.
              The more I learn about you, the better my suggestions will get.
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

      // Step 4: Feedback
      {
        icon: '💭',
        title: t`I'll give you feedback`,
        content: (
          <p>
            <Trans>
              If you say something that sounds a bit off, I'll let you know and
              help you fix it.
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

      // Step 5: Settings
      {
        icon: '⚙️',
        title: t`You can control how much I help`,
        content: (
          <p>
            <Trans>
              You can turn my suggestions and feedback on, off, or keep it on
              auto. By default, it's set to auto.
            </Trans>
          </p>
        ),
        selector: '#glass-settings-button',
        side: 'left',
        showControls: false,
        showSkip: false,
        pointerPadding: 8,
        pointerRadius: 8,
      },

      // Step 6: Quick Translation
      {
        icon: '⚡',
        title: t`Quick translation`,
        content: (
          <p>
            <Trans>
              Type what you want to say in your language, or even just a few
              keywords. I'll listen to the conversation and suggest the right
              sentence for you.
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

      // Step 7: Ready to start
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
