(() => {
 const $=id=>document.getElementById(id),el=(tag,cls,text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
 let data=null,category='全部',libraryGroup='全部',timer=0,next=0,busy=false,signature='';
 const active=()=>document.documentElement.dataset.view==='research';
 const date=t=>t?new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}).format(new Date(t)):'尚未成功读取';
 const link=(text,url)=>{const a=el('a','',text);const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return el('span','',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;};
 function tabs(id,values,selected,onSelect){const root=$(id);root.replaceChildren();for(const value of values){const b=el('button','',value);b.type='button';b.setAttribute('aria-pressed',String(value===selected));b.addEventListener('click',()=>onSelect(value));root.append(b);}}
 function renderItems(){
  tabs('research-filters',['全部','新品与竞品','产品拆解','工作流与实践'],category,value=>{category=value;renderItems();});
  const items=data.items.filter(i=>category==='全部'||i.category===category);const root=$('research-stories');root.replaceChildren();
  items.forEach((item,index)=>root.append(window.DailyPresentation.article({...item,priority:index===0?'lead':index<3?'important':'normal'},index)));
  $('research-count').textContent=`${items.length} 条精选 · 按时间排序`;$('research-empty').hidden=!!items.length;
  window.DailyPresentation.updateResearch(data.items);
 }
 function renderLibrary(){
  tabs('library-filters',['全部',...new Set(data.library.map(x=>x.group))],libraryGroup,value=>{libraryGroup=value;renderLibrary();});
  const root=$('research-library-grid');root.replaceChildren();
  for(const item of data.library.filter(i=>libraryGroup==='全部'||i.group===libraryGroup)){
   const section=el('section','research-resource');section.append(window.DailyPresentation.identityImage({name:item.name,asset:item.asset}),el('p','resource-category',item.group));
   const title=el('h3','');title.append(link(item.name+' ↗',item.url));section.append(title,el('p','',item.brief),el('p','',item.question));root.append(section);
  }
 }
 function render(){
  const sig=JSON.stringify(data);if(sig===signature)return;signature=sig;
  const visible=[...document.querySelectorAll('#research-stories article')].find(e=>{const r=e.getBoundingClientRect();return r.bottom>110&&r.top<innerHeight;});const anchor=visible?{id:visible.id,top:visible.getBoundingClientRect().top}:null;
  renderItems();renderLibrary();const root=$('research-sources');root.replaceChildren();
  for(const a of data.accounts){const s=el('section','source-group');const title=el('h3','');title.append(link(a.name,a.sourceUrl));s.append(title,el('p','',a.status==='error'?'暂时读取失败，保留上次内容':a.received?'已读取 · 经筛选后展示':'来源暂无内容'),el('p','',`最近成功 ${date(a.lastSuccessAt)}`));root.append(s);}
  const latest=Math.max(...data.accounts.map(a=>Date.parse(a.checkedAt)||0));$('research-status').textContent=data.refreshing?'已显示保存内容，正在后台检查更新…':`每小时自动检查${latest?' · 最近检查 '+date(latest):''}${data.accounts.some(a=>a.status==='error')?' · 部分来源暂不可用':''}`;
  const retained=anchor?$(anchor.id):null;if(retained)scrollBy({top:retained.getBoundingClientRect().top-anchor.top,behavior:'instant'});
 }
 function schedule(){clearTimeout(timer);if(active()&&!document.hidden)timer=setTimeout(check,Math.max(1000,next-Date.now()));}
 async function check(){
  if(!active()||document.hidden||busy)return;if(Date.now()<next){schedule();return;}busy=true;
  try{const r=await fetch('/api/research.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Unavailable');const body=await r.json();if(!Array.isArray(body.items)||!Array.isArray(body.library)||!Array.isArray(body.accounts))throw Error('Invalid feed');data=body;render();next=Date.now()+300000;}
  catch{$('research-status').textContent='暂时无法连接更新服务，已加载内容继续保留，稍后自动重试。';next=Date.now()+60000;}finally{busy=false;schedule();}
 }
 window.addEventListener('daily:viewchange',()=>active()?check():clearTimeout(timer));document.addEventListener('visibilitychange',()=>document.hidden?clearTimeout(timer):check());window.addEventListener('online',()=>{next=0;check();});window.addEventListener('pagehide',()=>clearTimeout(timer));window.addEventListener('pageshow',check);check();
})();
