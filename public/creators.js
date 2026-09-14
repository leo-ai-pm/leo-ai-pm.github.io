(() => {
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const external=(text,url)=>{const n=el('a','',text);try{const u=new URL(url);if(u.protocol!=='https:'&&u.protocol!=='http:')return el('span','',text);n.href=u.href;}catch{return el('span','',text);}n.target='_blank';n.rel='noopener noreferrer';return n;};
 const date=value=>value?new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}).format(new Date(value)):'';
 let data=null,timer=0,busy=false,next=0,limit=18,lastSignature='';
 const viewName=()=>{const v=new URL(location.href).searchParams.get('view');return ['creators','research'].includes(v)?v:'daily';};
 const isOpen=()=>viewName()==='creators';
 function view(){
  const mode=viewName();document.documentElement.dataset.view=mode;
  for(const [id,name] of [['creators','creators'],['research','research'],['content','daily']])$(id).hidden=mode!==name;
  $('cover-flow').hidden=false;
  for(const name of ['creators','research']){const nav=$(name+'-nav');if(mode===name)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');}
  dispatchEvent(new Event('daily:viewchange'));if(isOpen())check();else clearTimeout(timer);
 }
 function jump(id,instant=false){
  const target=$(id);if(!target)return;
  if(id!=='landing')target.focus({preventScroll:true});
  const top=id==='landing'?0:target.getBoundingClientRect().top+scrollY-document.querySelector('.cover-nav').getBoundingClientRect().height-12;
  window.scrollTo({top,behavior:instant||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function navigate(mode,id,topic){
  const u=new URL(location.href);if(mode!=='daily')u.searchParams.set('view',mode);else u.searchParams.delete('view');u.hash=id==='landing'?'':id;
  history.pushState(null,'',u.pathname+u.search+u.hash);view();if(topic)window.DailyPresentation.filterTopic(topic);jump(id,id==='landing');
 }
 document.addEventListener('click',e=>{
  const a=e.target.closest('a');if(!a||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  let mode=viewName(),id=null;
  if(a.id==='creators-nav'||a.id==='research-nav'){mode=a.id==='creators-nav'?'creators':'research';id='landing';}
  else if(a.dataset.topic){mode='daily';id='content';}
  else if(a.classList.contains('wordmark')){mode='daily';id='landing';}
  else if(a.hasAttribute('data-current-reading'))id=mode==='daily'?'content':mode;
  else if(a.hasAttribute('data-current-cover'))id='landing';
  else if(a.getAttribute('href')==='#landing')id='landing';
  else if(a.getAttribute('href')==='#content'){mode='daily';id='content';}
  if(!id)return;e.preventDefault();e.stopPropagation();navigate(mode,id,a.dataset.topic);
 },true);
 window.addEventListener('popstate',()=>{view();jump(location.hash.slice(1)||'landing',true);});
 function status(a){
  if(a.status==='error')return '读取失败 · 保留上次内容';
  if(a.kind==='directory')return '来源较旧 · 仅公开目录';
  if(a.status==='empty')return '来源暂未返回内容';
  if(a.status==='waiting')return '等待检查';
  if(a.items[0]?.publishedAt&&Date.now()-Date.parse(a.items[0].publishedAt)>30*86400000)return '来源较久未更新';
  return '自动检查已启用';
 }
 function render(){
  if(!data)return;
  $('creator-account-count').textContent=`关注你的 ${data.accounts.length} 个账号`;
  const sig=JSON.stringify(data.accounts);if(sig!==lastSignature){
   const reading=[...document.querySelectorAll('#creator-stories article')].find(a=>{const r=a.getBoundingClientRect();return r.bottom>110&&r.top<innerHeight;});
   const anchor=reading?{id:reading.id,top:reading.getBoundingClientRect().top}:null;
   const selected=$('creator-filter').value,active=document.activeElement?.id;
   const select=$('creator-filter');select.replaceChildren(new Option('全部账号',''));
   const accounts=$('creator-accounts');accounts.replaceChildren();
   for(const a of data.accounts){
    select.append(new Option(a.name,a.id));const box=el('section','creator-account');box.dataset.state=a.status;
    const button=el('button','creator-name',a.name);button.type='button';button.id='creator-account-'+a.id;button.setAttribute('aria-pressed',String(selected===a.id));button.addEventListener('click',()=>{select.value=a.id;limit=18;renderItems();});
    if(a.avatar)box.append(window.DailyPresentation.identityImage(a.avatar));
    box.append(el('span','creator-category',a.category),button,el('p','creator-focus',a.focus),el('p','creator-account-state',status(a)),el('p','creator-check-time',a.lastSuccessAt?'读取成功 '+date(a.lastSuccessAt):'尚未成功读取'));
    accounts.append(box);
   }
   if([...select.options].some(o=>o.value===selected))select.value=selected;
   lastSignature=sig;renderItems();const retained=anchor?$(anchor.id):null;if(retained)window.scrollBy({top:retained.getBoundingClientRect().top-anchor.top,behavior:'instant'});if(active?.startsWith('creator-account-'))$(active)?.focus({preventScroll:true});
  }
  const failed=data.accounts.filter(a=>a.status==='error').length;
  const times=data.accounts.map(a=>Date.parse(a.checkedAt)).filter(Number.isFinite),checked=times.length?new Date(Math.max(...times)).toISOString():null;
  $('creator-live-status').textContent=data.refreshing?'已显示保存内容，正在后台检查更新…':`计划每 15 分钟同步${checked?' · 最近检查 '+date(checked):''}${failed?' · '+failed+' 个来源暂时读取失败':''}`;
 }
 function renderItems(){
  const selected=$('creator-filter').value;
  for(const a of data.accounts)$('creator-account-'+a.id)?.setAttribute('aria-pressed',String(selected===a.id));
  const accounts=data.accounts.filter(a=>!selected||a.id===selected);
  const items=accounts.filter(a=>a.kind!=='directory').flatMap(a=>a.items.map(item=>({...item,account:a}))).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const root=$('creator-stories');root.replaceChildren();
  const asStories=items=>items.map((item,index)=>({...item,id:'creator-'+item.id,sourceName:item.account.name,sourceUrl:item.url,category:item.account.category,platform:item.account.platform,sourceGroup:item.account.category,
   priority:index===0?'lead':index<3?'important':'normal',question:item.opportunity?.question,brief:item.summary||'来源未提供摘要，可打开原文阅读。',summary:item.summary||'来源未提供摘要，可打开原文阅读。',
   verification:item.account.id==='xpin'?'官方英文内容 · 未自动翻译':`作者内容 · 经 ${item.account.provider} 收录，未独立核验`,aggregateUrl:item.account.evidenceUrl||item.account.sourceUrl}));
  const edition=asStories(items.slice(0,limit));
  for(const item of edition)root.append(window.DailyPresentation.article(item,edition.indexOf(item)));
  const coverItems=data.accounts.filter(a=>a.kind!=='directory').flatMap(a=>a.items.map(item=>({...item,account:a}))).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  window.DailyPresentation.updateCreators(asStories(coverItems.slice(0,18)));
  $('creator-count').textContent=`${items.length} 篇订阅内容`;
  $('creator-empty').hidden=items.length>0;$('creator-more').hidden=items.length<=limit;
 }
 function schedule(){clearTimeout(timer);if(isOpen()&&!document.hidden)timer=setTimeout(check,Math.max(1000,next-Date.now()));}
 async function check(){
  if(busy||!isOpen()||document.hidden)return;if(Date.now()<next){schedule();return;}busy=true;
  try{const r=await fetch('/api/creators.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('feed unavailable');const result=await r.json();if(!Array.isArray(result.accounts)||!result.accounts.every(a=>typeof a.id==='string'&&typeof a.name==='string'&&Array.isArray(a.items)))throw new Error('Invalid feed');data=result;render();next=Date.now()+300000;}
  catch{$('creator-live-status').textContent='暂时无法连接更新服务，已有内容继续保留，联网后自动重试。';next=Date.now()+60000;}
  finally{busy=false;schedule();}
 }
 $('creator-filter').addEventListener('change',()=>{limit=18;renderItems();});$('creator-more').addEventListener('click',()=>{limit+=18;renderItems();});
 document.addEventListener('visibilitychange',()=>document.hidden?clearTimeout(timer):check());window.addEventListener('online',()=>{next=0;check();});window.addEventListener('pagehide',()=>clearTimeout(timer));window.addEventListener('pageshow',()=>{view();});view();
})();
