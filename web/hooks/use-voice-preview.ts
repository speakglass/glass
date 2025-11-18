import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVoicePreview } from '@/lib/account-api';

interface PlayPreviewArgs {
  voiceId: string;
  sampleText?: string;
}

export function useVoicePreviewPlayer(token?: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // Ignore stop errors
      }
      audioRef.current = null;
    }
    setPlayingVoiceId(null);
  }, []);

  const playPreview = useCallback(
    async ({ voiceId, sampleText }: PlayPreviewArgs) => {
      if (!token) {
        throw new Error('Missing authentication token');
      }

      // Toggle off if the same voice is already playing
      if (playingVoiceId === voiceId && audioRef.current && !audioRef.current.paused) {
        stopPreview();
        return;
      }

      stopPreview();
      setLoadingVoiceId(voiceId);

      try {
        const { audioBase64, mimeType } = await fetchVoicePreview(token, { voiceId, sampleText });
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => {
          setPlayingVoiceId((current) => (current === voiceId ? null : current));
          audioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoiceId((current) => (current === voiceId ? null : current));
          audioRef.current = null;
        };
        setPlayingVoiceId(voiceId);
        try {
          await audio.play();
        } catch (error) {
          stopPreview();
          throw error;
        }
      } finally {
        setLoadingVoiceId((current) => (current === voiceId ? null : current));
      }
    },
    [token, playingVoiceId, stopPreview]
  );

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  return {
    playPreview,
    stopPreview,
    loadingVoiceId,
    playingVoiceId,
  };
}
