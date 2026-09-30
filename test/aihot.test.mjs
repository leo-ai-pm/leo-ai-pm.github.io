import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveFeed} from '../scripts/collectors/live-feed.mjs';
import {createDailyReport, shapeDaily} from '../scripts/collectors/aihot-daily.mjs';
import {createSelectedFeed, shapeSelected} from '../scripts/collectors/aihot-selected.mjs';
import {shapeCodex} from '../scripts/collectors/aihot-codex.mjs';
import {createAihotClient, oneSentence, issueNumber} from '../scripts/collectors/aihot-client.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}});
const now = () => Date.parse('2026-09-30T06:00:00.000Z');
const visualFor = item => ({entities: [{name: item.sourceName || 'AIHOT', asset: null, tone: '#e9e4dc'}], caption: item.category || '', author: null});
const people = [{handle: 'sama', name: 'Sam Altman', group: '行业与创业', focus: '模型发布'}];

function hotItem(rank, id = 'hot' + rank) {
  return {
    rank, id, title: `热点 ${rank}`,
    source: {name: '示例来源'},
    links: {
      aihot: `https://aihot.news/items/${id}`,
      original: `https://example.com/${id}`,
      story: `https://aihot.virxact.com/story/story-${rank}`,
    },
    sourceCount: 3 + rank,
    signalCount: 100 - rank,
    participantCount: 10 + rank,
    latestAt: '2026-09-30T05:00:00.000Z',
    sourceNames: ['不应整表展示'],
  };
}
function story(rank) {
  return {story: {
    publicId: `story-${rank}`, title: `事件 ${rank}`, status: 'active', sourceCount: 20, reportCount: 4,
    latest: '最新进展只有这一句。',
    digest: '综述第一句。后面是不应公开复制的长综述第二句，以及更多段落。',
    links: {aihot: `https://aihot.news/story/story-${rank}`},
    reports: [
      {id: 'hot' + rank, title: '报道标题', summary: null, source: {name: '示例来源'}, publishedAt: '2026-09-30T04:00:00.000Z', links: {aihot: `https://aihot.news/items/hot${rank}`, original: `https://example.com/hot${rank}`}},
      {id: 'other', title: '另一则报道', summary: '报道正文不该进入页面。还有第二句。', source: {name: '另一来源'}, publishedAt: '2026-09-30T03:00:00.000Z', links: {aihot: 'https://aihot.news/items/other', original: 'https://example.com/other'}},
    ],
    related: [{publicId: 'related-1', title: '相关事件', relation: 'related', links: {aihot: 'https://aihot.news/story/related-1', api: 'https://aihot.virxact.com/api/v1/stories/related-1'}}],
  }};
}

test('a story link on the legacy host is accepted when requests use aihot.news', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(String(url));
    const path = new URL(url).pathname;
    if (path === '/api/v1/hot-topics') return json({items: [1, 2, 3, 4].map(hotItem)});
    if (path.startsWith('/api/v1/stories/')) return json(story(Number(path.slice(-1))));
    if (path === '/api/v1/items') return json({items: [], page: {count: 0, hasMore: false, nextCursor: null}});
    return json({}, 404);
  };
  const feed = createLiveFeed({seed: {items: [], sources: {groups: []}}, config: {baseUrl: 'https://aihot.news', people: []}, voices: [], visualFor, fetcher, now, requestGapMs: 0});
  const result = await feed.check();
  assert.equal(result.live.status, 'ok');
  assert.equal(calls.filter(url => url.includes('/stories/')).length, 3);
  assert.deepEqual(result.data.ranking.map(item => item.storyUrl), [1, 2, 3, 4].map(rank => `https://aihot.news/story/story-${rank}`));
  const lead = result.data.ranking[0];
  assert.equal(lead.latest, '最新进展只有这一句。');
  assert.equal(lead.sourceCount, 4);
  assert.equal(lead.participantCount, 11);
  assert.equal(lead.signalCount, undefined);
  assert.equal(lead.reports.length, 2);
  assert.equal(lead.reports[0].summary, undefined);
  assert.equal(JSON.stringify(result.data.ranking).includes('不应公开复制'), false);
  assert.equal(JSON.stringify(result.data.ranking).includes('api/v1/stories'), false);
  assert.equal(JSON.stringify(result.data.ranking).includes('signalCount'), false);
});

test('a null published time falls back to AIHOT ingest time and a null summary keeps the item', async () => {
  const discovered = '2026-09-30T04:30:00.000Z';
  const fetcher = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/hot-topics') return json({items: [hotItem(1)]});
    if (path.startsWith('/api/v1/stories/')) return json(story(1));
    if (path === '/api/v1/items') return json({items: [{
      id: 'person-1', title: '人物说了一句话', summary: null, reason: '推荐理由只有一句。后面不该出现。',
      source: {name: 'X：Sam'}, links: {aihot: 'https://aihot.news/items/person-1', original: 'https://x.com/sama/status/99'},
      publishedAt: null, discoveredAt: discovered, category: 'ai-products',
    }], page: {count: 1, hasMore: false, nextCursor: null}});
    return json({}, 404);
  };
  const feed = createLiveFeed({seed: {items: [{id: 'old', title: '旧人物'}], sources: {}}, config: {baseUrl: 'https://aihot.news', people}, voices: [], visualFor, fetcher, now, requestGapMs: 0});
  const result = await feed.check();
  const person = result.data.items.find(item => item.id === 'aihot-person-1');
  assert.ok(person);
  assert.equal(person.publishedAt, discovered);
  assert.equal(person.timeBasis, 'discovered');
  assert.equal(person.summary, '推荐理由只有一句。');
  assert.equal(JSON.stringify(person).includes('不该出现'), false);
  assert.equal(result.data.sources.people[0].status, '本次收录');
});

