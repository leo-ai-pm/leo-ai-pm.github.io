import {createCreatorFeed} from './creator-feed.mjs';
const DAY=86400000;
const relevant=/(?:\bAI\b|\bLLM\b|Agent|GPT|Claude|Gemini|Qwen|人工智能|智能体|大模型|提示词|RAG|自动化|workflow)/i;
const digest=/派早报|早报|晚报|周报|周刊|人才负责人|招到|一周新闻|Weekly Dose|本周看什么|限时优惠|抽奖|招聘/i;
export function curateResearch(accounts,now=Date.now()){
 const seen=new Set(),items=[];
 for(const account of accounts){
  let count=0;
  for(const item of [...account.items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))){
   const age=now-Date.parse(item.publishedAt),text=item.title+' '+item.summary;
   if(account.id==='woshipm'&&!/体验|实测|评测|拆解|工作流|开发|方案|设计|案例|需求|用户|定价|商业化|留存|转化|增长|模型|Agent|RAG|API/i.test(item.title))continue;
   if(!Number.isFinite(age)||age< -300000||age>30*DAY||!relevant.test(text)||digest.test(item.title))continue;
   const normalized=item.title.toLowerCase().replace(/[\s\p{P}]/gu,'');
   if(seen.has(item.url)||seen.has(normalized))continue;seen.add(item.url);seen.add(normalized);
   const summary=item.summary?.replace(/<[^>]*>/g,'').replace(/查看全文\s*$/,'').trim()||'来源未提供摘要，请打开原文查看。';
   items.push({...item,creatorId:undefined,researchId:account.id,sourceName:account.name,sourceUrl:item.url,sourceGroup:account.category,category:account.category,platform:account.platform,brief:summary,summary,question:account.focus,isArchive:age>7*DAY,verification:'来源摘要 · 按关键词筛选，未逐条独立核验',aggregateUrl:account.sourceUrl});
   if(++count===3)break;
  }
 }
 return items.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id)).slice(0,12).map((item,index)=>({...item,priority:index===0?'lead':index<3?'important':'normal'}));
}
export function createResearchFeed(options){
 const feed=createCreatorFeed({...options,interval:3600000});
 return {snapshot(){const s=feed.snapshot();return {...s,items:curateResearch(s.accounts,options.now?.()??Date.now()),library:(options.library||[]).map(x=>({...x,asset:options.assets?.[x.assetKey]?.asset||null})),accounts:s.accounts.map(({items,...account})=>({...account,received:items.length}))};},check:()=>feed.check(),exportState:()=>feed.exportState()};
}
