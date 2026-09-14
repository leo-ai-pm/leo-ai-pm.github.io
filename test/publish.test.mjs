import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {createLiveFeed} from '../scripts/collectors/live-feed.mjs';
import {createCreatorFeed} from '../scripts/collectors/creator-feed.mjs';
const root = new URL('../public/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));

test('a failed ranking refresh retains the last edition and reports failure', async () => {
  const seed = {items:[{id:'retained', title:'Saved article'}]};
  const feed = createLiveFeed({seed, config:{baseUrl:'https://example.com',people:[]}, voices:[], visualFor:()=>({}),
    now:()=>1000000, fetcher:async()=>new Response('', {status:503})});
  const result = await feed.check();
  assert.deepEqual(result.data, seed);
  assert.equal(result.live.status, 'error');
  assert.equal(result.live.checkedAt, null);
  assert.ok(result.live.nextCheckAt >= 1300000);
});

test('an unverified RSS identity cannot replace existing creator articles', async () => {
  const source={id:'test',name:'Expected Author',channel:'Expected',kind:'rss',url:'https://example.com/feed',originalHosts:['example.com']};
  const saved={id:'saved', title:'Known article',url:'https://example.com/article',publishedAt:'2026-09-01T00:00:00Z'};
  const feed=createCreatorFeed({sources:[source],seed:{accounts:[{id:'test',items:[saved]}]},
    fetcher:async()=>new Response('<rss><channel><title>Impersonator</title></channel></rss>')});
  await feed.check();
  assert.equal(feed.snapshot().accounts[0].status, 'error');
  assert.equal(feed.snapshot().accounts[0].items[0].id, 'saved');
});

test('the three public editions contain readable records and bundled illustrations', async () => {
  const daily=await read('api/live.json'),creators=await read('api/creators.json'),research=await read('api/research.json');
  assert.ok(daily.data.items.length);
  assert.equal(creators.accounts.length, 6);
  assert.ok(Array.isArray(research.items));
  assert.ok(Array.isArray(research.library));
  assert.ok(!creators.accounts.some(a=>/飞书/.test(a.name)));
  const assets=new Set();
  function inspect(value){
    if(!value || typeof value!=='object') return;
    for(const [key,v] of Object.entries(value)){
      if(key==='asset'&&typeof v==='string'){assert.match(v,/^\/assets\/identities\/[a-z0-9_]+\.(jpg|png|webp)$/);assets.add(v);}
      if(key==='sourceUrl'||key==='url') {if(typeof v==='string')assert.match(v,/^https?:\/\//);}
      inspect(v);
    }
  }
  for(const value of [daily,creators,research])inspect(value);
  for(const path of assets)await access(new URL('.'+path,root));
  for(const value of [daily,creators,research]){
    assert.doesNotMatch(JSON.stringify(value), /chatgpt\.site|api\/mcp|poc_token|wechat2rss\.bestblogs\.dev\/feed/i);
  }
});

test('the reader has no login dependency and does not poll static data every second', async()=>{
  for(const name of ['index.html','app.js','creators.js','research.js','pwa.js','sw.js']){
    const text=await readFile(new URL(name,root),'utf8');
    assert.doesNotMatch(text,/chatgpt\.site|需要登录|联网登录|并登录/);
    if(['app.js','creators.js','research.js'].includes(name))assert.doesNotMatch(text,/nextCheckAt\|\|Date\.now/);
  }
  const manifest=await read('manifest.webmanifest');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.name,'Leo 的 AI 日报');
});
