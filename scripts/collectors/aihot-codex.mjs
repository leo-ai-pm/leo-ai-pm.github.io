import {oneSentence} from './aihot-client.mjs';

const httpURL = value => {try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '';} catch {return '';}};
const statusLabel = {confirmed: '已确认', estimated: '估计', pending: '待确认', cancelled: '已取消'};

export function shapeCodex(body) {
  if (!body || !Array.isArray(body.events)) throw new Error('重置监控结构异常');
  return {
    timezone: body.timezone || 'Asia/Shanghai',
    today: body.today || '',
    checkedAt: body.checkedAt || null,
    monitor: body.monitor?.status || '',
    outage: Boolean(body.outage),
    pageUrl: 'https://aihot.news/codex-reset',
    events: body.events.slice(0, 6).map(event => {
      const post = (event.posts || []).find(item => httpURL(item.url));
      return {
        id: String(event.id || ''),
        label: event.displayLabel || event.label || '',
        status: statusLabel[event.status] || '',
        title: oneSentence(event.title, 80),
        at: event.confirmedAt || event.createdAt || post?.publishedAt || null,
        pageUrl: httpURL(event.url) || 'https://aihot.news/codex-reset',
        sourceUrl: post ? httpURL(post.url) : '',
      };
    }).filter(event => event.title || event.label),
  };
}

export function createCodexFeed({client, links, restored = null, now = Date.now}) {
  let state = restored?.codex ? restored : {status: 'waiting', checkedAt: null, nextCheckAt: 0, codex: null, message: ''};
  let pending = null;
  const snapshot = () => ({status: state.status, checkedAt: state.checkedAt, nextCheckAt: state.nextCheckAt, message: state.message || '', codex: state.codex, links});
  async function refresh() {
    try {
      const body = await client.get('/api/v1/codex-resets/recent');
      state = {status: 'ok', checkedAt: new Date(now()).toISOString(), nextCheckAt: now() + 60000, codex: shapeCodex(body), links, message: ''};
    } catch (error) {
      state = {...state, status: 'error', nextCheckAt: now() + Math.max(300000, error.retryAfter || 0), links, message: 'Codex 重置监控暂时无法更新，已保留上次内容。'};
    }
    return snapshot();
  }
  return {snapshot, exportState: () => state, check() {if (pending) return pending; if (now() < (state.nextCheckAt || 0)) return Promise.resolve(snapshot()); pending = refresh().finally(() => pending = null); return pending;}};
}
