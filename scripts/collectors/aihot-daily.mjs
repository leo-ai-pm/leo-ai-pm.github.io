import {issueNumber, oneSentence} from './aihot-client.mjs';

const dateOK = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const httpURL = value => {try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '';} catch {return '';}};

function assertStructure(report, expectedDate) {
  if (!record(report) || !dateOK(report.date) || (expectedDate !== undefined && report.date !== expectedDate)
      || !record(report.lead) || !text(report.lead.title)
      || !Array.isArray(report.sections) || !Array.isArray(report.flashes)) throw new Error('日报结构或日期异常');
  for (const key of ['leadParagraph', 'summary']) {
    if (report.lead[key] != null && typeof report.lead[key] !== 'string') throw new Error('日报导语类型异常');
  }
  if (report.generatedAt != null && (typeof report.generatedAt !== 'string' || !Number.isFinite(Date.parse(report.generatedAt)))) {
    throw new Error('日报生成时间异常');
  }
  for (const section of report.sections) {
    if (!record(section) || !Array.isArray(section.items) || (section.label != null && typeof section.label !== 'string')) {
      throw new Error('日报分类结构异常');
    }
  }
}

// Publication checks validate structure, including legitimate empty editions.
export function validateDailyReport(report, expectedDate) {
  assertStructure(report, expectedDate);
  const items = [...report.sections.flatMap(section => section.items), ...report.flashes];
  for (const item of items) {
    if (!record(item) || !text(item.title) || !(httpURL(item.sourceUrl) || httpURL(item.aihotUrl))
        || (item.summary != null && typeof item.summary !== 'string')) throw new Error('日报条目异常');
  }
  return report;
}

function shapeItem(item) {
  if (!record(item) || !text(item.title) || !record(item.links)
      || (item.summary != null && typeof item.summary !== 'string')
      || (item.source != null && !record(item.source))
      || (item.source?.name != null && typeof item.source.name !== 'string')) return null;
  const sourceUrl = httpURL(item.links?.original);
  const aihotUrl = httpURL(item.links?.aihot);
  if (!sourceUrl && !aihotUrl) return null;
  return {
    title: item.title,
    summary: oneSentence(item.summary),
    sourceName: item.source?.name || '',
    sourceUrl: sourceUrl || aihotUrl,
    aihotUrl: aihotUrl || sourceUrl,
  };
}

export function shapeDaily(report, indexItems, {epoch, visualFor, now, expectedDate}) {
  assertStructure(report, expectedDate);
  const sections = report.sections.map(section => ({
    label: section.label || '未分类',
    items: section.items.map(shapeItem).filter(Boolean),
  })).filter(section => section.items.length);
  const flashes = report.flashes.map(item => {
    const shaped = shapeItem(item);
    if (!shaped) return null;
    return {...shaped, summary: '', publishedAt: typeof item.publishedAt === 'string' && Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt : null};
  }).filter(Boolean);
  const inputCount = report.sections.reduce((total, section) => total + section.items.length, 0) + report.flashes.length;
  const outputCount = sections.reduce((total, section) => total + section.items.length, 0) + flashes.length;
  if (inputCount > 0 && outputCount === 0) throw new Error('日报条目全部无效');
  const leadURL = httpURL(report.links?.aihot) || `https://aihot.news/daily/${report.date}`;
  const summary = oneSentence(report.lead.leadParagraph);
  const lead = {
    title: report.lead.title,
    summary,
    aihotUrl: leadURL,
    visual: visualFor({title: report.lead.title, sourceName: 'AIHOT', category: '今日导读'}),
  };
  return validateDailyReport({
    date: report.date,
    dateLabel: new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric'}).format(new Date(`${report.date}T12:00:00+08:00`)),
    weekday: new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', weekday: 'short'}).format(new Date(`${report.date}T12:00:00+08:00`)),
    issue: issueNumber(report.date, epoch),
    generatedAt: report.generatedAt || null,
    aihotUrl: leadURL,
    lead,
    sections,
    flashes,
    archive: (indexItems || []).filter(item => dateOK(item.date)).slice(0, 21).map(item => ({
      date: item.date,
      title: item.leadTitle || '',
      aihotUrl: httpURL(item.links?.aihot) || `https://aihot.news/daily/${item.date}`,
    })),
    shapedAt: new Date(now()).toISOString(),
  }, expectedDate);
}

export function createDailyReport({client, visualFor, epoch = '2026-09-14', restored = null, now = Date.now}) {
  let state = restored?.report ? restored : {status: 'waiting', checkedAt: null, nextCheckAt: 0, report: null, message: ''};
  let pending = null;
  const snapshot = () => ({status: state.status, checkedAt: state.checkedAt, nextCheckAt: state.nextCheckAt, message: state.message || '', report: state.report});
  async function refresh() {
    try {
      const index = await client.get('/api/v1/dailies?limit=21');
      const latest = index.items?.find(item => dateOK(item?.date));
      if (!latest) throw new Error('日报索引为空');
      const body = await client.get('/api/v1/dailies/' + latest.date);
      const report = shapeDaily(body.report, index.items, {epoch, visualFor, now, expectedDate: latest.date});
      state = {status: 'ok', checkedAt: new Date(now()).toISOString(), nextCheckAt: now() + 60000, report, message: ''};
    } catch (error) {
      state = {...state, status: 'error', checkedAt: state.checkedAt, nextCheckAt: now() + Math.max(300000, error.retryAfter || 0), message: '今日导读暂时无法更新，已保留上次内容。'};
    }
    return snapshot();
  }
  return {snapshot, exportState: () => state, check() {if (pending) return pending; if (now() < state.nextCheckAt) return Promise.resolve(snapshot()); pending = refresh().finally(() => pending = null); return pending;}};
}
