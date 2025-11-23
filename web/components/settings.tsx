'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mic, Sun, Moon, Globe, Clock, Languages, Palette, EyeOff, BookOpen } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useGlass } from '@/contexts/glass-context';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { usePathname } from 'next/navigation';
import { LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';
import { changeLanguage } from '@/utils/language';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAccountSession } from '@/contexts/account-session-context';
import { updateLanguageSettings } from '@/lib/account-api';
import { useQueryClient } from '@tanstack/react-query';
import type { LearningLevel } from '@/types/learning-level';
import { isLearningLevel } from '@/types/learning-level';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEARNING_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

const LANGUAGE_LEVEL_OPTIONS: { value: LearningLevel; label: string }[] = [
  { value: 'zero', label: t`Zero` },
  { value: 'beginner', label: t`Beginner` },
  { value: 'elementary', label: t`Elementary` },
  { value: 'intermediate', label: t`Intermediate` },
  { value: 'advanced', label: t`Advanced` },
];

export default function Settings({ open, onOpenChange }: SettingsProps) {
  const { theme, setTheme } = useTheme();
  const voice = useGlass();
  const { settings, updateSettings } = voice;
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const pathname = usePathname();
  const { snapshot, token } = useAccountSession();
  const queryClient = useQueryClient();

  const localMicDeviceId = settings.micDeviceId || 'default';

  const audioInputs = useMemo(() => devices.filter((d) => d.kind === 'audioinput'), [devices]);
  const appearance: 'light' | 'dark' = (theme as 'light' | 'dark') || 'light';

  useEffect(() => {
    if (!open) return;
    enumerate();
  }, [open]);

  const enumerate = async () => {
    try {
      // Request permission first to get actual device labels and IDs
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const mapped: AudioDevice[] = mediaDevices.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '',
        kind: d.kind,
      }));

      // Remove duplicates by deviceId and filter out 'default' to avoid conflict
      const seen = new Set<string>();
      const uniqueDevices = mapped.filter((d) => {
        if (!d.deviceId || d.deviceId === 'default' || seen.has(d.deviceId)) return false;
        seen.add(d.deviceId);
        return true;
      });

      setDevices(uniqueDevices);

      // If saved device is not in the list, reset to default
      if (settings.micDeviceId && !uniqueDevices.some((d) => d.deviceId === settings.micDeviceId)) {
        updateSettings({ micDeviceId: null });
      }
    } catch (e) {
      // ignore
    }
  };

  const setMic = (micDeviceId: string | null) =>
    updateSettings({ micDeviceId: micDeviceId === 'default' ? null : micDeviceId });

  const selectAppearance = (mode: 'light' | 'dark') => {
    setTheme(mode);
  };

  const handleNativeLangChange = async (langCode: string) => {
    if (!token) return;
    try {
      await updateLanguageSettings(token, { nativeLang: langCode });
      // Update cache
      queryClient.setQueryData(['accountSession'], (old: any) => {
        if (!old?.snapshot) return old;
        return {
          ...old,
          snapshot: {
            ...old.snapshot,
            user: {
              ...old.snapshot.user,
              nativeLang: langCode,
            },
          },
        };
      });
      // Change UI language to match native language
      const newPath = changeLanguage(langCode, pathname, LOCALIZED_LANGUAGE_CODES);
      window.location.href = newPath;
    } catch (error) {
      console.error('Failed to update native language:', error);
    }
  };

  const handleLearningLangChange = async (langCode: string) => {
    if (!token) return;
    try {
      await updateLanguageSettings(token, { learningLang: langCode });
      // Update cache
      queryClient.setQueryData(['accountSession'], (old: any) => {
        if (!old?.snapshot) return old;
        return {
          ...old,
          snapshot: {
            ...old.snapshot,
            user: {
              ...old.snapshot.user,
              learningLang: langCode,
            },
          },
        };
      });
    } catch (error) {
      console.error('Failed to update learning language:', error);
    }
  };

  const handleLanguageLevelChange = async (level: string) => {
    if (!token || !isLearningLevel(level)) return;
    try {
      const result = await updateLanguageSettings(token, { languageLevel: level });
      const resolvedLevel = result.languageLevel ?? level;
      queryClient.setQueryData(['accountSession'], (old: any) => {
        if (!old?.snapshot) return old;
        return {
          ...old,
          snapshot: {
            ...old.snapshot,
            user: {
              ...old.snapshot.user,
              languageLevel: resolvedLevel,
            },
          },
        };
      });
    } catch (error) {
      console.error('Failed to update language level:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg">
            <Trans>Settings</Trans>
          </DialogTitle>
          <DialogDescription className="text-sm">
            <Trans>Customize your Glass experience</Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Microphone Section */}
          <div className="flex items-center justify-between">
            <Label htmlFor="microphone" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <Mic className="size-3.5" />
              <Trans>Microphone</Trans>
            </Label>
            <Select value={localMicDeviceId} onValueChange={setMic}>
              <SelectTrigger id="microphone" className="h-8 w-48">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <Trans>System default</Trans>
                </SelectItem>
                {audioInputs.map((d, idx) => (
                  <SelectItem key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Microphone ${idx + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pronunciation mode */}
          <div className="flex items-center justify-between">
            <Label htmlFor="pronunciation" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <Languages className="size-3.5" />
              <Trans>Pronunciation</Trans>
            </Label>
            <Select
              value={settings.pronunciationMode || 'native'}
              onValueChange={(value: 'native' | 'romaji') => updateSettings({ pronunciationMode: value })}
            >
              <SelectTrigger id="pronunciation" className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">
                  <Trans>Native script</Trans>
                </SelectItem>
                <SelectItem value="romaji">
                  <Trans>Romaji (Latin)</Trans>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto-hide messages */}
          <div className="flex items-center justify-between">
            <Label htmlFor="duration" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <EyeOff className="size-3.5" />
              <Trans>Hide messages</Trans>
            </Label>
            <Select
              value={settings.aiMessageDurationSec === null ? 'none' : String(settings.aiMessageDurationSec ?? 'none')}
              onValueChange={(value) => {
                updateSettings({
                  aiMessageDurationSec: value === 'none' ? null : parseInt(value, 10),
                });
              }}
            >
              <SelectTrigger id="duration" className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <Trans>Never</Trans>
                </SelectItem>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="20">20s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Native Language Selection */}
          <div className="flex items-center justify-between">
            <Label htmlFor="native-lang" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <Globe className="size-3.5" />
              <Trans>Native language</Trans>
            </Label>
            <Select value={snapshot?.user?.nativeLang || ''} onValueChange={handleNativeLangChange}>
              <SelectTrigger id="native-lang" className="h-8 w-48">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LEARNING_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-1.5">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Learning Language Selection */}
          <div className="flex items-center justify-between">
            <Label htmlFor="learning-lang" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <BookOpen className="size-3.5" />
              <Trans>Learning language</Trans>
            </Label>
            <Select value={snapshot?.user?.learningLang || ''} onValueChange={handleLearningLangChange}>
              <SelectTrigger id="learning-lang" className="h-8 w-48">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LEARNING_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-1.5">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language Level Selection */}
          <div className="flex items-center justify-between">
            <Label htmlFor="language-level" className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <Clock className="size-3.5" />
              <Trans>Language level</Trans>
            </Label>
            <Select value={snapshot?.user?.languageLevel || ''} onValueChange={handleLanguageLevelChange}>
              <SelectTrigger id="language-level" className="h-8 w-48">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_LEVEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm font-medium w-36 shrink-0">
              <Palette className="size-3.5" />
              <Trans>Theme</Trans>
            </Label>
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-input bg-background p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAppearance('light')}
                    className={`h-8 w-10 ${appearance === 'light' ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    <Sun className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Light</Trans>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAppearance('dark')}
                    className={`h-8 w-10 ${appearance === 'dark' ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    <Moon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Dark</Trans>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
