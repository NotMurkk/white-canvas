import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mapStorage } from '../../tools/vite-map-storage.ts';
import { repoFiles } from '../../tools/vite-repo-files.ts';

export default defineConfig({
  plugins: [react(), repoFiles(), mapStorage()],
});
