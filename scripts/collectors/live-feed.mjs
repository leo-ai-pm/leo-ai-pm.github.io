export const MIN_INTERVAL=300000;
const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol);}catch{return false;}};
const officialDomains=['openai.com','anthropic.com','nvidia.com','deepmind.google','blog.google','microsoft.com','github.blog','x.ai'];
const officialHandles=['openai','openaidevs','anthropicai','claudeai','nvidia','googledeepmind','googleai','github','huggingface','perplexity_ai','xai'];
const agent=/\bagents?\b|智能体|codex|claude code|\bbot\b|工具调用|多模型编排/i;
function sourceInfo(item,people) {
 const url=new URL(item.links.original),isX=['x.com','twitter.com'].includes(url.hostname),handle=isX?(url.pathname.match(/^\/([^/]+)\/status\/\d+\/?$/)?.[1]||''):'';
 const person=people.find(p=>p.handle.toLowerCase()===handle.toLowerCase());
 const official=officialHandles.includes(handle.toLowerCase())||officialDomains.some(d=>url.hostname===d||url.hostname.endsWith('.'+d))||(url.hostname==='github.com'&&url.pathname.startsWith('/anthropics/'));
 return {platform:isX?'X':'网站',authorHandle:handle,sourceGroup:official?'机构官方':person?.group||'媒体与社区',sourceName:person?`${person.name} · @${handle}`:item.source.name,feedName:item.source.name};
}
function normalize(report,config,visualFor) {
 if(!report?.id||!report.title||!report.summary||!report.source?.name||!safeURL(report.links?.original)||!safeURL(report.links?.aihot)||!Number.isFinite(Date.parse(report.publishedAt)))throw new Error('来源条目不完整');
 const category=report.category||(/IPO|收购|估值/.test(report.title)?'industry':/模型|GPT|WeatherNext/.test(report.title)?'ai-models':/证明|研究/.test(report.title)?'paper':'ai-products');
 const item={id:'aihot-'+report.id,title:report.title,brief:report.reason||report.summary.split(/(?<=[。！？])\s*/u)[0],summary:report.summary,
 category:({'ai-models':'模型进展','ai-products':'产品动态',industry:'行业观察',paper:'研究进展',tip:'实践与观点'})[category]||'AI 动态',
 topic:agent.test(report.title+' '+report.summary)?'Agent':'AI 产品',priority:'normal',...sourceInfo(report,config.people),sourceUrl:report.links.original,aggregateUrl:report.links.aihot,
 acquiredVia:'AIHot',publishedAt:report.publishedAt,verification:'AIHot 摘要 · 原文可查'};
 item.visual=visualFor(item);return item;
}
export function createLiveFeed({seed,config,voices,visualFor,fetcher=fetch,now=Date.now,onUpdate=async()=>{},restored=null,onError=()=>{}}) {
 const BASE = new URL(config.baseUrl).origin;
 let state=restored || {data:seed,checkedAt:null,nextCheckAt:0,etag:null,resources:{},status:'waiting',failures:0};
 let pending=null;
 const snapshot=()=>({data:state.data,live:{status:state.status,checkedAt:state.checkedAt,nextCheckAt:state.nextCheckAt,intervalSeconds:MIN_INTERVAL/1000,message:state.message||''}});
 async function refresh(){
  const resources={...state.resources};
  async function get(path,floor=60000) {
   const cached=resources[path],t=now();
   if(cached&&t<cached.validUntil)return cached.body;
   const r=await fetcher(BASE+path,{headers:cached?.etag?{'If-None-Match':cached.etag}:{},signal:AbortSignal.timeout(15000)});
   const interval=Math.max(floor,Number(r.headers.get('cache-control')?.match(/s-maxage=(\d+)/)?.[1]||0)*1000);
   if(r.status===304&&cached){resources[path]={...cached,validUntil:t+interval};return cached.body;}
   if(!r.ok){const error=new Error('AIHot 暂时不可用');const retry=r.headers.get('retry-after');error.retryAfter=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-t)):0;throw error;}
   const body=await r.json();resources[path]={body,etag:r.headers.get('etag'),validUntil:t+interval};return body;
  }
  try{
   const hot=await get('/api/v1/hot-topics',MIN_INTERVAL);
   if(!Array.isArray(hot.items)||!hot.items.length||hot.items.some((v,i)=>v.rank!==i+1))throw new Error('热点榜结构异常');
   const items=[],used=new Set();
   for(const h of hot.items){
    const url=new URL(h.links.story);if(url.origin!==BASE||!url.pathname.startsWith('/story/'))throw new Error('事件链接异常');
    const detail=await get('/api/v1/stories/'+encodeURIComponent(url.pathname.split('/').pop()));
    const report=detail.story?.reports?.find(r=>r.id===h.id)||detail.story?.reports?.find(r=>r.links.original===h.links.original);
    const item=normalize({...report,id:h.id,title:h.title,source:h.source,links:h.links},config,visualFor);
    item.hotRank=h.rank;item.sourceCount=h.sourceCount;item.signalCount=h.signalCount;item.storyUrl=h.links.story;
    items.push(item);used.add(item.sourceUrl);
   }
   const pool=[];let cursor=null;
   for(let page=0;page<4;page++){
    const q=new URLSearchParams({mode:'all',window:'24h',by:'published',limit:'100',...(cursor?{cursor}:{})});
    const body=await get('/api/v1/items?'+q);if(!Array.isArray(body.items)||!body.page)throw new Error('人物动态结构异常');pool.push(...body.items);
    cursor=body.page.nextCursor;if(!body.page.hasMore||!cursor)break;
   }
   const candidates=pool.filter(r=>r.id&&r.title&&r.summary&&r.source?.name&&safeURL(r.links?.aihot)&&safeURL(r.links?.original)&&Date.parse(r.publishedAt)>=now()-86400000&&Date.parse(r.publishedAt)<=now()+300000);
   const people=config.people.map(p=>{
    const matches=candidates.filter(r=>{const u=new URL(r.links.original);return ['x.com','twitter.com'].includes(u.hostname)&&u.pathname.toLowerCase().startsWith('/'+p.handle.toLowerCase()+'/status/');}).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
    if(matches[0]&&!used.has(matches[0].links.original)){items.push(normalize(matches[0],config,visualFor));used.add(matches[0].links.original);}
    return {...p,url:'https://x.com/'+p.handle,matched:matches.length,status:matches.length?'本次收录':voices.some(v=>v.authorHandle===p.handle)?'历史观点已核对':'本次未检出'};
   });
   const latestCount=items.length-hot.items.length;
   const archived=voices.filter(v=>v.isArchive&&safeURL(v.sourceUrl)).map(v=>({...v,visual:visualFor(v)}));items.push(...archived);
   items.forEach((item,i)=>item.priority=i===0?'lead':i<3?'important':'normal');
   const changed=JSON.stringify(items)!==JSON.stringify(state.data.items);
   const t=now();
   const data={...state.data,items,sources:{...state.data.sources,people},demo:false,date:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric'}).format(t),updatedAt:changed?new Date(t).toISOString():state.data.updatedAt,
    sync:{...state.data.sync,method:'AIHot 官方 API 条件自动更新',hotCount:hot.items.length,latestCount,archiveCount:archived.length},
    notice:'优先呈现 AIHot 48 小时热点榜，保持原始名次；自动跟随来源更新。摘要由 AIHot 提供，详情请查原文。'};
   const next={data,checkedAt:new Date(t).toISOString(),nextCheckAt:Math.max(t+MIN_INTERVAL,resources['/api/v1/hot-topics'].validUntil),resources,status:'ok',failures:0};
   await onUpdate(next);state=next;
  }catch(error){onError(error);const failures=(state.failures||0)+1;state={...state,resources,status:'error',failures,nextCheckAt:now()+Math.max(MIN_INTERVAL*Math.min(2**(failures-1),12),error.retryAfter||0),message:'暂时无法连接 AIHot，已保留上次资讯，稍后自动重试。'};}
  return snapshot();
 }
 return {snapshot,exportState:()=>state,check(){if(pending)return pending;if(now()<state.nextCheckAt)return Promise.resolve(snapshot());pending=refresh().finally(()=>pending=null);return pending;}};
}
