export type RoleplayVoiceOption = {
  id: string;
  label: string;
  description: string;
  localeTag: string;
  vibe: string;
  sampleText: string;
  gender: 'female' | 'male';
};

export const ROLEPLAY_VOICE_OPTIONS: RoleplayVoiceOption[] = [
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    label: 'Sena',
    description: 'Warm and calm Korean female voice',
    localeTag: 'KR',
    vibe: 'Calm / Supportive',
    sampleText: 'Annyeong! What would you like to talk about today? Feel free to start.',
    gender: 'female',
  },
  {
    id: 'iP95p4xoKVk53GoZ742B',
    label: 'Minjun',
    description: 'Bright and energetic Korean male voice',
    localeTag: 'KR',
    vibe: 'Energetic / Encouraging',
    sampleText: 'Bangawo! Let us chat and build your confidence step by step.',
    gender: 'male',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    label: 'Rachel',
    description: 'Friendly North American accent',
    localeTag: 'EN-US',
    vibe: 'Friendly / Modern',
    sampleText: "Hi! I'm excited to roleplay with you. What kind of scene should we try today?",
    gender: 'female',
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    label: 'Antoni',
    description: 'Smooth and confident male voice',
    localeTag: 'EN-US',
    vibe: 'Confident / Expressive',
    sampleText: "Let's dive right in. Picture me as your co-worker grabbing coffee - ready to chat?",
    gender: 'male',
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    label: 'Bella',
    description: 'Soft British tone',
    localeTag: 'EN-UK',
    vibe: 'Warm / Reassuring',
    sampleText: 'Fancy practicing a cafe chat in London today? I can guide you every step of the way.',
    gender: 'female',
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX',
    label: 'Elli',
    description: 'Delicate storyteller style',
    localeTag: 'EN',
    vibe: 'Soft / Story-driven',
    sampleText: "Imagine we're on a late-night call sharing stories - I'll keep things gentle and slow.",
    gender: 'female',
  },
];
