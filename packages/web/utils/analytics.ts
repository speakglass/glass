'use client';

// Lightweight, environment-gated Amplitude wrapper with optional Session Replay

type AmplitudeBrowserModule = typeof import('@amplitude/analytics-browser');
type SessionReplayModule = typeof import('@amplitude/plugin-session-replay-browser');

type TrackProps = Parameters<AmplitudeBrowserModule['track']>[1];
type Properties = TrackProps;

let initialized = false;
let amplitudeModule: AmplitudeBrowserModule | null = null;

function analyticsEnabled(): boolean {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
}

export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  if (!analyticsEnabled()) return;
  initialized = true;

  try {
    const amplitude: AmplitudeBrowserModule = await import('@amplitude/analytics-browser');
    const baseOptions: Parameters<typeof amplitude.init>[2] = {
      fetchRemoteConfig: true,
      defaultTracking: {
        pageViews: true,
        sessions: true,
        formInteractions: true,
        fileDownloads: true,
      },
    };

    const autocaptureOptions = {
      autocapture: {
        attribution: true,
        fileDownloads: true,
        formInteractions: true,
        pageViews: true,
        sessions: true,
        elementInteractions: true,
        networkTracking: true,
        webVitals: true,
        frustrationInteractions: true,
      },
    } as unknown as Parameters<typeof amplitude.init>[2];

    const initOptions: Parameters<typeof amplitude.init>[2] = {
      ...baseOptions,
      ...autocaptureOptions,
    };

    amplitude.init(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY as string, undefined, initOptions);
    amplitudeModule = amplitude;

    // Always attempt to enable Session Replay when API key is present
    try {
      const replay: SessionReplayModule = await import('@amplitude/plugin-session-replay-browser');
      const { sessionReplayPlugin } = replay;
      if (sessionReplayPlugin && amplitudeModule?.add) {
        amplitudeModule.add(sessionReplayPlugin({ sampleRate: 1 }));
      }
    } catch {
      // Optional plugin; ignore if unavailable
    }
  } catch (err) {
    // Silent no-op on failure
  }
}

export function track(event: string, properties?: Properties): void {
  if (!analyticsEnabled() || !amplitudeModule) return;
  try {
    amplitudeModule.track(event, properties);
  } catch {}
}

export function setUserId(userId: string | null): void {
  if (!analyticsEnabled() || !amplitudeModule) return;
  try {
    amplitudeModule.setUserId(userId ?? undefined);
  } catch {}
}

export function setUserProperties(properties: Record<string, unknown>): void {
  if (!analyticsEnabled() || !amplitudeModule) return;
  try {
    const Identify = amplitudeModule.Identify;
    const identify = new Identify();
    Object.entries(properties).forEach(([key, value]) => {
      // Accept only primitives/arrays supported by Identify.set
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every((v) => ['string', 'number', 'boolean'].includes(typeof v)))
      ) {
        // @ts-expect-error Identify.set has a union param; runtime check above ensures safety
        identify.set(key, value);
      } else {
        identify.set(key, String(value));
      }
    });
    amplitudeModule.identify(identify);
  } catch {}
}

export function optOutAnalytics(optOut: boolean): void {
  if (!amplitudeModule) return;
  try {
    amplitudeModule.setOptOut(optOut);
  } catch {}
}
