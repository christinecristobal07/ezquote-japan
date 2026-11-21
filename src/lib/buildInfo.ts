/**
 * Which build the user is looking at.
 *
 * Pilot feedback arrives as "it did something odd this morning", and without a
 * stamp on the page there is no way to tell which deployment that was. The
 * values are injected by vite.config.ts: the version from package.json and the
 * short commit SHA, from CF_PAGES_COMMIT_SHA on Cloudflare Pages or from git
 * locally.
 */

export interface BuildInfo {
  readonly version: string;
  readonly sha: string;
  /** "v1.0.0-pilot · a1b2c3d" */
  readonly label: string;
}

export const buildInfo: BuildInfo = {
  version: __APP_VERSION__,
  sha: __BUILD_SHA__,
  label: `v${__APP_VERSION__} · ${__BUILD_SHA__}`,
};
