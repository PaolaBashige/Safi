import type { Analysis, AnalyzeRequest } from './types';

let apiUrlPromise: Promise<string> | null = null;

/** The API URL is read at runtime from /config.json so the same build works in any environment. */
function getApiUrl(): Promise<string> {
  apiUrlPromise ??= fetch('/config.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('config'))))
    .then((c: { apiUrl?: string }) => (c.apiUrl ?? import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''))
    .catch(() => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''));
  return apiUrlPromise;
}

export class AnalyzeError extends Error {}

const FRIENDLY: Record<string, string> = {
  empty_content: 'Please add something for Safi to look at first.',
  content_too_long: 'That is too long. Try a shorter message or a single link.',
  image_too_large: 'That image is too large. Try a smaller screenshot (under 3.5 MB).',
  unsupported_image_type: 'Please use a PNG, JPEG, WebP or GIF image.',
  payload_too_large: 'That is too large to analyze. Try something shorter.',
};

export async function analyze(req: AnalyzeRequest): Promise<Analysis> {
  const base = await getApiUrl();
  if (!base) throw new AnalyzeError('Safi is not configured correctly. Please try again later.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new AnalyzeError((err?.code && FRIENDLY[err.code]) || err?.message || 'Safi could not analyze that. Please try again.');
    }
    return data as Analysis;
  } catch (e) {
    if (e instanceof AnalyzeError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new AnalyzeError('That took too long. Please try again.');
    throw new AnalyzeError('Could not reach Safi. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}
