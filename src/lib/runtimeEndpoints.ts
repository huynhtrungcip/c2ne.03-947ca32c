const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const isBrowser = typeof window !== 'undefined';

const getCurrentHost = () => (isBrowser ? window.location.hostname : 'localhost');
const getCurrentProtocol = () => (isBrowser ? window.location.protocol : 'http:');

const isLovablePreviewHost = (hostname: string) => hostname.endsWith('.lovable.app');

const toHttpUrl = (raw: string, fallbackPort: number): URL | null => {
  const value = raw.trim();
  if (!value) return null;

  try {
    const normalized = /^https?:\/\//i.test(value)
      ? value
      : /^wss?:\/\//i.test(value)
        ? value.replace(/^ws/i, 'http')
        : `http://${value}`;

    const url = new URL(normalized);
    if (!url.port) url.port = String(fallbackPort);
    return url;
  } catch {
    return null;
  }
};

const getStoredApiUrl = () => {
  if (!isBrowser) return '';
  return window.localStorage.getItem('soc-api-url') || '';
};

const getDefaultHostUrl = (): URL => {
  const host = getCurrentHost();
  const protocol = getCurrentProtocol();
  const envUrl = toHttpUrl(import.meta.env.VITE_API_URL || '', 3001);

  if (host && !['localhost', '127.0.0.1'].includes(host) && !isLovablePreviewHost(host)) {
    return new URL(`${protocol}//${host}:3001`);
  }

  if (envUrl) return envUrl;
  return new URL(`${protocol}//${host}:3001`);
};

export const normalizeBackendUrl = (raw?: string): string => {
  const url = toHttpUrl(raw || '', 3001) || getDefaultHostUrl();
  url.protocol = url.protocol === 'https:' ? 'https:' : 'http:';
  url.port = '3001';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return trimTrailingSlash(url.toString());
};

export const resolveApiUrl = (): string => normalizeBackendUrl(getStoredApiUrl());

export const resolveAiUrl = (apiUrl?: string): string => {
  const url = new URL(normalizeBackendUrl(apiUrl || getStoredApiUrl()));
  url.port = '8000';
  return trimTrailingSlash(url.toString());
};

export const resolveWebSocketUrl = (apiUrl?: string): string => {
  const url = new URL(normalizeBackendUrl(apiUrl || getStoredApiUrl()));
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${url.hostname}:3002`;
};
