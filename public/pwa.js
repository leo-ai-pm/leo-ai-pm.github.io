(() => {
 const install=document.getElementById('install-app'),help=document.getElementById('install-help');
 let deferred;
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 help.textContent=standalone?'已从主屏幕打开。':'iPhone：Safari 分享 → 添加到主屏幕。Android：浏览器菜单 → 安装应用或添加到主屏幕。';
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;install.hidden=!!standalone;});
 addEventListener('appinstalled',()=>{install.hidden=true;deferred=null;});
 install.addEventListener('click',async()=>{if(!deferred)return;const prompt=deferred;deferred=null;install.hidden=true;await prompt.prompt();});
 if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
