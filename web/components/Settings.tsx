'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings as SettingsIcon, RefreshCw, Mic } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { useTheme } from 'next-themes';
import { useGlass } from '@/contexts/GlassContext';

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

  return (
    <div className={'relative'} ref={panelRef}>
      <Button
        variant={'ghost'}
        className={'ml-auto flex items-center gap-1.5 rounded-full'}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon className={'size-4'} />
        <span>Settings</span>
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
                  value={String(settings.suggestionDurationSec ?? 10)}
                  onChange={(e) => updateSettings({ suggestionDurationSec: parseInt(e.target.value || '10', 10) })}
                >
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds (default)</option>
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                </select>
              </div>
            </div>

            {/* Divider */}
            <div className={'h-px bg-border'} />

            {/* Glass Mode */}
            <div className={'flex items-center justify-between'}>
              <div className={'flex flex-col'}>
                <span className={'text-sm font-medium'}>Glass Mode</span>
                <span className={'text-xs text-muted-foreground'}>Enable glass effects</span>
              </div>
              <Switch
                checked={settings.glassMode ?? false}
                onCheckedChange={(v) => updateSettings({ glassMode: v })}
                aria-label="Toggle Glass Mode"
              />
            </div>

            {/* Light Mode */}
            <div className={'flex items-center justify-between'}>
              <div className={'flex flex-col'}>
                <span className={'text-sm font-medium'}>Light Mode</span>
                <span className={'text-xs text-muted-foreground'}>Use light theme</span>
              </div>
              <Switch
                checked={(theme || 'light') === 'light'}
                onCheckedChange={(v) => setTheme(v ? 'light' : 'dark')}
                aria-label="Toggle Light Mode"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
