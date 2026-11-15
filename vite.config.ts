import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/** Server-side settings the Architect function reads. None of them may ever be VITE_-prefixed. */
const ARCHITECT_ENV = ['ANTHROPIC_API_KEY', 'ARCHITECT_MODEL', 'ARCHITECT_EFFORT'] as const;

/**
 * Dev only: serves api/architect.ts at /api/architect, so `npm run dev` exercises the
 * same handler Vercel runs, without the Vercel CLI. The key is read from .env.local
 * into this Node process and never reaches the bundle: nothing here touches `define`
 * or `import.meta.env`. `apply: 'serve'` keeps the plugin out of production builds.
 */
function architectDevApi(): Plugin {
  return {
    name: 'memoria-architect-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir || server.config.root, '');
      for (const name of ARCHITECT_ENV) {
        if (env[name] && !process.env[name]) process.env[name] = env[name];
      }
      server.middlewares.use('/api/architect', (req, res) => {
        // Loaded per request through Vite, so edits to the handler apply without a restart.
        server
          .ssrLoadModule('/api/architect.ts')
          .then((mod) => (mod.default as (rq: typeof req, rs: typeof res) => Promise<void>)(req, res))
          .catch(() => {
            if (res.writableEnded) return;
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'dev_handler_failed', message: 'The dev Architect handler crashed.' }));
          });
      });
    },
  };
}

/**
 * Files the offline worker saves when they are first fetched instead of at install: PDF.js and
 * its worker (about 1.9 MB, needed only once a PDF is chosen), and the .woff copies of fonts
 * that every browser with service workers loads as .woff2.
 */
const SAVED_ON_FIRST_USE = /^assets\/(?:pdf(?:\.worker)?\.min-[^/]+\.mjs|[^/]+\.woff)$/;

/**
 * Build only: writes /sw.js, the offline worker (src/sw.js), with the list of the files this
 * build emitted and a stamp of the build in front of it. `enforce: 'post'` so that the bundle
 * already holds index.html and every chunk and asset when the list is taken.
 */
function offlineWorker(): Plugin {
  return {
    name: 'memoria-offline-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') this.error('offline worker: index.html is not in the bundle, so /sw.js cannot be written.');
      const html = typeof page.source === 'string' ? page.source : Buffer.from(page.source).toString('utf8');
      const files = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/'))
        .sort();
      const urls = (onFirstUse: boolean) => files.filter((name) => SAVED_ON_FIRST_USE.test(name) === onFirstUse).map((name) => `/${name}`);
      const worker = readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8');
      // The names of hashed files change with their content, so names, page and worker are the build.
      const version = createHash('sha256').update(JSON.stringify([files, html, worker])).digest('hex').slice(0, 12);
      const head = [
        `const VERSION = ${JSON.stringify(version)};`,
        `const PAGE = ${JSON.stringify(html)};`,
        `const PRECACHE = ${JSON.stringify(urls(false))};`,
        `const LAZY = ${JSON.stringify(urls(true))};`,
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `${head}\n${worker}` });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), architectDevApi(), offlineWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1600 },
});
