import {createVisualResolver} from './visual-rules.mjs';
// Public, allowlisted subscriptions only. Keep short descriptions, never full article HTML.
export const CREATOR_INTERVAL=15*60*1000;
// Editorial prompts, not publisher claims or evidence that the article omitted a topic.
export function creatorOpportunity(item){
 const text=`${item.title} ${item.summary||''}`;
 const rules=[
  [/视频|编剧|导演|分镜|video/i,'把文中的视频方法用于同一段 30 秒脚本，能减少多少次重做？','用原有流程和文中方法各做 3 次，记录耗时、生成次数与可用镜头比例。'],
  [/价格|降价|免费|会员|额度|成本|pricing/i,'优惠结束后，这项工具仍值得加入你的日常工作流吗？','选一项固定任务，对比正常价格下的单次成本、可用结果和人工返工时间。'],
  [/电力|电网|能源|grid|power|chip|芯片|内存|LPDDR/i,'文中的基础设施变化，能否在你使用的 AI 产品上看到实际影响？','先核对原文证据，再连续一周记录同一任务的响应时间、失败率与费用；区分相关性和因果。'],
  [/编程|代码|coding|代码编辑器/i,'这项编程能力在真实需求中，能独立完成到哪一步？','用一个含验收条件的小需求对比现有工具，记录完成率、人工介入次数和回归错误。'],
  [/设计|图像|绘图|3D|Design|WorldGen/i,'生成结果离可以交付的设计，还差哪些人工修改？','给新旧工具同一份设计需求，对比约束遵守、风格一致性和最终修改时间。'],
  [/Agent|智能体|自动化|Skill/i,'把这套方法交给一个真实工作任务，需要你接手几次？','用一项重复工作连续试 3 次，记录完成率、耗时、人工接手点，并保留一次失败案例。'],
  [/GPT|Qwen|Claude|模型|AGI|Minimax|Gemini|Fable/i,'文中提到的能力变化，能否改善你的一项产品经理任务？','用同一份脱敏需求材料比较新旧工具，检查信息遗漏、约束遵守和修改耗时，不只比较措辞。'],
  [/创业|商业|访谈|对话|组织|团队|Fridman|DHH/i,'文中的经验适合什么规模和阶段的团队？','从原文选出一条明确做法，用你的一项工作验证前提和代价，再找一个不适用的场景。']
 ];
 const rule=rules.find(([match])=>match.test(text));
 return {question:rule?rule[1]:'这篇内容中，哪一条建议能用你手头的真实任务验证？',method:rule?rule[2]:'先读原文，选出一条明确建议；用同一任务比较尝试前后的耗时、质量和返工量，记录适用边界。',basis:'基于标题与摘要的选题建议 · 待实测'};
}
const clean=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,c)=>{if(c[0]==='#'){const n=c[1].toLowerCase()==='x'?parseInt(c.slice(2),16):Number(c.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[c.toLowerCase()]||'';}).replace(/\s+/g,' ').trim();
const field=(xml,tag)=>{const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return clean(xml.match(new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i'))?.[1]);};
const sameName=s=>clean(s).replace(/\s/g,'').toLowerCase();
function link(value,source){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!source.originalHosts.includes(u.hostname))return null;u.protocol='https:';return u.href;}catch{return null;}}
export function canonical(value){const u=new URL(value);u.hash='';if(u.hostname==='mp.weixin.qq.com'&&u.searchParams.has('__biz')){const q=new URLSearchParams();for(const key of ['__biz','mid','idx','sn'])if(u.searchParams.has(key))q.set(key,u.searchParams.get(key));u.search=q.toString();}else{for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_'))u.searchParams.delete(k);}return u.href;}
export function parseRSS(xml,source,t=Date.now()){
 if(!/<rss[\s>]/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('订阅格式变化');
 const head=xml.split(/<item[\s>]/i)[0];if(sameName(field(head,'title'))!==sameName(source.channel))throw new Error('账号身份不匹配');
 const out=[],seen=new Set();
 for(const m of xml.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)){
  const title=field(m[0],'title'),url=link(field(m[0],'link'),source),date=Date.parse(field(m[0],'pubDate'));
  if(!title||!url||!Number.isFinite(date)||date>t+300000)continue;
  const key=canonical(url);if(seen.has(key))continue;seen.add(key);
  out.push({id:source.id+':'+key,creatorId:source.id,title:title.slice(0,300),summary:field(m[0],'description').slice(0,220),publishedAt:new Date(date).toISOString(),url:key,linkKind:'original'});
 }
 if(!out.length&&/<item[\s>]/i.test(xml))throw new Error('未能核对文章链接或日期');
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,Math.min(source.limit||10,30));
}
export function parseAtom(xml,source,t=Date.now()){
 if(!/<feed[\s>]/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('订阅格式变化');
 const head=xml.split(/<entry[\s>]/i)[0];if(sameName(field(head,'title'))!==sameName(source.channel))throw new Error('来源身份不匹配');
 const out=[],seen=new Set();
 for(const m of xml.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)){
  const title=field(m[0],'title'),tag=[...m[0].matchAll(/<link\b[^>]*>/gi)].find(x=>/rel=['"]alternate['"]/.test(x[0]))?.[0];
  const url=link(clean(tag?.match(/href=['"]([^'"]+)['"]/)?.[1]),source),date=Date.parse(field(m[0],'published')||field(m[0],'updated'));
  if(!title||!url||!Number.isFinite(date)||date>t+300000)continue;const key=canonical(url);if(seen.has(key))continue;seen.add(key);
  out.push({id:source.id+':'+key,creatorId:source.id,title:title.slice(0,300),summary:clean(field(m[0],'summary')||field(m[0],'content')).replace(/Discussion\s*\|\s*Link\s*$/,'').slice(0,220),publishedAt:new Date(date).toISOString(),url:key,linkKind:'original'});
 }
 if(!out.length&&/<entry[\s>]/i.test(xml))throw new Error('未能核对文章链接或日期');
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,Math.min(source.limit||10,30));
}
export function parseDirectory(html,source){
 if(!html.includes(source.name)||!html.includes('item_title'))throw new Error('公开目录暂不可读');
 const out=[];
 for(const m of html.matchAll(/<span class="item_title">([\s\S]*?)<\/span>([\s\S]*?)(?=<div class="topic_image">|<div class="cell item">|$)/g)){
  const a=m[1].match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i),url=a&&link(clean(a[1]),source),title=a&&clean(a[2]);
  if(!url||!title||!m[2].includes(source.name))continue;
  // Relative publisher labels are preserved verbatim, never converted into invented dates.
  const publishedLabel=clean(m[2]).match(/(?:\d+\s*(?:年|月|周|天|小时|分钟)前|昨天|今天)/)?.[0]||'来源未提供准确日期';
  out.push({id:source.id+':'+url,creatorId:source.id,title:title.slice(0,300),summary:'',publishedAt:null,publishedLabel,url,linkKind:'directory'});
 }
 if(!out.length)throw new Error('公开目录结构变化');
 return out.slice(0,6);
}
async function boundedText(response){
 const reader=response.body?.getReader();if(!reader)return response.text();
 const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024){await reader.cancel();throw new Error('订阅内容超过读取上限');}chunks.push(value);}const data=new Uint8Array(size);let p=0;for(const chunk of chunks){data.set(chunk,p);p+=chunk.length;}return new TextDecoder().decode(data);
}
export function createCreatorFeed({sources,seed={accounts:[]},restored=null,fetcher=fetch,now=Date.now,assets={},interval=CREATOR_INTERVAL}){
 const initial=restored?.accounts||seed.accounts||[];
 const visualFor=createVisualResolver(assets,[]);
 const tones={irene:'#f4edce',xpin:'#e7e6ec',huashu:'#e7e4dd',cyber:'#dcebea',khazix:'#e7e6ec',founder:'#dfe9f3'};
 const authorFor=s=>({name:s.name,asset:assets[s.assetKey||'creator_'+s.id]?.asset||null,tone:s.tone||tones[s.id]||'#e9e4dc'});
 const decorate=(item,s)=>{const visual=visualFor({title:item.title,sourceName:s.name,category:s.category});if(!visual.entities.some(e=>e.asset))visual.entities=[authorFor(s)];return {...item,opportunity:creatorOpportunity(item),visual:{...visual,author:authorFor(s)}};};
 let accounts=sources.map(source=>({id:source.id,items:[],status:'waiting',nextCheckAt:0,...initial.find(s=>s.id===source.id)})),pending;
 const snapshot=()=>({accounts:sources.map(s=>{const a=accounts.find(a=>a.id===s.id);return {...a,items:a.items.map(item=>decorate(item,s)),avatar:authorFor(s),name:s.name,category:s.category,focus:s.focus,provider:s.provider,platform:s.platform,sourceUrl:s.url,evidenceUrl:s.evidenceUrl,kind:s.kind,etag:undefined,lastModified:undefined};}),intervalSeconds:interval/1000,nextCheckAt:Math.min(...accounts.map(a=>a.nextCheckAt||0)),refreshing:!!pending});
 async function refresh(){
  // Three workers bound memory while independent sources succeed/fail separately.
  let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<sources.length){const i=cursor++,s=sources[i],old=accounts[i],t=now();if(t<(old.nextCheckAt||0))continue;
   try{
    const headers={Accept:s.kind==='directory'?'text/html':'application/rss+xml, application/atom+xml, application/xml'};if(old.etag)headers['If-None-Match']=old.etag;if(old.lastModified)headers['If-Modified-Since']=old.lastModified;
    const r=await fetcher(s.url,{headers,signal:AbortSignal.timeout(9000),redirect:'follow'});
    if(r.redirected&&new URL(r.url).hostname!==new URL(s.url).hostname)throw new Error('来源入口发生变化');
    const nextCheckAt=t+Math.max(interval,Number(r.headers.get('cache-control')?.match(/(?:s-maxage|max-age)=(\d+)/)?.[1]||0)*1000);
    if(r.status===304){if(!old.checkedAt)throw new Error('没有可复用的订阅');accounts[i]={...old,checkedAt:new Date(t).toISOString(),lastSuccessAt:new Date(t).toISOString(),nextCheckAt,status:old.items.length?(s.kind==='directory'?'limited':'ok'):'empty',failures:0};continue;}
    if(!r.ok){const error=new Error('HTTP '+r.status),retry=r.headers.get('retry-after');error.retryAfter=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-t)):0;throw error;}
    const text=await boundedText(r),items=s.kind==='atom'?parseAtom(text,s,t):s.kind==='rss'?parseRSS(text,s,t):parseDirectory(text,s);
    accounts[i]={id:s.id,items,checkedAt:new Date(t).toISOString(),lastSuccessAt:new Date(t).toISOString(),nextCheckAt,etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified'),status:s.kind==='directory'?'limited':items.length?'ok':'empty',failures:0};
   }catch(e){const failures=(old.failures||0)+1;accounts[i]={...old,status:'error',checkedAt:new Date(t).toISOString(),failures,nextCheckAt:t+Math.max(interval*Math.min(2**(failures-1),8),e.retryAfter||0),message:'暂时无法读取，已保留上次内容，稍后自动重试。'};}
  }}));return snapshot();
 }
 return {snapshot,exportState:()=>({accounts}),check(){if(pending)return pending;if(now()<snapshot().nextCheckAt)return Promise.resolve(snapshot());pending=refresh().finally(()=>{pending=null;});return pending;}};
}
