export const AIHOT_HOSTS = ['aihot.news', 'aihot.virxact.com'];

export function oneSentence(value, limit = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const matched = text.match(/^.{1,220}?[。！？]/u);
  let sentence = (matched ? matched[0] : text).trim();
  if (sentence.length > limit) sentence = sentence.slice(0, limit - 1).trimEnd() + '…';
  return sentence;
}

export function issueNumber(date, epoch = '2026-09-14') {
  const day = Date.parse(`${date}T00:00:00+08:00`);
  const start = Date.parse(`${epoch}T00:00:00+08:00`);
  if (!Number.isFinite(day) || !Number.isFinite(start)) return null;
  return Math.max(1, Math.floor((day - start) / 86400000) + 1);
}

const safeURL = value => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
};

export function createAihotClient({baseUrl, fetcher = fetch, now = Date.now, resources = {}, userAgent = 'leo-ai-daily/2.0 (+https://leo-ai-pm.github.io/)', gapMs = 200, allowedHosts = AIHOT_HOSTS}) {
  const origin = new URL(baseUrl).origin;
  const hosts = new Set([new URL(baseUrl).hostname, ...allowedHosts]);
  let tail = Promise.resolve();
  const pace = () => {
    if (!gapMs) return Promise.resolve();
    const job = tail.then(() => new Promise(resolve => setTimeout(resolve, gapMs)));
    tail = job.then(() => {}, () => {});
    return job;
  };
  function retryDelay(response, t) {
    const retry = response.headers.get('retry-after');
    if (!retry) return 0;
    const seconds = Number(retry);
    return Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retry) - t);
  }
  async function get(path, floor = 60000) {
    const cached = resources[path];
    const t = now();
    if (cached && t < cached.validUntil) return cached.body;
    await pace();
    const headers = {Accept: 'application/json', 'User-Agent': userAgent};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    let response = await fetcher(origin + path, {headers, signal: AbortSignal.timeout(15000)});
    if ((response.status === 429 || response.status === 503)) {
      const wait = retryDelay(response, now());
      if (wait > 0 && wait <= 5000) {
        await new Promise(resolve => setTimeout(resolve, wait));
        response = await fetcher(origin + path, {headers, signal: AbortSignal.timeout(15000)});
      }
    }
    const interval = Math.max(floor, Number(response.headers.get('cache-control')?.match(/s-maxage=(\d+)/)?.[1] || 0) * 1000);
    if (response.status === 304 && cached) {
      resources[path] = {...cached, validUntil: t + interval};
      return cached.body;
    }
    if (!response.ok) {
      const error = new Error('AIHOT 暂时不可用');
      error.retryAfter = retryDelay(response, now());
      throw error;
    }
    const body = await response.json();
    resources[path] = {body, etag: response.headers.get('etag'), validUntil: t + interval};
    return body;
  }
  function storyRef(link) {
    const url = safeURL(link);
    if (!url || !hosts.has(url.hostname) || !/^\/story\/[^/]+$/.test(url.pathname)) throw new Error('事件链接异常');
    const id = decodeURIComponent(url.pathname.split('/')[2]);
    return {id, storyUrl: `https://aihot.news/story/${id}`};
  }
  function pageURL(value, fallback) {
    const url = safeURL(value);
    return url ? url.href : (fallback || '');
  }
  return {get, resources, storyRef, pageURL, origin, hosts};
}
