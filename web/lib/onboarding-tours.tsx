import type { Tour } from 'nextstepjs';

export const glassTours: Tour[] = [
  {
    tour: 'first-time-user',
    steps: [
      // Step 0: Welcome
      {
        icon: <img src="/glass-ai.png" alt="Glass AI" className={'w-8 h-8 rounded-full'} />,
        title: "Hey! I'm Glass.",
        content: (
          <>
            <p className={'mb-3'}>
              I'm here to help you communicate and learn a new language through real conversations and practice.
            </p>
            <p>Let me show you how I'll help you.</p>
          </>
        ),
        showControls: false,
        showSkip: false,
      },

      // Step 1: Your conversation appears here
      {
        icon: '💬',
        title: 'I listen to your conversation',
        content: (
          <p>I'll listen to you and your partner, and translate what they say so you can understand each other.</p>
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
        title: 'This is where I help you',
        content: <p>As I listen to the conversation, everything I do to help you will appear right here.</p>,
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
        title: "I'll suggest what to say next",
        content: (
          <p>
            I'll suggest what you could say next, so just read it out loud. The more I learn about you, the better my
            suggestions will get.
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
        title: "I'll give you feedback",
        content: <p>If you say something that sounds a bit off, I'll let you know and help you fix it.</p>,
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
        title: 'You can control how much I help',
        content: (
          <p>You can turn my suggestions and feedback on, off, or keep it on auto. By default, it's set to auto.</p>
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
        title: 'Quick translation',
        content: (
          <p>
            Type what you want to say in your language, or even just a few keywords. I'll listen to the conversation and
            suggest the right sentence for you.
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
        title: "Congrats! You're all set.",
        content: (
          <>
            <p className={'mb-3'}>You've completed the tour and learned how I work.</p>
            <p className={'font-medium'}>Now let's start your first real conversation!</p>
          </>
        ),
        showControls: true,
        showSkip: false,
      },
    ],
  },
];
