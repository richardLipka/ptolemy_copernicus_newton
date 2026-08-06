import { defineConfig } from 'vitest/config';

/**
 * One run across every workspace.
 *
 * The suites are pure computation on both sides of the split — the app's tests
 * exercise the store and the projection, not the DOM — so a single node
 * environment covers them and `npm test` at the root stays one command.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
});
