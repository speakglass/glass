'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings as SettingsIcon, RefreshCw, Mic, Sun, Moon, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from 'next-themes';
import { useGlass } from '@/contexts/GlassContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const voice = useGlass();
  const { settings, updateSettings } = voice;
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const localMicDeviceId = settings.micDeviceId || '';

  const audioInputs = useMemo(() => devices.filter((d) => d.kind === 'audioinput'), [devices]);
  const appearance: 'light' | 'dark' | 'glass' =
    settings.glassMode ?? false ? 'glass' : (theme as 'light' | 'dark') || 'light';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const enumerate = async () => {
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const mapped: AudioDevice[] = mediaDevices.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '',
        kind: d.kind,
      }));
      setDevices(mapped);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;
    enumerate();
  }, [open]);

  const setMic = (micDeviceId: string | null) => updateSettings({ micDeviceId });

  const selectAppearance = (mode: 'light' | 'dark' | 'glass') => {
    if (mode === 'glass') {
      updateSettings({ glassMode: true });
      setTheme('dark'); // ensure good contrast for glass
      return;
    }
    // light or dark -> disable glass, set theme
    updateSettings({ glassMode: false });
    setTheme(mode);
  };

  return (
    <div className={'relative'} ref={panelRef}>
      <Button
        variant={'outline'}
        size={'icon'}
        aria-label="Open settings"
        className={'ml-auto flex items-center gap-1.5 rounded-full w-9 sm:w-auto sm:px-3'}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon className={'size-4'} />
        <span className={'hidden sm:inline'}>Settings</span>
      </Button>
      {open && (
        <div
          className={
            'absolute right-0 mt-2 w-[320px] rounded-xl border border-border/50 bg-card/80 backdrop-blur-md shadow-lg z-50 overflow-hidden'
          }
        >
          {/* Header */}
          <div className={'flex items-center justify-between px-4 py-3 border-b border-border'}>
            <div className={'text-sm font-medium'}>Settings</div>
            <button
              onClick={enumerate}
              className={
                'text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent'
              }
              title="Refresh devices"
            >
              <RefreshCw className={'size-3'} />
              Refresh
            </button>
          </div>

          {/* Content */}
          <div className={'p-4 flex flex-col gap-4'}>
            {/* Microphone Section */}
            <div className={'flex flex-col gap-2'}>
              <label className={'text-xs font-medium text-muted-foreground'}>Microphone</label>
              <div className={'flex items-center gap-2 min-w-0'}>
                <Mic className={'size-4 text-muted-foreground shrink-0'} />
                <select
                  className={
                    'flex-1 min-w-0 bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-all'
                  }
                  value={localMicDeviceId}
                  onChange={(e) => setMic(e.target.value || null)}
                >
                  <option value="">System default</option>
                  {audioInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pronunciation mode */}
            <div className={'flex flex-col gap-2'}>
              <label className={'text-xs font-medium text-muted-foreground'}>Pronunciation format</label>
              <div className={'flex items-center gap-2'}>
                <select
                  className={
                    'flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-all'
                  }
                  value={settings.pronunciationMode || 'native'}
                  onChange={(e) =>
                    updateSettings({ pronunciationMode: (e.target.value as 'native' | 'romaji') || 'native' })
                  }
                >
                  <option value="native">Native script</option>
                  <option value="romaji">Romaji (Latin)</option>
                </select>
              </div>
            </div>

            {/* Suggestion duration */}
            <div className={'flex flex-col gap-2'}>
              <label className={'text-xs font-medium text-muted-foreground'}>Suggestion duration</label>
              <div className={'flex items-center gap-2'}>
                <select
                  className={
                    'flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-all'
                  }
                  value={String(settings.suggestionDurationSec ?? 20)}
                  onChange={(e) => updateSettings({ suggestionDurationSec: parseInt(e.target.value || '20', 10) })}
                >
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="20">20 seconds (default)</option>
                  <option value="30">30 seconds</option>
                </select>
              </div>
            </div>

            {/* Divider */}
            <div className={'h-px bg-border'} />

            {/* Theme (Light / Dark / Glass) */}
            <div className={'flex items-center justify-between'}>
              <div className={'text-sm font-medium'}>Theme</div>
              <div
                className={'inline-flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5 w-auto'}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => selectAppearance('light')}
                      className={[
                        'inline-flex items-center justify-center rounded-sm p-1.5 size-7 transition-colors',
                        appearance === 'light'
                          ? 'bg-accent text-foreground'
                          : 'hover:bg-accent/60 text-muted-foreground',
                      ].join(' ')}
                      aria-label="Light theme"
                    >
                      <Sun className={'size-4 shrink-0'} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Light</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => selectAppearance('dark')}
                      className={[
                        'inline-flex items-center justify-center rounded-sm p-1.5 size-7 transition-colors',
                        appearance === 'dark'
                          ? 'bg-accent text-foreground'
                          : 'hover:bg-accent/60 text-muted-foreground',
                      ].join(' ')}
                      aria-label="Dark theme"
                    >
                      <Moon className={'size-4 shrink-0'} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Dark</TooltipContent>
                </Tooltip>
                <div className={'w-px h-5 bg-border/80 mx-0'} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => selectAppearance('glass')}
                      className={[
                        'inline-flex items-center justify-center rounded-sm p-1.5 size-7 transition-colors',
                        appearance === 'glass'
                          ? 'bg-accent text-foreground'
                          : 'hover:bg-accent/60 text-muted-foreground',
                      ].join(' ')}
                      aria-label="Glass mode"
                    >
                      <Sparkles className={'size-4 shrink-0'} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Glass</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
