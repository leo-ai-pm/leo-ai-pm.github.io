import {issueNumber, oneSentence} from './aihot-client.mjs';

const dateOK = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const httpURL = value => {try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '';} catch {return '';}};

function contentLink(links = {}) {
  return httpURL(links.aihot) || httpURL(links.original);
}

function shapeItem(item) {
  const sourceUrl = httpURL(item.links?.original);
  const aihotUrl = httpURL(item.links?.aihot);
  if (!item?.title || (!sourceUrl && !aihotUrl)) return null;
  return {
    title: item.title,
    summary: oneSentence(item.summary),
    sourceName: item.source?.name || '',
    sourceUrl: sourceUrl || aihotUrl,
    aihotUrl: aihotUrl || sourceUrl,
  };
}

export function shapeDaily(report, indexItems, {epoch, visualFor, now}) {
  if (!report || !dateOK(report.date) || !report.lead?.title) throw new Error('日报结构异常');
  const leadURL = httpURL(report.links?.aihot) || `https://aihot.news/daily/${report.date}`;
  const summary = oneSentence(report.lead.leadParagraph);
  const lead = {
    title: report.lead.title,
    summary,
    aihotUrl: leadURL,
    visual: visualFor({title: report.lead.title, sourceName: 'AIHOT', category: '今日导读'}),
  };
  return {
    date: report.date,
    dateLabel: new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric'}).format(new Date(`${report.date}T12:00:00+08:00`)),
    weekday: new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', weekday: 'short'}).format(new Date(`${report.date}T12:00:00+08:00`)),
    issue: issueNumber(report.date, epoch),
    generatedAt: report.generatedAt || null,
    aihotUrl: leadURL,
    lead,
    sections: (report.sections || []).map(section => ({
      label: section.label || '未分类',
      items: (section.items || []).map(shapeItem).filter(Boolean),
    })).filter(section => section.items.length),
    flashes: (report.flashes || []).map(item => {
      const shaped = shapeItem({...item, summary: ''});
      if (!shaped) return null;
      return {...shaped, summary: '', publishedAt: Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt : null};
    }).filter(Boolean),
    archive: (indexItems || []).filter(item => dateOK(item.date)).slice(0, 21).map(item => ({
      date: item.date,
      title: item.leadTitle || '',
      aihotUrl: httpURL(item.links?.aihot) || `https://aihot.news/daily/${item.date}`,
    })),
    shapedAt: new Date(now()).toISOString(),
  };
}

export function createDailyReport({client, visualFor, epoch = '2026-09-14', restored = null, now = Date.now}) {
  let state = restored?.report ? restored : {status: 'waiting', checkedAt: null, nextCheckAt: 0, report: null, message: ''};
  let pending = null;
  const snapshot = () => ({status: state.status, checkedAt: state.checkedAt, nextCheckAt: state.nextCheckAt, message: state.message || '', report: state.report});
  async function refresh() {
    try {
      const index = await client.get('/api/v1/dailies?limit=21');
      const latest = index.items?.find(item => dateOK(item.date));
      if (!latest) throw new Error('日报索引为空');
      const body = await client.get('/api/v1/dailies/' + latest.date);
      const report = shapeDaily(body.report, index.items, {epoch, visualFor, now});
      state = {status: 'ok', checkedAt: new Date(now()).toISOString(), nextCheckAt: now() + 60000, report, message: ''};
    } catch (error) {
      state = {...state, status: state.report ? 'error' : 'error', checkedAt: state.checkedAt, nextCheckAt: now() + Math.max(300000, error.retryAfter || 0), message: '今日导读暂时无法更新，已保留上次内容。'};
    }
    return snapshot();
  }
  return {snapshot, exportState: () => state, check() {if (pending) return pending; if (now() < state.nextCheckAt) return Promise.resolve(snapshot()); pending = refresh().finally(() => pending = null); return pending;}};
}
