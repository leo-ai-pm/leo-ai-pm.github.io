import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {shapeDaily} from '../scripts/collectors/aihot-daily.mjs';

const source = await readFile(new URL('../public/edition.js', import.meta.url), 'utf8');
const fixture = JSON.parse(await readFile(new URL('./fixtures/aihot-empty-daily.json', import.meta.url), 'utf8'));
const quiet = shapeDaily(fixture.report, [], {visualFor:()=>({entities:[]}),now:()=>Date.parse('2026-10-06T00:00:00Z')});
const news = () => ({...structuredClone(quiet),lead:{...quiet.lead,title:'恢复有新闻'},sections:[{label:'产品',items:[{title:'新闻条目',summary:'摘要。',sourceName:'来源',sourceUrl:'https://example.com/news'}]}],flashes:[{title:'快讯条目',sourceName:'来源',sourceUrl:'https://example.com/flash'}]});

class Element {
  constructor(tag='div') {this.tagName=tag;this.children=[];this.attributes={};this._text='';}
  set textContent(value) {this._text=String(value);this.children=[];}
  get textContent() {return this._text+this.children.map(child=>child.textContent).join('');}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this._text='';this.children=[...children];}
  setAttribute(key,value) {this.attributes[key]=value;}
  addEventListener() {}
}
async function reader(initial) {
  const elements = new Map(), listeners = new Map(); let body=initial, fail=false;
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const node=(tag,className,text='')=>{const e=new Element(tag);e.className=className;e.textContent=text;return e;};
  const document={hidden:false,getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>node('text','',text),addEventListener:(name,handler)=>listeners.set(name,handler)};
  vm.runInNewContext(source,{document,window:{DailyPresentation:{node,externalLink:(text,url,className)=>node('a',className,text),dateText:value=>value,setLead:()=>{}}},URL,Intl,Date,AbortSignal,
    fetch:async path=>{if(path.includes('daily-report')){if(fail)throw Error('unavailable');return {ok:true,json:async()=>structuredClone(body)};}return {ok:true,json:async()=>({})};}});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  await settle();
  return {get,refresh:async next=>{body=next;listeners.get('visibilitychange')();await settle();},fail:async()=>{fail=true;listeners.get('visibilitychange')();await settle();}};
}

test('a quiet edition displays explicit section and flash empty states', async () => {
  const page=await reader({status:'ok',report:quiet});
  assert.match(page.get('daily-status').textContent,/本期暂无新增资讯/);
  assert.match(page.get('daily-sections').textContent,/本期暂无分类资讯/);
  assert.match(page.get('daily-flashes').textContent,/本期暂无快讯/);
  assert.match(page.get('daily-lead').textContent,/今日安静，无大事发生/);
});

test('a normal edition displays articles without quiet-day messages', async () => {
  const page=await reader({status:'ok',report:news()});
  assert.match(page.get('daily-sections').textContent,/新闻条目/);
  assert.match(page.get('daily-flashes').textContent,/快讯条目/);
  assert.doesNotMatch(page.get('daily-status').textContent,/暂无新增/);
});

test('repeated quiet-day refreshes do not duplicate empty states or calendar dots', async () => {
  const body={status:'ok',report:quiet}, page=await reader(body);
  const calendar=page.get('daily-calendar').textContent;
  await page.refresh(body);await page.refresh(body);
  assert.equal(page.get('daily-sections').children.length,1);
  assert.equal(page.get('daily-flashes').children.length,1);
  assert.equal(page.get('daily-calendar').children.length,2);
  assert.equal(page.get('daily-calendar').textContent,calendar);
});

test('news to quiet to news clears old entries and removes obsolete empty messages', async () => {
  const page=await reader({status:'ok',report:news()});
  await page.refresh({status:'ok',report:quiet});
  assert.doesNotMatch(page.get('daily-sections').textContent,/新闻条目/);
  assert.doesNotMatch(page.get('daily-flashes').textContent,/快讯条目/);
  await page.refresh({status:'ok',report:news()});
  assert.match(page.get('daily-sections').textContent,/新闻条目/);
  assert.doesNotMatch(page.get('daily-sections').textContent,/暂无分类/);
  assert.doesNotMatch(page.get('daily-flashes').textContent,/暂无快讯/);
  assert.doesNotMatch(page.get('daily-status').textContent,/暂无新增/);
});

test('a failed refresh retains the last rendered articles and reports failure', async () => {
  const page=await reader({status:'ok',report:news()});
  await page.refresh({status:'error',message:'今日导读暂时无法更新，已保留上次内容。',report:news()});
  assert.match(page.get('daily-status').textContent,/暂时无法更新/);
  assert.match(page.get('daily-sections').textContent,/新闻条目/);
  await page.fail();
  assert.match(page.get('daily-status').textContent,/暂时无法读取/);
  assert.match(page.get('daily-sections').textContent,/新闻条目/);
  assert.match(page.get('daily-flashes').textContent,/快讯条目/);
});
