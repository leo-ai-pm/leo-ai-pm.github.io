// Opening or reloading an edition always starts at the cover. Run in <head>,
// before the browser resolves an old #content link against the initial layout.
history.scrollRestoration = 'manual';
const entryURL = new URL(location.href);
if(['creators','research'].includes(entryURL.searchParams.get('view')))document.documentElement.dataset.view=entryURL.searchParams.get('view');
entryURL.hash = ''; // No initial fragment jump; in-page links still work after load.
history.replaceState(history.state, '', entryURL.href);
const showCover = () => window.scrollTo({top:0,left:0,behavior:'instant'});
showCover();
// Some browsers restore the previous offset late in the initial load. Do not
// override a reader who has already started scrolling or using the navigation.
let entryInteracted = false;
for (const type of ['wheel','touchstart','pointerdown','keydown']) {
  window.addEventListener(type, () => {entryInteracted=true;}, {once:true,passive:true});
}
window.addEventListener('pageshow', event => {
  if (!event.persisted && !entryInteracted) showCover();
});
