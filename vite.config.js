import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    rollupOptions: {
      input: {
        home: path.join(projectRoot, 'index.html'),
        editor: path.join(projectRoot, 'editor.html')
      }
    }
  },
  plugins: [{
    name: 'copy-editor-runtime',
    async closeBundle() {
      const output = path.join(projectRoot, 'dist');
      await mkdir(output, { recursive: true });
      await Promise.all([
        cp(path.join(projectRoot, 'assets'), path.join(output, 'assets'), { recursive: true, force: true }),
        cp(path.join(projectRoot, 'components'), path.join(output, 'components'), { recursive: true, force: true }),
        cp(path.join(projectRoot, 'painel-studio.js'), path.join(output, 'painel-studio.js'), { force: true })
      ]);
    }
  }]
});
