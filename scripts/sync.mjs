import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createLiveFeed} from './collectors/live-feed.mjs';
import {createCreatorFeed} from './collectors/creator-feed.mjs';
import {createResearchFeed} from './collectors/research-feed.mjs';
import {createVisualResolver} from './collectors/visual-rules.mjs';
import {createAihotClient} from './collectors/aihot-client.mjs';
import {createDailyReport} from './collectors/aihot-daily.mjs';
import {createSelectedFeed} from './collectors/aihot-selected.mjs';
import {createCodexFeed} from './collectors/aihot-codex.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const write = async (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');
const loadState = async name => {try {return await read(`.cache/${name}.json`);} catch {return null;}};

function watchTopics(secret, fallback) {
  const custom = secret?.hot?.watchTopics;
  const source = Array.isArray(custom) && custom.length ? custom : fallback;
  return source.filter(topic => topic && typeof topic.label === 'string' && topic.label.trim() && typeof topic.q === 'string' && topic.q.trim())
    .slice(0, 8)
    .map(topic => ({id: String(topic.id || topic.q).trim(), label: topic.label.trim(), q: topic.q.trim()}));
}

// Connection details are supplied through a repository secret, never a public file.
// New AIHOT sections use scripts/aihot-config.json and do not require secret changes.
export async function sync(configuration, fetcher = fetch) {
  if (!configuration?.hot?.baseUrl || !Array.isArray(configuration.creators) || !Array.isArray(configuration.research)) {
    throw new Error('Missing or invalid NEWS_SOURCES_JSON configuration');
  }
  await mkdir(new URL('.cache/', root), {recursive: true});
  const assets = await read('scripts/assets.json');
  const settings = await read('scripts/aihot-config.json');
  const seed = await read('public/data.json');
  const creators = await read('public/api/creators.json');
  const research = await read('public/api/research.json');
  const publicResearchSeed = {accounts: research.accounts.map(a => ({...a,
    items: research.items.filter(i => i.researchId === a.id).map(i => ({...i, url: i.sourceUrl})),
  }))};
  const visualFor = createVisualResolver(assets, configuration.hot.people);
  const restoredDaily = await loadState('daily');
  const client = createAihotClient({
    baseUrl: configuration.hot.baseUrl,
    fetcher,
    resources: restoredDaily?.resources || {},
    userAgent: settings.userAgent,
    allowedHosts: settings.allowedHosts,
  });
  const topics = watchTopics(configuration, settings.watchTopics);
  const feed = createLiveFeed({seed, config: configuration.hot, voices: await read('scripts/voices.json'),
    visualFor, fetcher, client, restored: restoredDaily,
    onError: error => console.error('AIHOT section could not be refreshed; previous content retained.', error?.message || ''),
  });
  const creatorFeed = createCreatorFeed({sources: configuration.creators, seed: creators, assets, fetcher,
    restored: await loadState('creators')});
  const researchFeed = createResearchFeed({sources: configuration.research, seed: publicResearchSeed,
    assets, fetcher, library: await read('scripts/research-library.json'), restored: await loadState('research')});
  const dailyFeed = createDailyReport({client, visualFor, epoch: settings.issueEpoch, restored: await loadState('aihot-daily')});
  const selectedFeed = createSelectedFeed({client, categories: settings.categories, watchTopics: topics, restored: await loadState('aihot-selected')});
  const codexFeed = createCodexFeed({client, links: settings.links, restored: await loadState('aihot-codex')});

  await Promise.all([
    (async () => {
      await feed.check();
      await dailyFeed.check();
      await selectedFeed.check();
      await codexFeed.check();
    })(),
    creatorFeed.check(),
    researchFeed.check(),
  ]);
  const daily = feed.snapshot();
  const creatorResult = creatorFeed.snapshot();
  const researchResult = researchFeed.snapshot();
  const report = dailyFeed.snapshot();
  const selected = selectedFeed.snapshot();
  const tools = codexFeed.snapshot();

  // Readers see publisher/source pages, not subscription endpoints or connector settings.
  for (const result of [creatorResult, researchResult]) {
    for (const account of result.accounts) {
      account.sourceUrl = account.evidenceUrl || account.sourceUrl;
      delete account.etag; delete account.lastModified;
    }
    result.refreshing = false;
  }
  for (const item of researchResult.items) {
    const account = researchResult.accounts.find(a => a.id === item.researchId);
    item.aggregateUrl = account?.evidenceUrl || item.sourceUrl;
  }
  daily.data.sync.method = '定时同步 AIHOT';
  daily.data.sync.endpoint = undefined;
  daily.data.sync.serverVersion = undefined;
  daily.data.sources.aggregator = {name: 'AIHOT', url: 'https://aihot.news/', note: '日报、热点、精选与人物动态'};
  const publicReport = {status: report.status, checkedAt: report.checkedAt, message: report.message, report: report.report};
  const publicSelected = {status: selected.status, checkedAt: selected.checkedAt, message: selected.message, categories: selected.categories, today: selected.today, week: selected.week, watch: selected.watch};
  const publicTools = {status: tools.status, checkedAt: tools.checkedAt, message: tools.message, codex: tools.codex, links: settings.links, pages: settings.pages};
  await Promise.all([
    write('public/data.json', daily.data), write('public/api/live.json', daily),
    write('public/api/creators.json', creatorResult), write('public/api/research.json', researchResult),
    write('public/api/daily-report.json', publicReport), write('public/api/selected.json', publicSelected), write('public/api/tools.json', publicTools),
    write('.cache/daily.json', feed.exportState()), write('.cache/creators.json', creatorFeed.exportState()),
    write('.cache/research.json', researchFeed.exportState()),
    write('.cache/aihot-daily.json', dailyFeed.exportState()), write('.cache/aihot-selected.json', selectedFeed.exportState()),
    write('.cache/aihot-codex.json', codexFeed.exportState()),
  ]);
  const failed = [
    ...(daily.live.status === 'error' ? ['hot-ranking'] : []),
    ...(report.status === 'error' ? ['daily-report'] : []),
    ...(selected.status === 'error' ? ['selected'] : []),
    ...(tools.status === 'error' ? ['codex'] : []),
    ...creatorResult.accounts.filter(a => a.status === 'error').map(a => a.id),
    ...researchResult.accounts.filter(a => a.status === 'error').map(a => a.id),
  ];
  console.log(JSON.stringify({hotStatus: daily.live.status, hotCheckedAt: daily.live.checkedAt,
    ranking: daily.data.ranking?.length || 0, stories: daily.data.items.length,
    daily: report.status, selected: selected.status, watch: selected.watch?.map(topic => ({id: topic.id, count: topic.items.length, unselected: topic.unselected})),
    codex: tools.codex?.events?.length || 0,
    creators: creatorResult.accounts.map(a => ({id: a.id, status: a.status, count: a.items.length})),
    research: researchResult.items.length, failed}));
  return {failed};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(process.env.NEWS_SOURCES_JSON || 'null');
  await sync(config);
}