test('a failed people lookup still publishes the hot ranking', async () => {
  const fetcher = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/hot-topics') return json({items: [hotItem(1)]});
    if (path.startsWith('/api/v1/stories/')) return json(story(1));
    return json({}, 503);
  };
  const feed = createLiveFeed({seed: {items: [{id: 'kept-person', title: '保留的人物', hotRank: undefined}], sources: {people: []}}, config: {baseUrl: 'https://aihot.news', people: []}, voices: [], visualFor, fetcher, now, requestGapMs: 0});
  const result = await feed.check();
  assert.equal(result.live.status, 'partial');
  assert.equal(result.data.ranking.length, 1);
  assert.equal(result.data.items[0].id, 'kept-person');
});

test('one AIHOT section can fail without discarding the others', async () => {
  const fetcher = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/dailies') return json({}, 500);
    if (path.startsWith('/api/v1/dailies/')) return json({}, 500);
    if (path.startsWith('/api/v1/items')) return json({items: [{id: 's1', title: '精选标题', summary: '摘要第一句。第二句不要。', reason: '值得看的理由。', source: {name: '来源'}, links: {aihot: 'https://aihot.news/items/s1', original: 'https://example.com/s1'}, publishedAt: '2026-09-30T01:00:00.000Z', discoveredAt: '2026-09-30T02:00:00.000Z', category: 'ai-models'}], page: {count: 1, hasMore: false}});
    if (path === '/api/v1/codex-resets/recent') return json({timezone: 'Asia/Shanghai', today: '2026-09-30', checkedAt: '2026-09-30T05:00:00.000Z', events: [{id: 'e1', type: 'direct_reset', displayLabel: '直接重置', status: 'confirmed', title: '额度已重置', url: 'https://aihot.news/codex-reset', posts: [{text: '不应复制的长回复', url: 'https://x.com/thsottiaux/status/1'}]}], monitor: {status: 'healthy'}, outage: null});
    return json({}, 404);
  };
  const client = createAihotClient({baseUrl: 'https://aihot.news', fetcher, now, gapMs: 0});
  const previous = {status: 'ok', report: {date: '2026-09-29', lead: {title: '上一期'}}};
  const daily = createDailyReport({client, visualFor, restored: previous, now});
  const selected = createSelectedFeed({client, categories: [{id: 'ai-models', label: '模型'}], watchTopics: [{id: 'agent', label: 'Agent', q: 'Agent'}], now});
  const dailyResult = await daily.check();
  const selectedResult = await selected.check();
  assert.equal(dailyResult.status, 'error');
  assert.equal(dailyResult.report.lead.title, '上一期');
  assert.equal(selectedResult.status, 'ok');
  assert.equal(selectedResult.today[0].reason, '值得看的理由。');
  assert.equal(selectedResult.today[0].summary, '摘要第一句。');
  assert.equal(selectedResult.watch[0].items[0].title, '精选标题');
});

test('public text keeps a single sentence and codex omits post bodies', () => {
  assert.equal(oneSentence('第一句。第二句也很长。'), '第一句。');
  assert.equal(oneSentence(null), '');
  assert.equal(issueNumber('2026-09-30', '2026-09-14'), 17);
  const shaped = shapeSelected({id: '1', title: '标题', summary: null, reason: null, source: {name: '源'}, links: {original: 'https://example.com/a', aihot: 'https://aihot.news/items/1'}, publishedAt: null, discoveredAt: '2026-09-30T00:00:00.000Z', category: 'paper'});
  assert.equal(shaped.summary, '');
  assert.equal(shaped.timeBasis, 'discovered');
  const codex = shapeCodex({timezone: 'Asia/Shanghai', today: '2026-09-30', events: [{id: '1', displayLabel: '重置卡发放', status: 'confirmed', title: '重置卡已发放', posts: [{text: '完整回复不保存', fullText: '更长', url: 'https://x.com/thsottiaux/status/9'}], url: 'https://aihot.news/codex-reset'}], monitor: {status: 'healthy'}});
  assert.equal(JSON.stringify(codex).includes('完整回复'), false);
  assert.equal(codex.events[0].sourceUrl, 'https://x.com/thsottiaux/status/9');
  assert.equal(codex.events[0].status, '已确认');
  const daily = shapeDaily({
    date: '2026-09-30', generatedAt: '2026-09-30T00:00:00.000Z', links: {aihot: 'https://aihot.news/daily/2026-09-30'},
    lead: {title: '头条', leadParagraph: '导语第一句。导语第二句。'},
    sections: [{label: '模型发布/更新', items: [{title: '模型', summary: '模型一句。模型二句。', source: {name: 'OpenAI'}, links: {aihot: 'https://aihot.news/items/m', original: 'https://openai.com/m'}}]}],
    flashes: [{title: '快讯', source: {name: '源'}, links: {original: 'https://example.com/f'}, publishedAt: null}],
  }, [{date: '2026-09-29', leadTitle: '昨日', leadParagraph: '不应保存的段落', links: {aihot: 'https://aihot.news/daily/2026-09-29'}}], {epoch: '2026-09-14', visualFor, now});
  assert.equal(daily.lead.summary, '导语第一句。');
  assert.equal(daily.sections[0].items[0].summary, '模型一句。');
  assert.equal(JSON.stringify(daily.archive).includes('不应保存'), false);
});
