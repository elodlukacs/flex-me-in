import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Where `/api` is proxied in dev. Override to point at a mock server. */
const apiTarget = process.env.FE_HUNT_API_TARGET ?? 'http://127.0.0.1:8787';

/**
 * public/sw.js is hand-written and copied as is; after the build this stamps
 * the build id (so every deploy installs a new worker and shows the update
 * toast) and the hashed asset list (so the app shell is precached).
 */
function stampServiceWorker(): Plugin {
  let config: ResolvedConfig;
  const assets: string[] = [];
  return {
    name: 'fe-hunt:stamp-sw',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/\.(js|css|woff2?)$/.test(fileName)) assets.push(`/${fileName}`);
      }
    },
    closeBundle() {
      const swPath = resolve(config.root, config.build.outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      assets.sort();
      const build = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 10);
      const source = readFileSync(swPath, 'utf8')
        .replace(/\/\*BUILD\*\/'[^']*'/, `'${build}'`)
        .replace(/\/\*ASSETS\*\/\[[^\]]*\]/, JSON.stringify(assets));
      writeFileSync(swPath, source);
    },
  };
}

export default defineConfig({
  root,
  plugins: [react(), stampServiceWorker()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
