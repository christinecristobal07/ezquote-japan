import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

/**
 * The same build-time globals vite.config.ts injects. Each Vitest project is
 * its own Vite config and does not inherit these from the root, so they are
 * spread into both — otherwise anything importing src/lib/buildInfo.ts fails
 * with "__APP_VERSION__ is not defined".
 */
const define = {
  __APP_VERSION__: JSON.stringify(packageJson.version),
  __BUILD_SHA__: JSON.stringify('test'),
};

export default defineConfig({
  resolve: { alias },
  define,
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      exclude: ['src/domain/**/*.test.ts', 'src/domain/__fixtures__/**'],
      thresholds: { lines: 95, branches: 95, functions: 95 },
    },
    projects: [
      {
        resolve: { alias },
        define,
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/uat/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        define,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
    ],
  },
});
