let topics = ['AI 产品', 'Agent'];
const $ = id => document.getElementById(id);
const node = (tag, className, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
async function readJSON(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法读取 ${path}`);
  return response.json();
}
function applyTheme(theme) {
  if (Array.isArray(theme.topics) && theme.topics.every(t => typeof t === 'string' && t.trim())) topics = [...new Set(theme.topics)];
  $('focus-topics').textContent = topics.join(' · ');
  for (const [key, variable] of Object.entries({backgroundColor:'--bg',textColor:'--ink',accentColor:'--accent'})) {
    if (/^#[0-9a-f]{6}$/i.test(theme[key])) document.documentElement.style.setProperty(variable, theme[key]);
  }
  document.documentElement.style.setProperty('--title-font', theme.titleFont === 'sans-serif' ? "'PingFang SC',sans-serif" : "Georgia,'Songti SC','STSong',serif");
  document.documentElement.style.setProperty('--space', theme.density === 'compact' ? '20px' : theme.density === 'relaxed' ? '44px' : '32px');
  document.documentElement.dataset.density = theme.density || 'comfortable';
  if (typeof theme.name === 'string' && theme.name.trim()) {
    $('paper-name').textContent = theme.name; $('footer-name').textContent = theme.name; document.title = theme.name;
  }
}
const safeTone = tone => /^#[0-9a-f]{6}$/i.test(tone || '') ? tone : '#e9e4dc';
function identityImage(entity) {
  const img=node('img','identity-logo');
  if(!/^\/assets\/identities\/[a-z0-9_]+\.(jpg|png|webp)$/.test(entity.asset || ''))return node('span','identity-initial',entity.name.slice(0,2));
  img.src=entity.asset;img.alt=entity.name;img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>img.replaceWith(node('span','identity-initial',entity.name.slice(0,2))),{once:true});return img;
}
function identityContent(visual) {
  const inner=node('div','identity-inner'),row=node('div','identity-entities');
  for(const entity of visual.entities.slice(0,2)) {
    const block=node('div','identity-entity');block.append(identityImage(entity),node('strong','identity-name',entity.name));row.append(block);
  }
  inner.append(row,node('span','identity-caption',visual.caption || 'AI 产品与 Agent'));return inner;
}
function itemVisual(item) {
  return item.visual?.entities?.length ? item.visual : {entities:[{name:item.sourceName}],caption:item.category};
}
let activeTopic = '全部', hotOnly=false;
const dateText = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return '日期未提供';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
};
function externalLink(text, url, className = '') {
  const link = node('a', className, text);
  try {const parsed=new URL(url); if (!['https:','http:'].includes(parsed.protocol)) return node('span',className,text); link.href=parsed.href;}
  catch {return node('span',className,text);}
  link.target='_blank';link.rel='noopener noreferrer';return link;
}
function applyFilters() {
  const source=$('source-filter').value, author=$('author-filter').value;
  let visible=0, archived=0;
  document.querySelectorAll('#stories article').forEach(article=>{
    article.hidden=(activeTopic!=='全部' && article.dataset.topic!==activeTopic) || (source && article.dataset.source!==source) || (author && article.dataset.author!==author) || (hotOnly && article.dataset.hot!=='true');
    if (!article.hidden) {visible++;if(article.dataset.archive==='true')archived++;}
  });
  $('topic-filters').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.textContent===activeTopic)));
  $('count').textContent=`${visible} 则选读${archived?' · 含 '+archived+' 则历史观点':''}`;
  $('filter-empty').hidden=visible>0;
}
function filterTopic(topic) {
  if (topic!=='全部' && !topics.includes(topic)) return;
  activeTopic=topic;applyFilters();
}
function renderSources(data) {
  const groups=data.sources?.groups || [], people=data.sources?.people || [];
  const groupSelect=$('source-filter'),authorSelect=$('author-filter');
  const savedGroup=groupSelect.value,savedAuthor=authorSelect.value;
  groupSelect.replaceChildren(new Option('全部来源',''));
  for(const group of groups) groupSelect.add(new Option(group,group));
  authorSelect.replaceChildren(new Option('全部人物与机构',''));
  for(const person of people) authorSelect.add(new Option(person.name,person.handle.toLowerCase()));
  if([...groupSelect.options].some(o=>o.value===savedGroup))groupSelect.value=savedGroup;
  if([...authorSelect.options].some(o=>o.value===savedAuthor))authorSelect.value=savedAuthor;
  const overview=$('source-overview');overview.replaceChildren();
  const acquisition=node('p','', '资讯获取渠道：');
  acquisition.append(externalLink('AIHot ↗',data.sources?.aggregator?.url), document.createTextNode(' · MCP 热点榜与官方 API 人物动态'));
  overview.append(acquisition,node('p','',data.sources?.coverage || '每条内容均保留原始来源链接。'));
  const directory=$('source-groups');directory.replaceChildren();
  for(const group of groups) {
    const section=node('section','source-group');section.append(node('h3','',group));
    const list=node('ul','');
    for(const person of people.filter(p=>p.group===group)) {
      const li=node('li','');
      li.append(externalLink(person.name+' ↗',person.url),node('span','source-focus',person.focus),node('span','source-status',person.status==='本次未检出'?'本次未检出 X 动态':person.status));list.append(li);
    }
    const sites=new Map();
    data.items.filter(i=>i.sourceGroup===group && !people.some(p=>p.handle.toLowerCase()===(i.authorHandle||'').toLowerCase())).forEach(i=>{
      const url=new URL(i.sourceUrl); const home=i.platform==='X'&&i.authorHandle ? `https://x.com/${i.authorHandle}` : url.hostname==='github.com' ? `${url.origin}/${url.pathname.split('/')[1]}` : url.origin;
      sites.set(i.sourceName,home);
    });
    for(const [name,url] of sites) {const li=node('li','');li.append(externalLink(name+' ↗',url),node('span','source-status','本期资讯来源'));list.append(li);}
    if(!list.children.length) list.append(node('li','source-status','本期尚未收录'));
    section.append(list);directory.append(section);
  }
  $('source-directory').hidden=!groups.length;
  $('sync-time').textContent=data.updatedAt?`最近同步 ${dateText(data.updatedAt)}（北京时间） · 热点 ${data.sync?.hotCount || 0} 条 · 人物动态 ${data.sync?.latestCount || 0} 条${data.sync?.archiveCount?' · 历史观点 '+data.sync.archiveCount+' 条':''}`:'';
  $('hot-label').textContent=`AIHOT TOP ${data.sync?.hotCount || 10} / 48 小时热点 · 原榜顺序`;

}
$('hot-only').addEventListener('click',()=>{hotOnly=!hotOnly;$('hot-only').setAttribute('aria-pressed',String(hotOnly));applyFilters();});
$('source-filter').addEventListener('change',applyFilters);
$('author-filter').addEventListener('change',applyFilters);
$('reset-filters').addEventListener('click',()=>{$('source-filter').value='';$('author-filter').value='';hotOnly=false;$('hot-only').setAttribute('aria-pressed','false');filterTopic('全部');});
document.querySelector('a[href="#source-directory"]').addEventListener('click',()=>{$('source-directory').open=true;});
function createStoryArticle(item,index) {
    const url = new URL(item.sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('来源链接须使用 http 或 https');
    const article = node('article', item.priority); article.id = `story-${item.id}`; article.dataset.topic = item.topic || item.category;
    article.dataset.source=item.sourceGroup || '';article.dataset.author=(item.authorHandle || '').toLowerCase();article.dataset.archive=String(!!item.isArchive);article.dataset.hot=String(!!item.hotRank);
    const art = node('a', 'story-visual');
    art.href = url.href; art.target = '_blank'; art.rel = 'noopener noreferrer';
    art.setAttribute('aria-label',`${item.title}：阅读来源（新标签页）`);
    const visual=itemVisual(item);
    art.classList.add('identity-visual');art.style.backgroundColor=safeTone(visual.entities[0].tone);
    art.append(identityContent(visual),node('span','image-index',item.hotRank?`AIHOT · ${String(item.hotRank).padStart(2,'0')}`:String(index+1).padStart(2,'0')));
    const copy = node('div','story-copy');
    const meta = node('div','eyebrow');
    meta.append(node('span','label',item.hotRank?`热点 ${String(item.hotRank).padStart(2,'0')}`:(item.creatorId||item.researchId?{lead:'最新选读',important:'重点关注',normal:'观点与实践'}:{lead:'本期头条',important:'重点关注',normal:'人物动态'})[item.priority]),node('span','category',item.category));
    copy.append(meta,node('p',item.isArchive?'article-date archive-date':'article-date',`${item.isArchive?'历史观点 · ':''}${dateText(item.publishedAt)}${item.isArchive?' · 非今日动态':''}`),node('h3','',item.title));
    if(item.brief.trim()!==item.summary.trim())copy.append(node('p','brief',item.brief));
    const subs = node('div','subsections');
    const summary = node('section','subsection');
    summary.append(node('h4','','阅读要点'),node('p','',item.summary)); subs.append(summary);
    if (typeof item.question === 'string' && item.question.trim()) {
      const question = node('section','subsection');question.append(node('h4','',item.creatorId?'你的选题机会':'值得追问'),node('p','',item.question));
      if(item.creatorId&&item.opportunity){question.classList.add('creator-opportunity');question.append(node('p','opportunity-method','亲自验证：'+item.opportunity.method),node('p','opportunity-basis',item.opportunity.basis));}
      subs.append(question);
    }
    if(item.hotRank){const heat=node('div','hot-meta');heat.append(node('span','',`AIHot 第 ${item.hotRank} 名 · ${item.sourceCount} 家来源`),externalLink('事件脉络 ↗',item.storyUrl));subs.append(heat);}
    const source = node('div','source');
    const link = node('a','',`${item.sourceName} ↗`);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
    if(item.visual?.author?.asset)link.prepend(identityImage(item.visual.author));
    source.append(node('span','',`${item.sourceGroup || '阅读来源'}${item.platform?' · '+item.platform:''}`),link);
    const provenance=node('div','provenance');
    provenance.append(node('span','',item.acquiredVia==='AIHot'?'AIHot 摘要 · 未逐条独立核实':(item.verification || '')));
    if(item.aggregateUrl) provenance.append(externalLink(item.creatorId?'收录来源 ↗':'聚合详情 ↗',item.aggregateUrl));
    copy.append(subs,source,provenance);article.append(art,copy);return article;
}
let dailyPresentation=null,creatorPresentation=[],researchPresentation=[];
function render(data) {
  if (!Array.isArray(data.items)) throw new Error('日报内容格式不正确');
  const required = ['id','title','brief','summary','category','priority','sourceName','sourceUrl'];
  const ids = new Set(); let leads = 0, importants = 0;
  const fragment = document.createDocumentFragment();
  data.items.forEach((item, index) => {
    if (required.some(key => typeof item[key] !== 'string' || !item[key].trim()) || ids.has(item.id)) throw new Error('日报条目缺少内容，或编号重复');
    ids.add(item.id);
    if (!['lead','important','normal'].includes(item.priority)) throw new Error('日报条目的优先级不正确');
    if (item.priority === 'lead' && ++leads > 1 || item.priority === 'important' && ++importants > 2) throw new Error('头条最多 1 条，重点最多 2 条');
    fragment.append(createStoryArticle(item,index));
  });
  $('stories').replaceChildren(fragment);
  dailyPresentation=data;updatePresentation();
  document.dispatchEvent(new CustomEvent('daily:edition',{detail:data}));
  requestScrollPaint();
  const nav=$('topic-filters'); nav.replaceChildren();
  for (const topic of ['全部',...topics]) {const b=node('button','filter',topic);b.type='button';b.addEventListener('click',()=>filterTopic(topic));nav.append(b);}
  renderSources(data);
  filterTopic(topics.includes(activeTopic) ? activeTopic : '全部');
  $('date').textContent = typeof data.date === 'string' ? data.date : '日期未提供';
  $('edition').textContent = data.demo ? '演示刊 · 非实时新闻' : (data.editionLabel || '个人阅读版');
  $('notice').textContent = data.demo ? '演示内容：以下为阅读选题与参考入口，不代表今日新闻。' : (data.notice || '');
  if (!data.items.length) $('notice').textContent = '这一期还没有内容。你可以直接让 Agent 帮你更新日报。';
}
function updatePresentation() {
  const creator=document.documentElement.dataset.view==='creators',research=document.documentElement.dataset.view==='research';
  const items=creator?creatorPresentation:research?researchPresentation:(dailyPresentation?.items||[]);
  const feature=items.find(item=>item.priority==='lead')||items[0];
  if(creator||research){
    const lines=(research?[['从灵感','，'],['走向实践','。']]:[['让观点','，'],['变成灵感','。']]).map(([text,punctuation])=>{
      const line=node('span','cover-title-line'),words=node('span','cover-title-words',text);
      words.append(node('span','cover-title-punctuation',punctuation));line.append(words);return line;
    });
    $('cover-heading').replaceChildren(...lines);
  }else $('cover-heading').replaceChildren(document.createTextNode('让好奇，'),document.createElement('br'),document.createTextNode('每天发生。'));
  $('cover-subtitle').textContent=creator?'A fresh perspective on what’s next.':research?'Ideas, tested in the real world.':'A daily dose of what’s next.';
  $('focus-topics').textContent=creator?'创作者 · 媒体 · 产品与实践':research?'产品案例 · 能力边界 · 工作方法':topics.join(' · ');
  $('cover-read-label').textContent=creator?'阅读观察':research?'开始研究':'阅读日报';
  for(const a of document.querySelectorAll('[data-current-reading]'))a.href=creator?'#creators':research?'#research':'#content';
  $('nav-read-label').textContent=creator?'阅读观察':research?'开始研究':'阅读本期';
  $('feature-track').hidden=!feature;
  if(feature){
    const visual=itemVisual(feature);
    $('feature-image').hidden=true;$('feature-panel').classList.add('identity-feature');
    $('feature-panel').style.backgroundColor=safeTone(visual.entities[0].tone);
    $('feature-identity').replaceChildren(identityContent(visual));
    $('feature-title').textContent=feature.title;$('feature-brief').textContent=feature.brief;
    $('feature-kicker').textContent=creator||research?`${feature.sourceName} / ${feature.category}`:`${feature.hotRank?'AIHOT 热点第 '+feature.hotRank+' 名':'本期头条'} / ${feature.category}`;
    $('feature-index').textContent=creator?'01 / CREATORS & MEDIA':research?'01 / PRODUCT RESEARCH':'01 / THE DAILY EDIT';
  }
  syncCoverImages(items);requestScrollPaint();
}
window.DailyPresentation={filterTopic,article:createStoryArticle,identityImage,updateCreators(items){creatorPresentation=items;if(document.documentElement.dataset.view==='creators')updatePresentation();},updateResearch(items){researchPresentation=items;if(document.documentElement.dataset.view==='research')updatePresentation();},refresh:updatePresentation};
for (const link of document.querySelectorAll('[data-topic]')) link.addEventListener('click',()=>filterTopic(link.dataset.topic));
// Keep the original drift; the spiral follows a path at constant travel speed.
const orbit=$('image-orbit');
const photos=Array.from({length:189},()=>{
  const photo=node('div','orbit-photo');orbit.append(photo);return photo;
});
orbit.hidden=true;
function syncCoverImages(items) {
  // Reuse the same story visuals and the existing path nodes. Updating an edition
  // must not reset elapsed time, pause state, transforms, or the scroll transition.
  orbit.hidden=!items.length;
  photos.forEach((photo,index)=>{
    const item=items[index%items.length];
    if(!item){photo.replaceChildren();delete photo.dataset.visual;delete photo.dataset.storyId;return;}
    const visual=itemVisual(item),key=JSON.stringify(visual);
    photo.dataset.storyId=`story-${item.id}`;
    if(photo.dataset.visual===key)return;
    photo.dataset.visual=key;
    photo.style.backgroundColor=safeTone(visual.entities[0].tone);
    const content=identityContent(visual);
    content.querySelectorAll('img').forEach(img=>{img.loading='eager';img.draggable=false;});
    photo.replaceChildren(content);
  });
}
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionQuery.matches, visible=true, phase=0, elapsed=0, previous=0, raf=0;
let width=innerWidth,height=$('landing').clientHeight||innerHeight;
let scrollVelocity=0,scrollBoost=0,lastScrollAt=0;
let preset='spiral';
try { const saved=localStorage.getItem('leo-daily-motion-preset'); if(['free','spiral'].includes(saved)) preset=saved; } catch {}
const BASE_SPEED=.055;
const SPIRAL_TURNS=8;
const TAU=2*Math.PI;
const SPIRAL_SAMPLES=4096;
// World-space spiral, calibrated against the 24-second Cosmos frame recording.
// The square canvas extends beyond the viewport: only part of the eight turns is visible.
function buildSpiral(viewWidth, viewHeight) {
  const cameraSize=viewWidth>1920?viewWidth/1920*2500:2500;
  const worldRadius=cameraSize*.75;
  const screenScale=Math.max(2000,viewWidth*1.2)/cameraSize;
  const points=[];
  let length=0;
  for(let i=0;i<=SPIRAL_SAMPLES;i++) {
    const u=i/SPIRAL_SAMPLES, angle=u*TAU*SPIRAL_TURNS;
    const radius=worldRadius*(1-u);
    const x=radius*Math.cos(angle), y=radius*Math.sin(angle);
    const dx=-worldRadius*Math.cos(angle)-radius*TAU*SPIRAL_TURNS*Math.sin(angle);
    const dy=-worldRadius*Math.sin(angle)+radius*TAU*SPIRAL_TURNS*Math.cos(angle);
    if(i)length+=Math.hypot(x-points[i-1].x,y-points[i-1].y);
    points.push({x,y,dx,dy,u,distance:length});
  }
  return {points,length,worldRadius,screenScale,duration:100/.32};
}
let spiral=buildSpiral(width,height);
function spiralPosition(seconds, path=spiral) {
  const progress=((seconds/path.duration)%1+1)%1;
  const distance=progress*path.length, points=path.points;
  let low=0,high=points.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(points[mid].distance<distance)low=mid;else high=mid;}
  const a=points[low],b=points[high];
  const t=(distance-a.distance)/(b.distance-a.distance);
  const mix=key=>a[key]+(b[key]-a[key])*t;
  const u=mix('u'),radiusFraction=Math.pow(1-u,1/.95);
  const spread=Math.pow(Math.max(1-u,0),1/.95-1);
  return {x:mix('x')*spread*path.screenScale,y:mix('y')*spread*path.screenScale,
    rotation:Math.atan2(mix('dy'),mix('dx'))*180/Math.PI,
    scale:path.screenScale*Math.pow(radiusFraction,.35),
    opacity:Math.min(1,progress/.08,(1-progress)/.08),u};
}
// Keep the approved frame sizes independent of the current edition's image order.
const frameRatios=[.75,1.4,.82,1.15,.68,1.5,1,.8,1.3,1,.72,1.45,1.12];
const frameAreas=[19111,18700,9632];
function sizePhotos() {
  photos.forEach((photo,i)=>{
    if(preset==='spiral') {
      const ratio=frameRatios[i%frameRatios.length];
      const h=Math.sqrt(frameAreas[i%frameAreas.length]/ratio);
      photo.style.width=`${h*ratio}px`;photo.style.height=`${h}px`;
    } else {photo.style.removeProperty('width');photo.style.removeProperty('height');}
  });
}
function paintOrbit() {
  orbit.dataset.preset=preset;
  const small=width<761;
  photos.forEach((photo,i)=>{
    photo.hidden=preset==='free' && i>=18;
    if(photo.hidden)return;
    if(preset==='spiral') {
      const p=spiralPosition(elapsed+(i/photos.length-.5)*spiral.duration);
      // Avoid compositing offscreen cards while keeping their position in the continuous path.
      const outside=Math.abs(p.x)>width/2+180||Math.abs(p.y)>height/2+180;
      photo.style.visibility=outside?'hidden':'visible';
      if(outside)return;
      photo.style.transform=`translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%) rotate(${p.rotation}deg) scale(${p.scale})`;
      photo.style.opacity=String(p.opacity);
    } else {
      photo.style.visibility='visible';
      const angle=i/18*Math.PI*2+phase;
      const band=i%2===0?1:1.22;
      const x=Math.cos(angle)*width*(small?.55:.43)*band;
      const y=Math.sin(angle)*height*.41*band;
      const depth=(Math.cos(angle+.7)+1)/2;
      const scale=.63+depth*.42;
      photo.style.transform=`translate3d(${x}px,${y}px,0) rotate(${Math.sin(angle*2+i)*24}deg) scale(${scale})`;
      photo.style.opacity=String(.28+depth*.69);
    }
  });
}
function setPreset(value) {
  if(!['free','spiral'].includes(value))return;
  preset=value;$('motion-preset').value=value;
  photos.forEach(photo=>photo.hidden=false);
  try {localStorage.setItem('leo-daily-motion-preset',value);} catch {}
  sizePhotos();paintOrbit();
}
$('motion-preset').value=preset;
$('motion-preset').addEventListener('change',event=>setPreset(event.target.value));
function animate(time) {
  raf=0;
  if (paused || !visible || document.hidden) {previous=0;return;}
  if(previous) {
    const dt=Math.min(time-previous,50)/1000;
    if(preset==='free')phase=(phase+dt*BASE_SPEED)%(2*Math.PI);
    else {
      // Cosmos accelerates in the same direction for either scroll direction.
      const target=performance.now()-lastScrollAt<100?scrollVelocity:0;
      scrollBoost+=(target-scrollBoost)*(1-Math.exp(-dt*8));
      elapsed=(elapsed+dt*(1+scrollBoost*8))%spiral.duration;
    }
  }
  previous=time;paintOrbit();raf=requestAnimationFrame(animate);
}
function startMotion() {if(!raf && !paused && visible && !document.hidden) raf=requestAnimationFrame(animate);}
function syncMotion() {
  const b=$('motion-toggle');b.textContent=paused?'▷ 开启动态':'Ⅱ 暂停动态';b.setAttribute('aria-pressed',String(paused));
  b.setAttribute('aria-label',paused?'开启封面图片动画':'暂停封面图片动画');
  if(paused && raf){cancelAnimationFrame(raf);raf=0;previous=0;} startMotion();
}
$('motion-toggle').addEventListener('click',()=>{paused=!paused;syncMotion();});
motionQuery.addEventListener('change',event=>{paused=event.matches;syncMotion();requestScrollPaint();});
new ResizeObserver(()=>{
  if(!$('landing').clientWidth||!$('landing').clientHeight)return;
  const progress=elapsed/spiral.duration;
  width=$('landing').clientWidth;height=$('landing').clientHeight||innerHeight;
  spiral=buildSpiral(width,height);elapsed=progress*spiral.duration;
  paintOrbit();
}).observe($('landing'));
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=0;startMotion();}).observe($('landing'));
document.addEventListener('visibilitychange',()=>{previous=0;startMotion();});
// Scroll position drives the transition in both directions. No wheel interception,
// one-shot reveal, or reset of the approved orbit when the reader returns to the cover.
const coverFlow=$('cover-flow'),coverCopy=document.querySelector('.cover-copy');
const coverBottom=document.querySelector('.cover-bottom'),featurePanel=$('feature-panel');
const featureCopy=document.querySelector('.feature-copy');
const clamp01=n=>Math.max(0,Math.min(1,n));
let scrollFrame=0,lastScrollY=scrollY,scrollMetrics={};
function measureScroll() {
  const vh=$('landing').clientHeight||innerHeight;
  const small=innerWidth<=760;
  const maxWidth=small?Math.min(innerWidth-32,(vh-120)*9/16):Math.min(1440,innerWidth-80,(vh-140)*4/3);
  scrollMetrics={vh,small,maxWidth,startWidth:Math.min(small?innerWidth*.64:600,maxWidth),
    expandDistance:Math.max(1,vh-(small?100:130)),flowTop:coverFlow.offsetTop};
}
function paintScroll() {
  scrollFrame=0;
  const {vh,small,maxWidth,startWidth,expandDistance,flowTop}=scrollMetrics;
  const y=Math.max(0,scrollY-flowTop),reduce=motionQuery.matches;
  const hasFeature=!$('feature-track').hidden;
  const progress=clamp01(y/expandDistance);
  // The reference headline shrinks to 85% and disappears within the first ~100px.
  const fade=reduce||!hasFeature?0:clamp01(y/Math.max(90,vh*.1));
  coverCopy.style.opacity=String(1-fade);
  coverCopy.style.scale=String(1-.15*fade);
  coverCopy.inert=fade>=.99;
  coverBottom.style.opacity=String(1-fade);
  coverBottom.inert=fade>=.99;
  orbit.style.opacity=String(reduce||!hasFeature?1:1-clamp01((y/vh-.325)/.195));
  const panelWidth=reduce?maxWidth:startWidth+(maxWidth-startWidth)*progress;
  featurePanel.style.width=`${panelWidth}px`;
  // Keep the headline legible in the smaller preview, then let the image lead the expansion.
  featurePanel.style.setProperty('--feature-title-size',`${small?26+8*progress:34+20*progress}px`);
  featurePanel.style.setProperty('--feature-padding',`${small?22:28+20*progress}px`);
  featureCopy.style.opacity=String(reduce?1:clamp01((progress-.08)/.32));
  document.body.classList.toggle('has-scrolled',y>24);
}
function requestScrollPaint(){if(!scrollFrame)scrollFrame=requestAnimationFrame(paintScroll);}
measureScroll();
window.addEventListener('scroll',()=>{
  const now=performance.now(),dt=Math.max(16,now-lastScrollAt);
  scrollVelocity=Math.min(2,Math.abs(scrollY-lastScrollY)/dt);
  lastScrollY=scrollY;lastScrollAt=now;requestScrollPaint();
},{passive:true});
window.addEventListener('resize',()=>{measureScroll();requestScrollPaint();},{passive:true});
window.addEventListener('pageshow',()=>{measureScroll();requestScrollPaint();});
window.addEventListener('daily:viewchange',()=>{updatePresentation();measureScroll();requestScrollPaint();});
// Anchor links still skip straight to useful content; compensate for the persistent header.
for(const anchor of document.querySelectorAll('a[href="#content"], a[href="#landing"]')) {
  anchor.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=$(anchor.hash.slice(1));if(!target)return;
    event.preventDefault();
    history.pushState(null,'',anchor.hash);
    if(anchor.hash==='#content')target.focus({preventScroll:true});
    const top=anchor.hash==='#landing'?0:target.getBoundingClientRect().top+scrollY-document.querySelector('.cover-nav').getBoundingClientRect().height-12;
    window.scrollTo({top,behavior:motionQuery.matches?'instant':'smooth'});
  });
}
requestScrollPaint();
sizePhotos();paintOrbit();syncMotion();
let liveTimer=0,liveBusy=false,liveNextCheck=0,editionSignature='';
const signature=data=>JSON.stringify([data.items,data.sources?.people,data.date]);
function applyLiveEdition(data) {
  const next=signature(data);if(next===editionSignature)return;
  const oldY=scrollY;
  const readingAnchor=[...document.querySelectorAll('#stories article:not([hidden])')].find(a=>{const r=a.getBoundingClientRect();return r.bottom>90&&r.top<innerHeight;});
  const anchor=readingAnchor?{id:readingAnchor.id,top:readingAnchor.getBoundingClientRect().top}:null;
  const focusId=document.activeElement?.id;
  render(data);editionSignature=next;
  const retained=anchor?document.getElementById(anchor.id):null;
  if(retained&&!retained.hidden)window.scrollBy({top:retained.getBoundingClientRect().top-anchor.top,behavior:'instant'});
  else window.scrollTo({top:oldY,behavior:'instant'});
  if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
}
function scheduleLiveCheck(){clearTimeout(liveTimer);if(!document.hidden)liveTimer=setTimeout(checkLive,Math.max(1000,liveNextCheck-Date.now()));}
async function checkLive(){
  if(liveBusy)return;
  if(Date.now()<liveNextCheck){scheduleLiveCheck();return;}
  liveBusy=true;
  try{
    const result=await readJSON('/api/live.json');
    if(!result.data?.items||!result.live)throw new Error('更新服务未返回内容');
    applyLiveEdition(result.data);
    liveNextCheck=Date.now()+300000;
    $('live-status').dataset.state=result.live.status;
    if(result.live.checkedAt && Date.now()-Date.parse(result.live.checkedAt)>3600000){result.live.status='error';result.live.message='更新延迟 · 显示上次资讯，最近成功检查 '+dateText(result.live.checkedAt);}
    $('live-status').textContent=['error','offline','disabled','refreshing'].includes(result.live.status)?result.live.message:`计划每 15 分钟同步 · 排队时可能延后${result.live.checkedAt?' · 已检查 '+dateText(result.live.checkedAt):''}`;
  }catch{
    liveNextCheck=Date.now()+300000;$('live-status').dataset.state='error';
    $('live-status').textContent='暂时无法连接更新服务，保留当前资讯，恢复连接后自动重试。';
  }finally{liveBusy=false;scheduleLiveCheck();}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(liveTimer);else checkLive();});
window.addEventListener('online',()=>{liveNextCheck=0;checkLive();});
window.addEventListener('pagehide',()=>clearTimeout(liveTimer));
window.addEventListener('pageshow',event=>{if(event.persisted)checkLive();});
async function start() {
  const [theme,data]=await Promise.allSettled([readJSON('/theme.json'),readJSON('/data.json')]);
  let themeError=false;
  try{if(theme.status==='fulfilled')applyTheme(theme.value);else themeError=true;}catch{themeError=true;}
  try{if(data.status==='rejected')throw data.reason;render(data.value);editionSignature=signature(data.value);if(themeError)$('notice').textContent+=' 外观设置暂时无法读取，已使用默认样式。';}
  catch(error){$('notice').classList.add('error');$('notice').textContent=`内容暂时无法显示：${error.message}。请让 Agent 检查 data.json，再刷新页面。`;$('date').textContent='等待内容修复';}
  checkLive();
}
start();
