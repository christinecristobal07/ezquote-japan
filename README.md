# EZQUOTE Japan

Quotation tool for Gladex Travel & Tours' Japan packages. React SPA on top of a
Supabase (Postgres) backend, where the database — not the browser — owns pricing
integrity.

- **Stack:** React 19, Vite 8, TypeScript 6 (strict), Tailwind CSS 4, Supabase JS 2
- **Node:** 22 or newer (enforced by `engines` in `package.json`)

## Setup

```bash
git clone <repo-url>
cd ezquote-japan
npm install
```

Create `.env` from the template and fill in both values. Ask the project owner
for them — `.env` is gitignored and never committed.

```bash
cp .env.example .env
```

| Variable                        | Where it comes from                                |
| ------------------------------- | -------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase dashboard → Project Settings → API        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page. The publishable key, never a secret key |

Only `VITE_`-prefixed variables reach the browser bundle. `src/lib/env.ts`
validates both at startup and **refuses to boot** if the key is a secret or
service-role key, so a mistake here fails loudly instead of silently shipping a
key that bypasses Row Level Security.

Then connect to Supabase. You need to be invited to the Supabase organisation
first; the project ref is the subdomain of your `VITE_SUPABASE_URL`.

```bash
npm run db:login                      # opens a browser, one time per machine
npx supabase link --project-ref <ref>
npm run db:types                      # regenerates src/data/database.types.ts
npm run dev                           # http://localhost:5173
```

The home page shows a Supabase connection badge. Green means your URL and key
reach the project; it pings `/auth/v1/health` rather than reading any table.

## Scripts

| Script             | Does                                                       |
| ------------------ | ---------------------------------------------------------- |
| `npm run dev`      | Vite dev server on port 5173 (strict — fails if taken)     |
| `npm run build`    | `tsc -b` then `vite build`                                 |
| `npm run preview`  | Serve the production build locally                         |
| `npm run check`    | **typecheck + lint + format check. Run before committing** |
| `npm run lint:fix` | ESLint with `--fix`                                        |
| `npm run format`   | Prettier write                                             |
| `npm run db:login` | Authenticate the Supabase CLI                              |
| `npm run db:link`  | `supabase link` — pass the ref: `npm run db:link -- <ref>` |
| `npm run db:types` | Regenerate `src/data/database.types.ts` from the remote DB |

## Layout

```
src/
  app/          App shell
  components/ui/  Shared presentational components
  data/         Supabase client, generated types, data access
  domain/       Business rules and pure calculation
  features/     Feature folders (components + hooks together)
  lib/          Cross-cutting utilities (env validation)
scripts/seed/   Seed scripts
supabase/migrations/  SQL migrations, applied in filename order
```

`@/` is aliased to `src/`, configured in both `tsconfig.app.json` and
`vite.config.ts` — keep them in sync if you change it.

`src/data/database.types.ts` is **generated**. Never edit it by hand; it is
excluded from ESLint and Prettier. Re-run `npm run db:types` after every
migration.

## Database

Schema, functions and RLS policies live in `supabase/migrations/`, split across
three files that must stay in timestamp order:

| File                                    | Contains                                      |
| --------------------------------------- | --------------------------------------------- |
| `20261120100000_core_schema.sql`        | Extensions, enums, 23 tables, indexes         |
| `20261120100100_functions_triggers.sql` | Role helpers, snapshot builder, guards, audit |
| `20261120100200_rls_policies.sql`       | Grants and Row Level Security on every table  |

Applying changes:

```bash
npx supabase db push --remote --dry-run   # always preview first
npx supabase db push --remote
npm run db:types
```

> The linked project is **production**. Never push a migration that has not been
> reviewed, and never edit a migration that has already been applied — add a new
> one instead.

### Design rules the schema enforces

These are enforced by triggers and policies, not by the UI. Fighting them in
application code means the database will reject the write.

- **Roles.** `super_admin`, `product_development`, `admin` are _managers_ and
  write reference data. `sales_supervisor` reads their team's quotations.
  `sales_agent` sees only their own. Signed-out callers get nothing.
- **Rates are versioned:** `draft → published → inactive`. Publishing locks a
  version permanently; a price change means a new version. Agents never see
  drafts. A version cannot be published without at least one group-size tier.
- **FX rates and markups are append-only.** A change inserts a new row, and the
  newest row that is in effect wins. There is no UPDATE or DELETE.
- **Quotations snapshot their own rates.** `app.build_rate_snapshot()` runs in a
  trigger when the quotation is created, so the browser cannot fake or alter
  pricing. A quotation may only reference services and add-ons present in its
  own snapshot. Agent, reference number and snapshot are immutable afterwards.
- **Change Rate entries cannot be edited or deleted.** To correct one, insert a
  reversal that exactly negates it; both rows stay in the log.
- **Profiles are separate from logins,** so agents can be imported before they
  have an account. On first sign-in a login is matched to a profile by email. An
  unrecognised email gets an _inactive_ profile for a manager to approve.
- **Every important change is written to `audit_log`** by trigger. Managers read
  it; nobody writes to it directly.

Helper functions live in the private `app` schema, which is not exposed through
the Data API. They are `SECURITY DEFINER` so RLS policies can call them without
recursing.

## Conventions

- Prettier (single quotes, semicolons, trailing commas, 100 cols) and ESLint are
  authoritative — `npm run check` must pass before you commit.
- Named exports; no default exports.
- `verbatimModuleSyntax` is on, so type-only imports need `import type`.
- Strict TypeScript, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Narrow values rather than casting.
- All files are LF, enforced by `.gitattributes`.
- Commits are numbered by setup step: `Step N: <summary>`.
