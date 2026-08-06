import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, so the built site runs from a subdirectory or straight off the
  // filesystem — the release zip is opened by double-clicking index.html.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
