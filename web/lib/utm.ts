'use client';

import type { ReadonlyURLSearchParams } from 'next/navigation';

export const UTM_STORAGE_KEY = 'glass:first-touch-utm';
export const UTM_PARAM_KEYS = ['utm_source', 'utm_campaign', 'utm_content'] as const;

export type UtmParamKey = (typeof UTM_PARAM_KEYS)[number];
export type UtmParams = Partial<Record<UtmParamKey, string>>;

const sanitize = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 255);
};

const hasWindow = () => typeof window !== 'undefined';

export const getCookieStoredUtmParams = (): UtmParams => {
  if (!hasWindow()) {
    return {};
  }
  try {
    const prefix = `${UTM_STORAGE_KEY}=`;
    const cookies = document.cookie ? document.cookie.split(';') : [];
    const match = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix));
    if (!match) {
      return {};
    }
    const encodedValue = match.slice(prefix.length);
    if (!encodedValue) {
      return {};
    }
    const decoded = decodeURIComponent(encodedValue);
    const parsed = JSON.parse(decoded) as UtmParams;
    return parsed ?? {};
  } catch {
    return {};
  }
};

export const extractUtmParams = (searchParams?: URLSearchParams | ReadonlyURLSearchParams | null): UtmParams => {
  if (!searchParams) {
    return {};
  }
  const params: UtmParams = {};
  for (const key of UTM_PARAM_KEYS) {
    const value = sanitize(searchParams.get(key));
    if (value) {
      params[key] = value;
    }
  }
  return params;
};

export const hasAnyUtmParam = (params: UtmParams): boolean => UTM_PARAM_KEYS.some((key) => Boolean(params[key]));

const persistUtmParams = (params: UtmParams): void => {
  if (!hasWindow()) {
    return;
  }
  try {
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Ignore storage failures (e.g., Safari private browsing)
  }
};

export const getStoredUtmParams = (): UtmParams => {
  if (!hasWindow()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as UtmParams;
    return parsed ?? {};
  } catch {
    return {};
  }
};

export const persistFirstTouchUtm = (incoming: UtmParams, existing?: UtmParams): UtmParams => {
  if (!hasWindow()) {
    return {};
  }
  const current = existing ?? getStoredUtmParams();
  const next: UtmParams = { ...current };
  let changed = false;

  for (const key of UTM_PARAM_KEYS) {
    if (!next[key] && incoming[key]) {
      next[key] = incoming[key];
      changed = true;
    }
  }

  if (changed) {
    persistUtmParams(next);
    return next;
  }

  return current;
};

export const ensureFirstTouchUtm = (searchParams?: URLSearchParams | ReadonlyURLSearchParams | null): UtmParams => {
  if (!hasWindow()) {
    return {};
  }
  const stored = getStoredUtmParams();
  const incoming = extractUtmParams(searchParams ?? new URLSearchParams(window.location.search));
  if (!hasAnyUtmParam(incoming)) {
    if (hasAnyUtmParam(stored)) {
      return stored;
    }
    const cookieParams = getCookieStoredUtmParams();
    if (hasAnyUtmParam(cookieParams)) {
      return persistFirstTouchUtm(cookieParams, stored);
    }
    return stored;
  }
  return persistFirstTouchUtm(incoming, stored);
};

export const toUtmQuery = (params: UtmParams): string => {
  const query = new URLSearchParams();
  for (const key of UTM_PARAM_KEYS) {
    const value = params[key];
    if (value) {
      query.set(key, value);
    }
  }
  return query.toString();
};
