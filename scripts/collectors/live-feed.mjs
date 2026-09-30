import {createAihotClient, oneSentence} from './aihot-client.mjs';

export const MIN_INTERVAL = 300000;
const safeURL = value => {try {const u = new URL(value); return ['https:', 'http:'].includes(u.protocol);} catch {return false;}};
const officialDomains = ['openai.com', 'anthropic.com', 'nvidia.com', 'deepmind.google', 'blog.google', 'microsoft.com', 'github.blog', 'x.ai'];
const officialHandles = ['openai', 'openaidevs', 'anthropicai', 'claudeai', 'nvidia', 'googledeepmind', 'googleai', 'github', 'huggingface', 'perplexity_ai', 'xai'];
const agent = /\bagents?\b|智能体|codex|claude code|\bbot\b|工具调用|多模型编排/i;
const categories = {'ai-models': '模型进展', 'ai-products': '产品动态', industry: '行业观察', paper: '研究进展', tip: '实践与观点'};

function sourceInfo(item, people) {
  const url = new URL(item.links.original);
  const isX = ['x.com', 'twitter.com'].includes(url.hostname);
  const handle = isX ? (url.pathname.match(/^\/([^/]+)\/status\/\d+\/?$/)?.[1] || '') : '';
  const person = people.find(p => p.handle.toLowerCase() === handle.toLowerCase());
  const official = officialHandles.includes(handle.toLowerCase()) || officialDomains.some(d => url.hostname === d || url.hostname.endsWith('.' + d)) || (url.hostname === 'github.com' && url.pathname.startsWith('/anthropics/'));
  return {platform: isX ? 'X' : '网站', authorHandle: handle, sourceGroup: official ? '机构官方' : person?.group || '媒体与社区', sourceName: person ? `${person.name} · @${handle}` : item.source.name, feedName: item.source.name};
}

function timing(report, now) {
  if (Number.isFinite(Date.parse(report.publishedAt))) return {publishedAt: report.publishedAt, timeBasis: 'published'};
  if (Number.isFinite(Date.parse(report.discoveredAt))) return {publishedAt: report.discoveredAt, timeBasis: 'discovered'};
  if (Number.isFinite(Date.parse(report.latestAt))) return {publishedAt: report.latestAt, timeBasis: 'discovered'};
  return {publishedAt: new Date(now).toISOString(), timeBasis: 'unknown'};
}

function sentenceOf(report) {
  return oneSentence(report.summary) || oneSentence(report.reason) || '来源未提供摘要，可打开原文。';
}

function normalize(report, config, visualFor, now) {
  if (!report?.id || !report.title || !report.source?.name || !safeURL(report.links?.original) || !safeURL(report.links?.aihot)) throw new Error('来源条目不完整');
  const category = report.category || (/IPO|收购|估值/.test(report.title) ? 'industry' : /模型|GPT|WeatherNext/.test(report.title) ? 'ai-models' : /证明|研究/.test(report.title) ? 'paper' : 'ai-products');
  const sentence = sentenceOf(report);
  const time = timing(report, now);
  const item = {id: 'aihot-' + report.id, title: report.title, brief: sentence, summary: sentence,
    category: categories[category] || 'AI 动态',
    topic: agent.test(report.title + ' ' + sentence) ? 'Agent' : 'AI 产品', priority: 'normal', ...sourceInfo(report, config.people),
    sourceUrl: report.links.original, aggregateUrl: report.links.aihot,
    acquiredVia: 'AIHot', ...time, verification: 'AIHOT 摘要 · 原文可查'};
  item.visual = visualFor(item);
  return item;
}

function linkCard(entry) {
  if (!entry?.title || !safeURL(entry.links?.original)) return null;
  return {
    title: entry.title,
    sourceName: entry.source?.name || '',
    sourceUrl: entry.links.original,
    aihotUrl: safeURL(entry.links.aihot) ? entry.links.aihot : '',
    publishedAt: Number.isFinite(Date.parse(entry.publishedAt)) ? entry.publishedAt : null,
  };
}

function rankCard(topic, detail, client, visualFor) {
  const ref = client.storyRef(topic.links?.story);
  const story = detail?.story;
  const latest = oneSentence(story?.latest) || oneSentence(story?.digest);
  const card = {
    rank: topic.rank,
    id: topic.id,
    title: topic.title,
    sourceName: topic.source?.name || '',
    sourceUrl: topic.links.original,
    aihotUrl: topic.links.aihot,
    storyUrl: ref.storyUrl,
    sourceCount: topic.sourceCount,
    participantCount: topic.participantCount,
    latestAt: topic.latestAt,
    expanded: topic.rank <= 3 && Boolean(story),
    latest: topic.rank <= 3 ? latest : '',
    reports: [],
    related: [],
  };
  if (card.expanded) {
    card.reports = (story.reports || []).map(linkCard).filter(Boolean).slice(0, 3);
    card.related = (story.related || []).slice(0, 3).map(item => ({
      title: item.title,
      storyUrl: item.publicId ? `https://aihot.news/story/${item.publicId}` : '',
    })).filter(item => item.title && safeURL(item.storyUrl));
  }
  card.visual = visualFor({title: card.title, sourceName: card.sourceName, category: '热点'});
  return card;
}

