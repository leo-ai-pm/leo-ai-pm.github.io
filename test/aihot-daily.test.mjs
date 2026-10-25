import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDailyReport, shapeDaily} from '../scripts/collectors/aihot-daily.mjs';

// Captured from the public endpoint on 2026-10-06, not the failed CI run.
const fixture = JSON.parse(await readFile(new URL('./fixtures/aihot-empty-daily.json', import.meta.url), 'utf8'));
const quiet = () => structuredClone(fixture.report);
const item = () => ({title:'模型更新', summary:'第一句。第二句。', source:{name:'来源'}, links:{original:'https://example.com/news'}});
const normal = () => ({...quiet(), lead:{title:'有新闻的日报', leadParagraph:'导语。第二句。'}, sections:[{label:'产品', items:[item()]}]});
const options = {epoch:'2026-09-14', visualFor:()=>({entities:[]}), now:()=>Date.parse('2026-10-06T00:00:00Z'), expectedDate:'2026-10-05'};
const index = {items:[{date:'2026-10-05', leadTitle:'本期', links:{aihot:'https://aihot.news/daily/2026-10-05'}}]};

test('the captured quiet day keeps its own date and lead with empty content arrays', () => {
  const report = shapeDaily(quiet(), index.items, options);
  assert.equal(report.date, '2026-10-05');
  assert.equal(report.lead.title, '今日安静，无大事发生');
  assert.deepEqual(report.sections, []);
  assert.deepEqual(report.flashes, []);
});

test('a structurally valid quiet day does not require a special title', () => {
  const raw = quiet(); raw.lead.title = '本期导读';
  assert.deepEqual(shapeDaily(raw, [], options).sections, []);
});

test('normal and flash-only editions remain readable and keep one-sentence summaries', () => {
  const report = shapeDaily(normal(), [], options);
  assert.equal(report.sections[0].items[0].summary, '第一句。');
  assert.equal(report.lead.summary, '导语。');
  const flashOnly = quiet(); flashOnly.flashes = [item()];
  assert.equal(shapeDaily(flashOnly, [], options).flashes.length, 1);
});

test('a mixed list keeps valid articles without turning invalid ones into quiet-day content', () => {
  const raw = normal(); raw.sections[0].items.unshift(null, {title:42}, {title:'坏链接',links:{original:'javascript:alert(1)'}});
  const report = shapeDaily(raw, [], options);
  assert.equal(report.sections[0].items.length, 1);
  assert.equal(report.sections[0].items[0].title, '模型更新');
});

test('a valid quiet day replaces the previous edition and reports a successful check', async () => {
  const previous = shapeDaily(normal(), [], options); previous.date = '2026-10-04';
  const feed = createDailyReport({client:{get:async path=>path.includes('?')?index:{report:quiet()}},
    visualFor:options.visualFor, now:options.now, restored:{status:'ok',report:previous,nextCheckAt:0,checkedAt:'2026-10-04T00:00:00Z'}});
  const result = await feed.check();
  assert.equal(result.status, 'ok');
  assert.equal(result.report.date, '2026-10-05');
  assert.deepEqual(result.report.sections, []);
  assert.equal(result.checkedAt, '2026-10-06T00:00:00.000Z');
  assert.equal(result.message, '');
});

test('the collector resumes news after a quiet edition', async () => {
  let time = options.now(), raw = quiet();
  const feed = createDailyReport({client:{get:async path=>path.includes('?')?index:{report:raw}},visualFor:options.visualFor,now:()=>time});
  assert.deepEqual((await feed.check()).report.sections, []);
  raw = normal(); time += 61000;
  const result = await feed.check();
  assert.equal(result.status, 'ok');
  assert.equal(result.report.sections[0].items[0].title, '模型更新');
});

const invalidCases = [
  ['missing sections', raw=>{delete raw.sections;}],
  ['missing flashes', raw=>{delete raw.flashes;}],
  ['sections with the wrong type', raw=>{raw.sections={};}],
  ['flashes with the wrong type', raw=>{raw.flashes=null;}],
  ['missing date', raw=>{delete raw.date;}],
  ['an impossible calendar date', raw=>{raw.date='2026-02-30';}],
  ['a non-string date', raw=>{raw.date=20261005;}],
  ['a blank lead title', raw=>{raw.lead.title='  ';}],
  ['a non-string lead title', raw=>{raw.lead.title=42;}],
  ['a malformed section', raw=>{raw.sections=[null];}],
  ['section items with the wrong type', raw=>{raw.sections=[{label:'产品',items:{}}];}],
  ['only invalid section entries', raw=>{raw.sections=[{label:'产品',items:[null,{title:'缺少链接'}]}];}],
  ['only invalid flash entries', raw=>{raw.flashes=[{title:'错误链接',links:{original:'javascript:alert(1)'}}];}],
  ['a report date different from the requested index date', raw=>{raw.date='2026-10-04';}],
];

for (const [label, mutate] of invalidCases) {
  test(`${label} is rejected and retains the last successful edition`, async () => {
    const raw = quiet(); mutate(raw);
    assert.throws(()=>shapeDaily(raw, index.items, options));
    const previous = shapeDaily(normal(), [], options);
    const checkedAt = '2026-10-04T00:00:00Z';
    const feed = createDailyReport({client:{get:async path=>path.includes('?')?index:{report:raw}},visualFor:options.visualFor,
      now:options.now,restored:{status:'ok',report:previous,checkedAt,nextCheckAt:0}});
    const result = await feed.check();
    assert.equal(result.status, 'error');
    assert.deepEqual(result.report, previous);
    assert.equal(result.checkedAt, checkedAt);
    assert.ok(result.nextCheckAt >= options.now()+300000);
  });
}
