import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), architectDevApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1600 },
});
