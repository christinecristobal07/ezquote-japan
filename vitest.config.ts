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

/**
 * Placeholders, so the suite runs on a machine with no .env — a fresh clone,
 * and CI, which deliberately holds no Supabase credentials.
 *
 * src/lib/env.ts validates at module load and throws if the URL is missing, so
 * four UI test files failed on import alone before this. Nothing here reaches
 * a network: these only let the module load. A test that did try to call
 * Supabase would now fail against an obviously fake host rather than quietly
 * reaching the real project, which is the outcome worth having.
 */
const env = {
  VITE_SUPABASE_URL: 'https://test-placeholder.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_placeholder',
};

export default defineConfig({
  resolve: { alias },
  define,
  test: {
    env,
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
          env,
          name: 'domain',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/uat/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        define,
        test: {
          env,
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
    ],
  },
});
