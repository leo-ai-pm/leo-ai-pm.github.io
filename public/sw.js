// Online-only PWA: do not persist articles, API responses or login responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response(
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>需要联网</title><p>请连接网络后重新打开日报。外部原文也需要联网。</p><button onclick="location.reload()">重新加载</button></html>',
  {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
