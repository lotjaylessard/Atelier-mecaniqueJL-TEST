// pwa.js — register a minimal service worker (blob) and install prompt handling
if('serviceWorker' in navigator){
  const swCode = `self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim()); self.addEventListener('fetch', e => { /* simple offline */ });`;
  try{
    const blob = new Blob([swCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).then(()=>console.log('SW registered (blob)')).catch(e=>console.warn('SW failed', e));
  }catch(e){console.warn('SW error', e)}
}
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault();
  window.deferredPrompt = e;
  const btn = document.getElementById('btn-install');
  if(btn) btn.style.display = 'inline-flex';
});
document.getElementById('btn-install')?.addEventListener('click', async ()=>{
  const prompt = window.deferredPrompt;
  if(!prompt) return;
  prompt.prompt();
  window.deferredPrompt = null;
});
