import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource-variable/eb-garamond/wght.css';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * The offline copy (src/sw.js, written to /sw.js by the build): once the site has been opened
 * with a network, a reload without one still shows the app. Registered by production builds
 * only, so that the dev server is never answered from a cache.
 *   ?nosw          removes the worker and everything it saved: the way out for a stuck laptop
 *   ?shot, ?rail   no worker is registered: captures stay free of background downloads
 * Whatever goes wrong here is swallowed. The app does not need the worker to run.
 */
function offlineCopy(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('nosw')) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((found) => Promise.all(found.map((registration) => registration.unregister())))
        .then(() => caches.keys())
        .then((names) => Promise.all(names.filter((name) => name.startsWith('memoria-')).map((name) => caches.delete(name))))
        .catch(() => {});
      return;
    }
    if (!import.meta.env.PROD || params.has('shot') || params.has('rail')) return;
    // 'none': the browser asks the server for /sw.js itself every time, whatever its cache headers say.
    const register = () =>
      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        // A worker that outlived its cache (?nosw, then straight back) saves its files again: see src/sw.js.
        .then((registration) => registration.active?.postMessage('restore'))
        .catch(() => {});
    // After load, so that the worker's downloads never compete with the first render.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } catch {
    // A browser that forbids service workers here (a sandboxed frame, a private window).
  }
}
offlineCopy();
