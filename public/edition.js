(() => {
 const $=id=>document.getElementById(id);
 const {node,externalLink:link,dateText,setLead}=window.DailyPresentation;
 const anchor=(url,className,label)=>{const a=document.createElement('a');try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error('bad');a.href=parsed.href;}catch{return node('span',className);}a.className=className;a.target='_blank';a.rel='noopener noreferrer';if(label)a.setAttribute('aria-label',label);return a;};
 let report=null,selected=null,tools=null,ranking=[],orbit=[],windowName='today',category='全部',watchId='';
 const timeNote=item=>item?.timeBasis==='discovered'?' · AIHOT 收录时间':'';
 function row(item){
  const article=node('article','feed-row');
  const title=link(item.title,item.aihotUrl||item.sourceUrl,'item-title');
  article.append(title);
  const sentence=item.reason||item.summary||'';
  if(sentence)article.append(node('p','reason',(item.reason?'推荐理由：':'')+sentence));
  const meta=node('p','item-meta');
  if(item.sourceName)meta.append(node('span','',item.sourceName));
  meta.append(node('span','',timeNote(item)));
  if(item.unselected)meta.append(node('span','badge','未进入精选'));
  if(item.categoryLabel)meta.append(node('span','', ' · '+item.categoryLabel));
  if(item.sourceUrl&&item.sourceUrl!==item.aihotUrl)meta.append(link('原文 ↗',item.sourceUrl));
  article.append(meta);
  return article;
 }
 function capsules(id,values,current,onSelect){
  const root=$(id);root.replaceChildren();
  for(const value of values){
   const button=node('button','',value.label);button.type='button';button.setAttribute('aria-pressed',String(value.id===current));
   button.addEventListener('click',()=>onSelect(value.id));root.append(button);
  }
 }
 function renderDaily(){
  const status=$('daily-status');
  if(!report){status.textContent='今日导读暂时没有内容。';return;}
  const quiet=report.sections.length===0&&report.flashes.length===0;
  status.textContent=[quiet?'本期暂无新增资讯':'',report.generatedAt?`AIHOT 生成于 ${dateText(report.generatedAt)}（北京时间）`:''].filter(Boolean).join(' · ');
  if($('issue'))$('issue').textContent=[report.weekday,report.issue?`第 ${report.issue} 期`:''].filter(Boolean).join(' · ');
  const origin=$('daily-origin');if(report.aihotUrl)origin.href=report.aihotUrl;
  const cal=$('daily-calendar');cal.replaceChildren();
  const month=report.date?.slice(0,7);
  if(month){
   const [year,monthNumber]=month.split('-').map(Number);
   const first=new Date(`${month}-01T12:00:00+08:00`);
   const pad={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short'}).format(first)]||0;
   const days=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
   const have=new Map((report.archive||[]).map(item=>[item.date,item]));
   cal.append(node('p','calendar-label',`${year}年${monthNumber}月`));
   const dots=node('div','dots');
   for(let i=0;i<pad;i++)dots.append(node('span','dot pad'));
   for(let day=1;day<=days;day++){
    const date=`${month}-${String(day).padStart(2,'0')}`;
    const hit=have.get(date);
    if(hit){const a=anchor(hit.aihotUrl||`https://aihot.news/daily/${date}`,'dot on'+(date===report.date?' today':''),`${date} ${hit.title||''}`);dots.append(a);}
    else dots.append(node('span','dot'+(date===report.date?' today':'')));
   }
   cal.append(dots);
  }
  const lead=$('daily-lead');lead.replaceChildren();
  if(report.lead?.title){
   lead.append(node('p','kicker','本期头条'),node('h3','',report.lead.title));
   if(report.lead.summary)lead.append(node('p','',report.lead.summary));
   lead.append(link('在 AIHOT 阅读本期 ↗',report.lead.aihotUrl||report.aihotUrl));
  }
  const sections=$('daily-sections');sections.replaceChildren();
  if(!report.sections.length)sections.append(node('p','section-note daily-empty','本期暂无分类资讯。'));
  for(const section of report.sections||[]){
   const block=node('section','daily-block');block.append(node('h3','',section.label));
   const list=node('ol','daily-list');
   for(const item of section.items||[])list.append(row(item));
   block.append(list);sections.append(block);
  }
  const flashes=$('daily-flashes');flashes.replaceChildren();
  if(!report.flashes.length)flashes.append(node('p','section-note daily-empty','本期暂无快讯。'));
  for(const item of report.flashes||[]){
   const card=anchor(item.aihotUrl||item.sourceUrl,'flash',item.title);
   card.append(node('strong','',item.title),node('span','',`${item.sourceName||''}${item.publishedAt?' · '+dateText(item.publishedAt):''}`));
   flashes.append(card);
  }
  const archive=$('daily-archive-list');archive.replaceChildren();
  for(const item of report.archive||[]){
   const li=node('li','');li.append(node('span','',item.date+' '),link(item.title||item.date,item.aihotUrl));archive.append(li);
  }
 }
 function renderHot(){
  const top=$('hot-top'),rest=$('hot-rest');top.replaceChildren();rest.replaceChildren();
  for(const item of ranking){
   if(item.rank<=3){
    const card=node('article','rank-card');
    card.append(node('p','rank-no',`NO.${String(item.rank).padStart(2,'0')}`));
    card.append(link(item.title,item.storyUrl||item.aihotUrl,'item-title'));
    if(item.latest)card.append(node('p','',item.latest));
    const counts=[`第 ${item.rank} 名`];
    if(Number.isFinite(item.sourceCount))counts.push(`${item.sourceCount} 个来源`);
    if(Number.isFinite(item.participantCount))counts.push(`${item.participantCount} 位参与者`);
    card.append(node('p','item-meta',counts.join(' · ')));
    if(item.reports?.length){
     const list=node('ol','report-list');
     for(const reportItem of item.reports){
      const li=node('li','');li.append(link(reportItem.title,reportItem.sourceUrl||reportItem.aihotUrl),node('span','',reportItem.sourceName?` · ${reportItem.sourceName}`:''));list.append(li);
     }
     card.append(list);
    }
    if(item.related?.length){
     const related=node('p','item-meta','相关：');
     item.related.forEach((rel,index)=>{if(index)related.append(document.createTextNode('、'));related.append(link(rel.title,rel.storyUrl));});
     card.append(related);
    }
    top.append(card);
   }else{
    const line=node('a','rank-line');line.href=item.storyUrl||item.aihotUrl;line.target='_blank';line.rel='noopener noreferrer';
    const counts=[`第 ${item.rank} 名`];
    if(Number.isFinite(item.sourceCount))counts.push(`${item.sourceCount} 个来源`);
    if(Number.isFinite(item.participantCount))counts.push(`${item.participantCount} 位参与者`);
    line.append(node('span','rank-no',String(item.rank).padStart(2,'0')),node('strong','',item.title),node('span','',counts.join(' · ')));
    rest.append(line);
   }
  }
 }
 function selectedItems(){
  const pool=windowName==='week'?(selected?.week||[]):(selected?.today||[]);
  return pool.filter(item=>category==='全部'||item.categoryLabel===category||item.category===category);
 }
 function renderSelected(){
  if(!selected)return;
  capsules('selected-window',[{id:'today',label:'今天'},{id:'week',label:'本周'}],windowName,id=>{windowName=id;renderSelected();});
  const cats=[{id:'全部',label:'全部'},...(selected.categories||[]).map(item=>({id:item.label,label:item.label}))];
  capsules('selected-category',cats,category,id=>{category=id;renderSelected();});
  const items=selectedItems();
  $('selected-status').textContent=selected.message||`${windowName==='week'?'近 7 天':'近 24 小时'} · ${items.length} 条`;
  const list=$('selected-list');list.replaceChildren();
  if(!items.length)list.append(node('p','section-note',windowName==='today'?'今天这个分类还没有精选，可以改看本周。':'这个分类最近没有进入精选。'));
  else for(const item of items)list.append(row(item));
 }
 function renderWatch(){
  const topics=selected?.watch||[];
  if(!topics.length){$('watch-status').textContent='关注方向暂时没有更新。';return;}
  if(!topics.some(topic=>topic.id===watchId))watchId=topics[0].id;
  capsules('watch-topics',topics.map(topic=>({id:topic.id,label:topic.label})),watchId,id=>{watchId=id;renderWatch();});
  const topic=topics.find(item=>item.id===watchId);
  $('watch-status').textContent=topic?.unselected&&topic.items.length?'这些匹配没有进入精选。':`关键词「${topic?.query||topic?.label||''}」`;
  const list=$('watch-list');list.replaceChildren();
  if(!topic?.items?.length)list.append(node('p','section-note','这个方向最近没有匹配。'));
  else for(const item of topic.items)list.append(row({...item,unselected:topic.unselected||item.unselected}));
 }
 function renderTools(){
  const codex=tools?.codex;
  $('tools-status').textContent=tools?.message||(codex?.checkedAt?`最近检查 ${dateText(codex.checkedAt)} · ${codex.monitor==='healthy'?'监控正常':'监控状态待确认'}${codex.outage?' · 来源标记了异常':''}`:'');
  const page=$('codex-page');if(codex?.pageUrl)page.href=codex.pageUrl;
  const list=$('codex-events');list.replaceChildren();
  for(const event of codex?.events||[]){
   const article=node('article','feed-row');
   article.append(node('p','item-meta',[event.label,event.status,event.at?dateText(event.at):''].filter(Boolean).join(' · ')));
   article.append(link(event.title||event.label,event.pageUrl,'item-title'));
   if(event.sourceUrl)article.append(link('来源帖子 ↗',event.sourceUrl));
   list.append(article);
  }
  if(codex&&!codex.events?.length)list.append(node('p','section-note','最近没有新的重置记录。'));
  const links=$('tool-links');links.replaceChildren();
  for(const item of tools?.links||[]){
   const card=anchor(item.url,'tool-card',item.label);
   card.append(node('strong','',item.label),node('span','',item.note||'在 AIHOT 打开'));
   links.append(card);
  }
 }
 function refreshLead(){
  if(!report?.lead)return;
  setLead({title:report.lead.title,brief:report.lead.summary,summary:report.lead.summary,category:'今日导读',sourceName:'AIHOT',visual:report.lead.visual,kicker:`今日导读 / ${report.dateLabel||report.date}`,indexLabel:report.issue?`第${report.issue}期 / THE DAILY`:'01 / THE DAILY',id:'daily-lead',orbit});
 }
 document.addEventListener('daily:edition',event=>{
  ranking=event.detail?.ranking||[];
  const people=(event.detail?.items||[]).filter(item=>item.visual);
  orbit=[...ranking.filter(item=>item.visual).map(item=>({...item,id:'hot-'+item.id})),...people];
  renderHot();refreshLead();
 });
 async function load(path,apply,status){
  try{const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('unavailable');apply(await response.json());}
  catch{if($(status))$(status).textContent='暂时无法读取，已保留上次内容。';}
 }
 async function refresh(){
  await Promise.all([
   load('/api/daily-report.json',body=>{
    if(body?.report){
     report=body.report;renderDaily();refreshLead();
     if(body.status==='error')$('daily-status').textContent=body.message||'今日导读暂时无法更新，已保留上次内容。';
    }else if($('daily-status'))$('daily-status').textContent=body?.message||'今日导读暂时没有内容。';
   },'daily-status'),
   load('/api/selected.json',body=>{selected=body;renderSelected();renderWatch();},'selected-status'),
   load('/api/tools.json',body=>{tools=body;renderTools();},'tools-status'),
  ]);
 }
 refresh();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
