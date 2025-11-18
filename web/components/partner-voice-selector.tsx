import { ROLEPLAY_VOICE_OPTIONS } from '@/lib/roleplay-voices';
import { cn } from '@/utils';
import { Loader2, Volume2, Square } from 'lucide-react';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface PartnerVoiceSelectorProps {
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string, sampleText: string) => void | Promise<void>;
  loadingVoiceId?: string | null;
  playingVoiceId?: string | null;
  disabled?: boolean;
}

export function PartnerVoiceSelector({
  selectedVoiceId,
  onSelect,
  onPreview,
  loadingVoiceId,
  playingVoiceId,
  disabled,
}: PartnerVoiceSelectorProps) {
  const selectedVoice =
    ROLEPLAY_VOICE_OPTIONS.find((voice) => voice.id === selectedVoiceId) ?? ROLEPLAY_VOICE_OPTIONS[0];
  const isLoading = loadingVoiceId === selectedVoice?.id;
  const isPlaying = playingVoiceId === selectedVoice?.id;

  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Voice</Label>
      <div className="flex items-center gap-2">
        <Select value={selectedVoiceId} onValueChange={onSelect} disabled={disabled}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {ROLEPLAY_VOICE_OPTIONS.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                      voice.gender === 'female'
                        ? 'bg-pink-500/10 text-pink-500'
                        : 'bg-sky-500/10 text-sky-500'
                    )}
                  >
                    {voice.gender === 'female' ? 'F' : 'M'}
                  </span>
                  <span className="font-medium">{voice.label}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground border px-1 py-0.5 rounded-sm ml-1">
                    {voice.localeTag}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !selectedVoice}
          className={cn(
            'inline-flex items-center gap-1.5',
            disabled && 'opacity-60',
            isPlaying && 'border-destructive/60 text-destructive'
          )}
          onClick={() => {
            if (selectedVoice) {
              onPreview(selectedVoice.id, selectedVoice.sampleText);
            }
          }}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          <span className="text-xs font-medium">{isPlaying ? 'Stop' : 'Preview'}</span>
        </Button>
      </div>
    </div>
  );
}
