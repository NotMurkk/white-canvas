import { defineConfig } from 'vite';
import { repoFiles } from '../../tools/vite-repo-files.ts';

export default defineConfig({
  plugins: [repoFiles()],
});
