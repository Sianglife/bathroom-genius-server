import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Read shared settings from the repository root, regardless of launch directory.
  // Only VITE_* variables are exposed to browser code by Vite.
  const env = loadEnv(mode, envDir, '');
  return {
    envDir,
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: env.APP_ORIGIN ? [new URL(env.APP_ORIGIN).hostname] : [],
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || '3000'}` },
      },
    },
  };
});
