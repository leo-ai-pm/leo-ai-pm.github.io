import {oneSentence} from './aihot-client.mjs';

const labels = {'ai-models': '模型', 'ai-products': '产品', industry: '行业', paper: '论文', tip: '技巧'};
const httpURL = value => {try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '';} catch {return '';}};

export function shapeSelected(item, {unselected = false} = {}) {
  if (!item?.id || !item.title) return null;
  const sourceUrl = httpURL(item.links?.original);
  const aihotUrl = httpURL(item.links?.aihot);
  if (!sourceUrl && !aihotUrl) return null;
  const published = Number.isFinite(Date.parse(item.publishedAt));
  const discovered = Number.isFinite(Date.parse(item.discoveredAt));
  return {
    id: item.id,
    title: item.title,
    reason: oneSentence(item.reason),
    summary: oneSentence(item.summary),
    sourceName: item.source?.name || '',
    sourceUrl: sourceUrl || aihotUrl,
    aihotUrl: aihotUrl || sourceUrl,
    publishedAt: published ? item.publishedAt : (discovered ? item.discoveredAt : null),
    timeBasis: published ? 'published' : (discovered ? 'discovered' : 'unknown'),
    category: item.category || '',
    categoryLabel: labels[item.category] || '动态',
    unselected,
  };
}

function query(params) {
  return '/api/v1/items?' + new URLSearchParams(params);
}

async function readItems(client, params) {
  const body = await client.get(query(params));
  if (!Array.isArray(body?.items)) throw new Error('精选结构异常');
  return body.items;
}

export function createSelectedFeed({client, categories, watchTopics, restored = null, now = Date.now}) {
  let state = restored?.today || restored?.watch ? restored : {status: 'waiting', checkedAt: null, nextCheckAt: 0, today: [], week: [], watch: [], message: ''};
  let pending = null;
  const snapshot = () => ({
    status: state.status,
    checkedAt: state.checkedAt,
    nextCheckAt: state.nextCheckAt,
    message: state.message || '',
    categories,
    today: state.today || [],
    week: state.week || [],
    watch: state.watch || [],
  });
  async function loadWatch(topic) {
    const base = {mode: 'selected', window: '7d', q: topic.q, limit: '6'};
    let items = await readItems(client, base);
    let unselected = false;
    if (!items.length) {
      items = await readItems(client, {...base, mode: 'all'});
      unselected = true;
    }
    return {id: topic.id, label: topic.label, query: topic.q, unselected, items: items.map(item => shapeSelected(item, {unselected})).filter(Boolean)};
  }
  async function refresh() {
    const failures = [];
    let today = state.today || [];
    let week = state.week || [];
    let watch = state.watch || [];
    try {
      today = (await readItems(client, {mode: 'selected', window: '24h', limit: '40'})).map(item => shapeSelected(item)).filter(Boolean);
    } catch (error) {failures.push('today');}
    const weekItems = [];
    const seen = new Set();
    for (const category of categories) {
      try {
        const items = await readItems(client, {mode: 'selected', window: '7d', category: category.id, limit: '8'});
        for (const item of items) {
          const shaped = shapeSelected(item);
          if (!shaped || seen.has(shaped.id)) continue;
          seen.add(shaped.id);
          weekItems.push(shaped);
        }
      } catch {failures.push(category.id);}
    }
    if (weekItems.length || !failures.length) week = weekItems;
    const nextWatch = [];
    for (const topic of watchTopics) {
      try {nextWatch.push(await loadWatch(topic));}
      catch {failures.push(topic.id); const previous = (state.watch || []).find(item => item.id === topic.id); if (previous) nextWatch.push(previous);}
    }
    if (nextWatch.length) watch = nextWatch;
    const t = now();
    if (failures.length && !today.length && !week.length && !watch.some(item => item.items?.length)) {
      state = {...state, status: 'error', nextCheckAt: t + 300000, message: '精选暂时无法更新，已保留上次内容。'};
    } else {
      state = {status: failures.length ? 'partial' : 'ok', checkedAt: new Date(t).toISOString(), nextCheckAt: t + 60000, today, week, watch, message: failures.length ? '部分精选暂时没有更新，其余栏目照常显示。' : ''};
    }
    return snapshot();
  }
  return {snapshot, exportState: () => state, check() {if (pending) return pending; if (now() < (state.nextCheckAt || 0)) return Promise.resolve(snapshot()); pending = refresh().finally(() => pending = null); return pending;}};
}