export function createLiveFeed({seed, config, voices, visualFor, fetcher = fetch, now = Date.now, onUpdate = async () => {}, restored = null, onError = () => {}, client = null, requestGapMs = 200}) {
  let state = restored || {data: seed, checkedAt: null, nextCheckAt: 0, resources: {}, status: 'waiting', failures: 0};
  const net = client || createAihotClient({baseUrl: config.baseUrl, fetcher, now, resources: state.resources || {}, gapMs: requestGapMs});
  state.resources = net.resources;
  let pending = null;
  const snapshot = () => ({data: state.data, live: {status: state.status, checkedAt: state.checkedAt, nextCheckAt: state.nextCheckAt, intervalSeconds: MIN_INTERVAL / 1000, message: state.message || ''}});
  function retainedPeople() {
    return (state.data.items || []).filter(item => !item.hotRank && !item.isArchive);
  }
  async function collectPeople(used) {
    const pool = [];
    let cursor = null;
    for (let page = 0; page < 4; page++) {
      const q = new URLSearchParams({mode: 'all', window: '24h', by: 'published', limit: '100', ...(cursor ? {cursor} : {})});
      const body = await net.get('/api/v1/items?' + q);
      if (!Array.isArray(body.items) || !body.page) throw new Error('人物动态结构异常');
      pool.push(...body.items);
      cursor = body.page.nextCursor;
      if (!body.page.hasMore || !cursor) break;
    }
    const t = now();
    const candidates = pool.filter(report => {
      if (!report?.id || !report.title || !report.source?.name || !safeURL(report.links?.aihot) || !safeURL(report.links?.original)) return false;
      const stamp = Number.isFinite(Date.parse(report.publishedAt)) ? Date.parse(report.publishedAt) : Date.parse(report.discoveredAt);
      return Number.isFinite(stamp) && stamp >= t - 86400000 && stamp <= t + 300000;
    });
    const items = [];
    const people = config.people.map(person => {
      const matches = candidates.filter(report => {
        const url = new URL(report.links.original);
        return ['x.com', 'twitter.com'].includes(url.hostname) && url.pathname.toLowerCase().startsWith('/' + person.handle.toLowerCase() + '/status/');
      }).sort((a, b) => {
        const stamp = report => Date.parse(report.publishedAt) || Date.parse(report.discoveredAt) || 0;
        return stamp(b) - stamp(a);
      });
      if (matches[0] && !used.has(matches[0].links.original)) {
        items.push(normalize(matches[0], config, visualFor, t));
        used.add(matches[0].links.original);
      }
      return {...person, url: 'https://x.com/' + person.handle, matched: matches.length, status: matches.length ? '本次收录' : voices.some(v => v.authorHandle === person.handle) ? '历史观点已核对' : '本次未检出'};
    });
    return {items, people, received: pool.length, pages: cursor ? 4 : Math.min(4, Math.ceil(pool.length / 100) || 1)};
  }
  async function refresh() {
    try {
      const hot = await net.get('/api/v1/hot-topics', MIN_INTERVAL);
      if (!Array.isArray(hot.items) || !hot.items.length || hot.items.some((item, index) => item.rank !== index + 1)) throw new Error('热点榜结构异常');
      const ranking = [];
      for (const topic of hot.items) {
        let detail = null;
        if (topic.rank <= 3) {
          const ref = net.storyRef(topic.links?.story);
          try {detail = await net.get('/api/v1/stories/' + encodeURIComponent(ref.id));}
          catch (error) {onError(error);}
        } else net.storyRef(topic.links?.story);
        ranking.push(rankCard(topic, detail, net, visualFor));
      }
      let peopleItems = retainedPeople();
      let people = state.data.sources?.people || config.people;
      let peopleStatus = 'retained';
      let received = state.data.sync?.received;
      try {
        const collected = await collectPeople(new Set(ranking.map(item => item.sourceUrl)));
        peopleItems = collected.items;
        people = collected.people;
        received = collected.received;
        peopleStatus = 'ok';
      } catch (error) {
        onError(error);
        peopleStatus = 'error';
      }
      const archived = voices.filter(v => v.isArchive && safeURL(v.sourceUrl)).map(v => ({...v, visual: visualFor(v)}));
      const items = [...peopleItems, ...archived];
      const changed = JSON.stringify(items) !== JSON.stringify(state.data.items) || JSON.stringify(ranking) !== JSON.stringify(state.data.ranking);
      const t = now();
      const data = {...state.data, items, ranking, sources: {...state.data.sources, people}, demo: false,
        date: new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric'}).format(t),
        updatedAt: changed ? new Date(t).toISOString() : state.data.updatedAt,
        editionLabel: 'AIHOT 2.0 · 个人阅读版',
        sync: {...state.data.sync, method: 'AIHOT 官方 API', hotCount: hot.items.length, latestCount: peopleItems.length, archiveCount: archived.length, received, peopleStatus, rankingUrl: 'https://aihot.news/hot'},
        notice: '热点只标名次、来源数和参与者数。页面只保留标题、一句话和回链，全文在 AIHOT 与原文。'};
      const next = {data, checkedAt: new Date(t).toISOString(), nextCheckAt: Math.max(t + MIN_INTERVAL, net.resources['/api/v1/hot-topics']?.validUntil || 0), resources: net.resources, status: peopleStatus === 'error' ? 'partial' : 'ok', failures: 0, message: peopleStatus === 'error' ? '人物动态暂不可用，已保留上次人物内容。' : ''};
      await onUpdate(next);
      state = next;
    } catch (error) {
      onError(error);
      const failures = (state.failures || 0) + 1;
      state = {...state, resources: net.resources, status: 'error', failures, nextCheckAt: now() + Math.max(MIN_INTERVAL * Math.min(2 ** (failures - 1), 12), error.retryAfter || 0), message: '暂时无法连接 AIHOT，已保留上次资讯，稍后自动重试。'};
    }
    return snapshot();
  }
  return {snapshot, exportState: () => state, check() {if (pending) return pending; if (now() < state.nextCheckAt) return Promise.resolve(snapshot()); pending = refresh().finally(() => pending = null); return pending;}};
}
