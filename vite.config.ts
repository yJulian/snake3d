import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as never);
