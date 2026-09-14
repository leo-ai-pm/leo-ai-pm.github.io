import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createLiveFeed} from './collectors/live-feed.mjs';
import {createCreatorFeed} from './collectors/creator-feed.mjs';
import {createResearchFeed} from './collectors/research-feed.mjs';
import {createVisualResolver} from './collectors/visual-rules.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const write = async (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');
const loadState = async name => {try {return await read(`.cache/${name}.json`);} catch {return null;}};

// Connection details are supplied through a repository secret, never a public file.
export async function sync(configuration, fetcher = fetch) {
  if (!configuration?.hot?.baseUrl || !Array.isArray(configuration.creators) || !Array.isArray(configuration.research)) {
    throw new Error('Missing or invalid NEWS_SOURCES_JSON configuration');
  }
  await mkdir(new URL('.cache/', root), {recursive: true});
  const assets = await read('scripts/assets.json');
  const seed = await read('public/data.json');
  const creators = await read('public/api/creators.json');
  const research = await read('public/api/research.json');
  const publicResearchSeed = {accounts: research.accounts.map(a => ({...a,
    items: research.items.filter(i => i.researchId === a.id).map(i => ({...i, url: i.sourceUrl})),
  }))};
  const feed = createLiveFeed({seed, config: configuration.hot, voices: await read('scripts/voices.json'),
    visualFor: createVisualResolver(assets, configuration.hot.people), fetcher,
    restored: await loadState('daily'),
    onError: () => console.error('Hot ranking could not be refreshed; previous content retained.'),
  });
  const creatorFeed = createCreatorFeed({sources: configuration.creators, seed: creators, assets, fetcher,
    restored: await loadState('creators')});
  const researchFeed = createResearchFeed({sources: configuration.research, seed: publicResearchSeed,
    assets, fetcher, library: await read('scripts/research-library.json'), restored: await loadState('research')});
  await Promise.all([feed.check(), creatorFeed.check(), researchFeed.check()]);
  const daily = feed.snapshot();
  const creatorResult = creatorFeed.snapshot();
  const researchResult = researchFeed.snapshot();

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
  daily.data.sync.method = '定时同步公开热点榜';
  daily.data.sync.endpoint = undefined;
  daily.data.sync.serverVersion = undefined;
  daily.data.sources.aggregator.note = '公开热点榜与人物动态';
  await Promise.all([
    write('public/data.json', daily.data), write('public/api/live.json', daily),
    write('public/api/creators.json', creatorResult), write('public/api/research.json', researchResult),
    write('.cache/daily.json', feed.exportState()), write('.cache/creators.json', creatorFeed.exportState()),
    write('.cache/research.json', researchFeed.exportState()),
  ]);
  const failed = [
    ...(daily.live.status === 'error' ? ['hot-ranking'] : []),
    ...creatorResult.accounts.filter(a => a.status === 'error').map(a => a.id),
    ...researchResult.accounts.filter(a => a.status === 'error').map(a => a.id),
  ];
  console.log(JSON.stringify({hotStatus: daily.live.status, hotCheckedAt: daily.live.checkedAt,
    stories: daily.data.items.length, creators: creatorResult.accounts.map(a => ({id: a.id, status: a.status, count: a.items.length})),
    research: researchResult.items.length, failed}));
  return {failed};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(process.env.NEWS_SOURCES_JSON || 'null');
  await sync(config);
}
