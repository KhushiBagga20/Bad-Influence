import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
  root: frontendRoot,
  envDir: repositoryRoot,
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    fs: { allow: [repositoryRoot] },
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } }
  }
});
