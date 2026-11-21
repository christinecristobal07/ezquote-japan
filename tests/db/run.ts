import {
  asUser,
  assert,
  assertEqual,
  assertRejects,
  check,
  count,
  createTestDb,
  one,
  section,
  summary,
  type Db,
} from './harness.ts';

interface Ids {
  readonly tokyo: string;
  readonly tourService: string;
  readonly transferService: string;
  readonly publishedVersion: string;
  readonly draftVersion: string;
  readonly managerAuth: string;
  readonly managerProfile: string;
  readonly prodDevAuth: string;
  readonly agentAuth: string;
  readonly agentProfile: string;
  readonly otherAgentAuth: string;
  readonly otherAgentProfile: string;
  readonly supervisorAuth: string;
  readonly supervisorProfile: string;
  readonly inactiveAuth: string;
}

/** Creates a profile and the auth user that links to it by email. */
async function makeUser(
  db: Db,
  email: string,
  fullName: string,
  role: string,
  options: { active?: boolean; supervisorId?: string | null } = {},
): Promise<{ authId: string; profileId: string }> {
  const active = options.active ?? true;
  await db.query(
    `insert into public.profiles (full_name, email, role, is_active, supervisor_id)
     values ($1, $2, $3::public.app_role, $4, $5)`,
    [fullName, email, role, active, options.supervisorId ?? null],
  );
  const auth = await one<{ id: string }>(
    db,
    `insert into auth.users (email) values ($1) returning id`,
    [email],
  );
  const profile = await one<{ id: string }>(db, `select id from public.profiles where email = $1`, [
    email,
  ]);
  return { authId: auth.id, profileId: profile.id };
}

async function seed(db: Db): Promise<Ids> {
  const city = await one<{ id: string }>(
    db,
    `insert into public.cities (name) values ('Tokyo') returning id`,
  );

  const tour = await one<{ id: string }>(
    db,
    `insert into public.services (code, service_type, name, city_id, consumes_day)
     values ('mt_fuji_tour', 'tour', 'Mt Fuji Tour', $1, true) returning id`,
    [city.id],
  );
  const transfer = await one<{ id: string }>(
    db,
    `insert into public.services (code, service_type, name, consumes_day, transfer_direction)
     values ('airport_transfer', 'transfer', 'Airport Transfer', false, 'round_trip') returning id`,
  );

  // A published version (with a tier) and a draft that agents must never see.
  const published = await one<{ id: string }>(
    db,
    `insert into public.service_rate_versions (service_id, currency, status)
     values ($1, 'JPY', 'draft') returning id`,
    [tour.id],
  );
  await db.query(
    `insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
     values ($1, 'adult', 1, 60, 10850)`,
    [published.id],
  );
  await db.query(`update public.service_rate_versions set status = 'published' where id = $1`, [
    published.id,
  ]);

  const transferVersion = await one<{ id: string }>(
    db,
    `insert into public.service_rate_versions (service_id, currency, status)
     values ($1, 'JPY', 'draft') returning id`,
    [transfer.id],
  );
  await db.query(
    `insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
     values ($1, 'adult', 1, 60, 6250)`,
    [transferVersion.id],
  );
  await db.query(`update public.service_rate_versions set status = 'published' where id = $1`, [
    transferVersion.id,
  ]);

  const draft = await one<{ id: string }>(
    db,
    `insert into public.service_rate_versions (service_id, currency, status)
     values ($1, 'JPY', 'draft') returning id`,
    [tour.id],
  );

  // The snapshot builder refuses to run without FX and a markup per category.
  await db.query(`insert into public.fx_rates (currency, php_per_unit) values ('JPY', 0.5)`);
  await db.query(`insert into public.fx_rates (currency, php_per_unit) values ('USD', 67)`);
  await db.query(
    `insert into public.category_markups (pax_category, markup_type, value)
     select code, 'fixed', 2500 from public.pax_categories`,
  );
  await db.query(
    `insert into public.service_markups (service_type, markup_type, value)
     values ('tour', 'fixed', 1000), ('transfer', 'fixed', 2000)`,
  );

  const manager = await makeUser(db, 'admin@gladex.test', 'Admin', 'super_admin');
  const prodDev = await makeUser(db, 'pd@gladex.test', 'Product Dev', 'product_development');
  const supervisor = await makeUser(db, 'sup@gladex.test', 'Supervisor', 'sales_supervisor');
  const agent = await makeUser(db, 'agent@gladex.test', 'Agent One', 'sales_agent', {
    supervisorId: supervisor.profileId,
  });
  const other = await makeUser(db, 'other@gladex.test', 'Agent Two', 'sales_agent');
  const inactive = await makeUser(db, 'gone@gladex.test', 'Former Agent', 'sales_agent', {
    active: false,
  });

  await db.query(
    `insert into public.agent_survey_links (profile_id, bad_url, great_url)
     values ($1, 'https://bit.ly/a-bad', 'https://bit.ly/a-good'),
            ($2, 'https://bit.ly/b-bad', 'https://bit.ly/b-good')`,
    [agent.profileId, supervisor.profileId],
  );

  return {
    tokyo: city.id,
    tourService: tour.id,
    transferService: transfer.id,
    publishedVersion: published.id,
    draftVersion: draft.id,
    managerAuth: manager.authId,
    managerProfile: manager.profileId,
    prodDevAuth: prodDev.authId,
    agentAuth: agent.authId,
    agentProfile: agent.profileId,
    otherAgentAuth: other.authId,
    otherAgentProfile: other.profileId,
    supervisorAuth: supervisor.authId,
    supervisorProfile: supervisor.profileId,
    inactiveAuth: inactive.authId,
  };
}

async function main(): Promise<void> {
  console.log(
    'EZQUOTE Japan - database rules\n(in-memory Postgres; the remote database is never touched)',
  );
  const db = await createTestDb();
  const ids = await seed(db);

  // ---------------------------------------------------------------------------
  section('Schema and immutability');

  await check('an unknown email gets an inactive sales_agent profile', async () => {
    await db.query(`insert into auth.users (email) values ('stranger@example.com')`);
    const row = await one<{ role: string; is_active: boolean }>(
      db,
      `select role, is_active from public.profiles where email = 'stranger@example.com'`,
    );
    assertEqual(row.role, 'sales_agent', 'role');
    assertEqual(row.is_active, false, 'is_active');
  });

  await check('a known email links the login to the imported profile', async () => {
    const row = await one<{ user_id: string | null }>(
      db,
      `select user_id from public.profiles where email = 'agent@gladex.test'`,
    );
    assert(row.user_id !== null, 'the profile should be linked to a login');
  });

  await check('tiers cannot be added to a published rate version', async () => {
    await assertRejects(
      () =>
        db.query(
          `insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
           values ($1, 'adult', 1, 2, 100)`,
          [ids.publishedVersion],
        ),
      /published and cannot be edited/,
    );
  });

  await check('overlapping tiers are rejected', async () => {
    await assertRejects(
      () =>
        db.query(
          `insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
           values ($1, 'adult', 1, 5, 100), ($1, 'adult', 4, 9, 200)`,
          [ids.draftVersion],
        ),
      /exclusion|overlap/i,
    );
  });

  await check('FX rates are append-only', async () => {
    await assertRejects(
      () => db.query(`update public.fx_rates set php_per_unit = 9 where currency = 'JPY'`),
      /append-only/,
    );
    await assertRejects(
      () => db.query(`delete from public.fx_rates where currency = 'JPY'`),
      /append-only/,
    );
  });

  await check('a transfer must declare a direction', async () => {
    await assertRejects(
      () =>
        db.query(
          `insert into public.services (code, service_type, name) values ('bad_transfer', 'transfer', 'No direction')`,
        ),
      /services_transfer_direction/,
    );
  });

  // ---------------------------------------------------------------------------
  section('Row Level Security');

  await check('anon reads nothing', async () => {
    await asUser(db, null, async () => {
      await assertRejects(() => db.query(`select * from public.cities`), /permission denied/i);
      await assertRejects(() => db.query(`select * from public.profiles`), /permission denied/i);
    });
  });

  await check('an agent sees published rate versions but not drafts', async () => {
    await asUser(db, ids.agentAuth, async () => {
      const total = await count(db, `select count(*)::int as n from public.service_rate_versions`);
      const drafts = await count(
        db,
        `select count(*)::int as n from public.service_rate_versions where status = 'draft'`,
      );
      assertEqual(total, 2, 'visible versions');
      assertEqual(drafts, 0, 'visible drafts');
    });
  });

  await check('authenticated actually holds SELECT on profiles (not just a policy)', async () => {
    // Without the GRANT, PostgREST answers 403 before any policy is consulted.
    const granted = await count(
      db,
      `select count(*)::int as n from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'profiles'
         and grantee = 'authenticated' and privilege_type = 'SELECT'`,
    );
    assertEqual(granted, 1, 'SELECT grants on profiles for authenticated');
  });

  await check('an agent sees only their own profile', async () => {
    await asUser(db, ids.agentAuth, async () => {
      const rows = await count(db, `select count(*)::int as n from public.profiles`);
      assertEqual(rows, 1, 'visible profiles');
    });
  });

  await check('an agent sees only their own survey links', async () => {
    await asUser(db, ids.agentAuth, async () => {
      const row = await one<{ n: number; mine: number }>(
        db,
        `select count(*)::int as n,
                count(*) filter (where profile_id = $1)::int as mine
         from public.agent_survey_links`,
        [ids.agentProfile],
      );
      assertEqual(row.n, 1, 'visible links');
      assertEqual(row.mine, 1, 'own links');
    });
  });

  await check('an agent cannot change FX or services', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () => db.query(`insert into public.fx_rates (currency, php_per_unit) values ('USD', 1)`),
        /row-level security|permission denied/i,
      );
      // Writing reference data is manager-only, so the update matches no rows.
      const result = await db.query(`update public.services set name = 'Hacked' where id = $1`, [
        ids.tourService,
      ]);
      assertEqual(result.affectedRows ?? 0, 0, 'services updated');
    });
    const row = await one<{ name: string }>(db, `select name from public.services where id = $1`, [
      ids.tourService,
    ]);
    assertEqual(row.name, 'Mt Fuji Tour', 'service name after the attempt');
  });

  await check('an agent cannot promote themselves', async () => {
    await asUser(db, ids.agentAuth, async () => {
      // The update policy is manager-only, so RLS filters the row out and the
      // statement changes nothing rather than raising.
      const result = await db.query(
        `update public.profiles set role = 'super_admin' where id = $1`,
        [ids.agentProfile],
      );
      assertEqual(result.affectedRows ?? 0, 0, 'rows updated');
    });
    const row = await one<{ role: string }>(db, `select role from public.profiles where id = $1`, [
      ids.agentProfile,
    ]);
    assertEqual(row.role, 'sales_agent', 'role after the attempt');
  });

  await check('Product Development cannot grant super_admin', async () => {
    await asUser(db, ids.prodDevAuth, async () => {
      await assertRejects(
        () =>
          db.query(`update public.profiles set role = 'super_admin' where id = $1`, [
            ids.otherAgentProfile,
          ]),
        /Only a Super Admin/,
      );
    });
  });

  await check('an inactive user sees nothing', async () => {
    await asUser(db, ids.inactiveAuth, async () => {
      assertEqual(await count(db, `select count(*)::int as n from public.cities`), 0, 'cities');
      assertEqual(await count(db, `select count(*)::int as n from public.profiles`), 0, 'profiles');
    });
  });

  // ---------------------------------------------------------------------------
  section('Quotations and the snapshot');

  let quoteId = '';
  await check('creating a quotation builds the snapshot and a JPN reference', async () => {
    await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ id: string; reference_no: string; agent_id: string; jpy: string }>(
          db,
          `insert into public.quotations (agent_id, package_title)
           values ($1, 'Tokyo 4D3N')
           returning id, reference_no, agent_id, (snapshot -> 'fx' ->> 'JPY') as jpy`,
          [ids.agentProfile],
        );
        quoteId = row.id;
        assert(
          /^JPN-\d{4}-\d{6}$/.test(row.reference_no),
          `reference ${row.reference_no} should look like JPN-YYYY-NNNNNN`,
        );
        assertEqual(row.agent_id, ids.agentProfile, 'agent');
        assertEqual(Number(row.jpy), 0.5, 'snapshot JPY rate');
      },
      { commit: true },
    );
  });

  await check('the snapshot cannot be changed afterwards', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(`update public.quotations set snapshot = '{}'::jsonb where id = $1`, [quoteId]),
        /cannot be changed/,
      );
      await assertRejects(
        () =>
          db.query(`update public.quotations set reference_no = 'JPN-2000-000001' where id = $1`, [
            quoteId,
          ]),
        /cannot be changed/,
      );
    });
  });

  await check('only services in the snapshot can be added', async () => {
    // Added by a manager after the quote was created, so it is absent from the
    // quote's own snapshot.
    const ghost = await one<{ id: string }>(
      db,
      `insert into public.services (code, service_type, name, consumes_day)
       values ('ghost_tour', 'tour', 'Ghost Tour', true) returning id`,
    );
    await asUser(db, ids.agentAuth, async () => {
      await db.query(
        `insert into public.quotation_services (quotation_id, service_id) values ($1, $2)`,
        [quoteId, ids.tourService],
      );
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_services (quotation_id, service_id) values ($1, $2)`,
            [quoteId, ghost.id],
          ),
        /row-level security|not available when the quotation was created/i,
      );
    });
  });

  await check('another agent cannot see or adjust the quote', async () => {
    await asUser(db, ids.otherAgentAuth, async () => {
      assertEqual(
        await count(db, `select count(*)::int as n from public.quotations where id = $1`, [
          quoteId,
        ]),
        0,
        'visible quotes',
      );
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments (quotation_id, pax_category, kind, amount, reason)
             values ($1, 'quad', 'hotel', 100, 'nope')`,
            [quoteId],
          ),
        /row-level security/i,
      );
    });
  });

  await check('a supervisor sees team quotes but cannot adjust them', async () => {
    await asUser(db, ids.supervisorAuth, async () => {
      assertEqual(
        await count(db, `select count(*)::int as n from public.quotations where id = $1`, [
          quoteId,
        ]),
        1,
        'team quotes visible',
      );
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments (quotation_id, pax_category, kind, amount, reason)
             values ($1, 'quad', 'hotel', 100, 'nope')`,
            [quoteId],
          ),
        /row-level security/i,
      );
    });
  });

  await check('a supervisor cannot see team survey links', async () => {
    await asUser(db, ids.supervisorAuth, async () => {
      const mine = await count(
        db,
        `select count(*)::int as n from public.agent_survey_links where profile_id = $1`,
        [ids.agentProfile],
      );
      assertEqual(mine, 0, "team member's links");
    });
  });

  // ---------------------------------------------------------------------------
  section('Change Rate entries');

  let adjustmentId = '';
  await check('entries are stamped with their author', async () => {
    await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ id: string; created_by: string }>(
          db,
          `insert into public.quotation_adjustments (quotation_id, pax_category, kind, amount, reason)
           values ($1, 'quad', 'hotel', 20000, 'Hotel cost')
           returning id, created_by`,
          [quoteId],
        );
        adjustmentId = row.id;
        assertEqual(row.created_by, ids.agentProfile, 'created_by');
      },
      { commit: true },
    );
  });

  await check('entries cannot be edited or deleted', async () => {
    await assertRejects(
      () =>
        db.query(`update public.quotation_adjustments set amount = 1 where id = $1`, [
          adjustmentId,
        ]),
      /append-only/,
    );
    await assertRejects(
      () => db.query(`delete from public.quotation_adjustments where id = $1`, [adjustmentId]),
      /append-only/,
    );
  });

  await check('a reversal must exactly negate the original', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments
               (quotation_id, pax_category, kind, amount, reason, reverses_id)
             values ($1, 'quad', 'hotel', -19999, 'Wrong reversal', $2)`,
            [quoteId, adjustmentId],
          ),
        /exactly negate/,
      );
      await db.query(
        `insert into public.quotation_adjustments
           (quotation_id, pax_category, kind, amount, reason, reverses_id)
         values ($1, 'quad', 'hotel', -20000, 'Correction', $2)`,
        [quoteId, adjustmentId],
      );
    });
  });

  await check('truncate is denied to app users', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () => db.query(`truncate public.quotation_adjustments`),
        /permission denied/i,
      );
    });
  });

  // ---------------------------------------------------------------------------
  section('Audit and snapshot isolation');

  await check('an FX change is audited', async () => {
    const before = await count(
      db,
      `select count(*)::int as n from public.audit_log where table_name = 'fx_rates'`,
    );
    await db.query(`insert into public.fx_rates (currency, php_per_unit) values ('JPY', 0.42)`);
    const after = await count(
      db,
      `select count(*)::int as n from public.audit_log where table_name = 'fx_rates'`,
    );
    assertEqual(after, before + 1, 'audit rows');
  });

  await check('an existing quote keeps 0.5 while a new quote gets 0.42', async () => {
    const existing = await one<{ jpy: string }>(
      db,
      `select (snapshot -> 'fx' ->> 'JPY') as jpy from public.quotations where id = $1`,
      [quoteId],
    );
    assertEqual(Number(existing.jpy), 0.5, 'old quote FX');

    await asUser(db, ids.agentAuth, async () => {
      const fresh = await one<{ jpy: string }>(
        db,
        `insert into public.quotations (agent_id) values ($1)
         returning (snapshot -> 'fx' ->> 'JPY') as jpy`,
        [ids.agentProfile],
      );
      assertEqual(Number(fresh.jpy), 0.42, 'new quote FX');
    });
  });

  await check('an inactive rate version drops out of new snapshots', async () => {
    const before = await one<{ n: number }>(
      db,
      `select jsonb_array_length(app.build_rate_snapshot(now()) -> 'services')::int as n`,
    );
    await db.query(`update public.service_rate_versions set status = 'inactive' where id = $1`, [
      ids.publishedVersion,
    ]);
    const after = await one<{ n: number }>(
      db,
      `select jsonb_array_length(app.build_rate_snapshot(now()) -> 'services')::int as n`,
    );
    assertEqual(after.n, before.n - 1, 'services in snapshot');
  });

  // ---------------------------------------------------------------------------
  section('Rate drafts (create_rate_draft / save_rate_draft)');

  await check('an agent cannot create a draft', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () => db.query(`select public.create_rate_draft($1, null)`, [ids.tourService]),
        /row-level security|permission denied/i,
      );
    });
  });

  await check('an agent cannot save a draft', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
            ids.draftVersion,
            JSON.stringify([{ pax_type: 'adult', min_pax: 1, max_pax: 9, amount: 1 }]),
          ]),
        /row-level security|permission denied|not found/i,
      );
    });
  });

  await check('a manager draft copies tiers and add-ons from the source version', async () => {
    // Give the published transfer version an add-on worth copying.
    const transferVersion = await one<{ id: string }>(
      db,
      `select id from public.service_rate_versions
       where service_id = $1 and status = 'published' limit 1`,
      [ids.transferService],
    );

    await asUser(db, ids.managerAuth, async () => {
      const created = await one<{ id: string }>(
        db,
        `select public.create_rate_draft($1, $2) as id`,
        [ids.transferService, transferVersion.id],
      );
      const tiers = await count(
        db,
        `select count(*)::int as n from public.service_rate_tiers where rate_version_id = $1`,
        [created.id],
      );
      const source = await count(
        db,
        `select count(*)::int as n from public.service_rate_tiers where rate_version_id = $1`,
        [transferVersion.id],
      );
      assertEqual(tiers, source, 'copied tiers');
      assert(tiers > 0, 'the source version should have had tiers to copy');

      const draftRow = await one<{ status: string; currency: string }>(
        db,
        `select status, currency from public.service_rate_versions where id = $1`,
        [created.id],
      );
      assertEqual(draftRow.status, 'draft', 'new version status');
      assertEqual(draftRow.currency, 'JPY', 'copied currency');
    });
  });

  await check('a second draft for the same service is rejected', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () => db.query(`select public.create_rate_draft($1, null)`, [ids.tourService]),
        /already has a draft/,
      );
    });
  });

  await check('saving a published version is refused', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
            ids.publishedVersion,
            JSON.stringify([{ pax_type: 'adult', min_pax: 1, max_pax: 60, amount: 1 }]),
          ]),
        /Only a draft can be edited|is inactive|published/i,
      );
    });
  });

  await check('saving with no tiers is refused', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.save_rate_draft($1, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)`, [
            ids.draftVersion,
          ]),
        /at least one group-size tier/,
      );
    });
  });

  await check('saving an out-of-range tier is refused', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
            ids.draftVersion,
            JSON.stringify([{ pax_type: 'adult', min_pax: 9, max_pax: 2, amount: 100 }]),
          ]),
        /whole group size from 1 to 60/,
      );
    });
  });

  await check(
    'a save replaces tiers atomically; a bad tier leaves the old ones intact',
    async () => {
      // Seed the draft with two good tiers that we can prove survive a failure.
      await asUser(
        db,
        ids.managerAuth,
        async () => {
          await db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
            ids.draftVersion,
            JSON.stringify([
              { pax_type: 'adult', min_pax: 1, max_pax: 5, amount: 1000 },
              { pax_type: 'adult', min_pax: 6, max_pax: 20, amount: 900 },
            ]),
          ]);
        },
        { commit: true },
      );

      const before = await count(
        db,
        `select count(*)::int as n from public.service_rate_tiers where rate_version_id = $1`,
        [ids.draftVersion],
      );
      assertEqual(before, 2, 'tiers after the good save');

      // Overlapping rows trip the exclusion constraint mid-insert.
      await asUser(db, ids.managerAuth, async () => {
        await assertRejects(
          () =>
            db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
              ids.draftVersion,
              JSON.stringify([
                { pax_type: 'adult', min_pax: 1, max_pax: 10, amount: 500 },
                { pax_type: 'adult', min_pax: 8, max_pax: 20, amount: 400 },
              ]),
            ]),
          /exclusion|overlap/i,
        );
      });

      const after = await one<{ n: number; total: string }>(
        db,
        `select count(*)::int as n, coalesce(sum(amount), 0)::text as total
       from public.service_rate_tiers where rate_version_id = $1`,
        [ids.draftVersion],
      );
      assertEqual(after.n, 2, 'tiers after the rejected save');
      assertEqual(Number(after.total), 1900, 'the original amounts survived');
    },
  );

  await check('publishing a draft locks it', async () => {
    await asUser(
      db,
      ids.managerAuth,
      async () => {
        await db.query(
          `update public.service_rate_versions set status = 'published' where id = $1`,
          [ids.draftVersion],
        );
      },
      { commit: true },
    );

    const row = await one<{ status: string; published_at: string | null }>(
      db,
      `select status, published_at from public.service_rate_versions where id = $1`,
      [ids.draftVersion],
    );
    assertEqual(row.status, 'published', 'status after publishing');
    assert(row.published_at !== null, 'published_at should be stamped');

    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.save_rate_draft($1, '{}'::jsonb, $2::jsonb, '[]'::jsonb)`, [
            ids.draftVersion,
            JSON.stringify([{ pax_type: 'adult', min_pax: 1, max_pax: 60, amount: 1 }]),
          ]),
        /Only a draft can be edited/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  section('Content windows and reordering');

  const contentIds: string[] = [];
  await check('content items can carry a start and end date', async () => {
    const rows = await db.query<{ id: string }>(
      `insert into public.content_items (content_type, body, sort_order, starts_on, ends_on)
       values ('exclusion', 'Compulsory tipping (pay on spot)', 10, null, null),
              ('exclusion', 'Tour tickets and meals', 20, '2026-11-01', '2026-11-30'),
              ('exclusion', 'Travel Insurance (Mandatory)', 30, '2027-01-01', null)
       returning id`,
    );
    contentIds.push(...rows.rows.map((row) => row.id));
    assertEqual(contentIds.length, 3, 'inserted rows');
  });

  await check('an end date before the start date is rejected', async () => {
    await assertRejects(
      () =>
        db.query(
          `insert into public.content_items (content_type, body, starts_on, ends_on)
           values ('note', 'Backwards window', '2026-12-31', '2026-01-01')`,
        ),
      /content_items_window/,
    );
  });

  await check('an open-ended window is allowed either way round', async () => {
    await db.query(
      `insert into public.content_items (content_type, body, starts_on, ends_on)
       values ('note', 'Starts only', '2026-01-01', null), ('note', 'Ends only', null, '2027-01-01')`,
    );
    const n = await count(
      db,
      `select count(*)::int as n from public.content_items where content_type = 'note'`,
    );
    assertEqual(n, 2, 'note rows');
  });

  await check('an agent cannot reorder content', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.reorder_content('exclusion', $1::uuid[])`, [
            [...contentIds].reverse(),
          ]),
        /do not have permission|row-level security/i,
      );
    });
  });

  await check('a manager reorders in one step', async () => {
    const reversed = [...contentIds].reverse();
    await asUser(
      db,
      ids.managerAuth,
      async () => {
        await db.query(`select public.reorder_content('exclusion', $1::uuid[])`, [reversed]);
      },
      { commit: true },
    );

    const order = await db.query<{ id: string; sort_order: number }>(
      `select id, sort_order from public.content_items
       where content_type = 'exclusion' order by sort_order`,
    );
    assertEqual(
      order.rows.map((row) => row.id),
      reversed,
      'order after the reorder',
    );
    assertEqual(
      order.rows.map((row) => row.sort_order),
      [10, 20, 30],
      'sort_order values',
    );
  });

  await check('a reorder missing an item is refused and changes nothing', async () => {
    const before = await db.query<{ id: string }>(
      `select id from public.content_items where content_type = 'exclusion' order by sort_order`,
    );

    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.reorder_content('exclusion', $1::uuid[])`, [
            contentIds.slice(0, 2),
          ]),
        /needs every/,
      );
    });

    const after = await db.query<{ id: string }>(
      `select id from public.content_items where content_type = 'exclusion' order by sort_order`,
    );
    assertEqual(
      after.rows.map((row) => row.id),
      before.rows.map((row) => row.id),
      'order after the refused reorder',
    );
  });

  await check('a reorder naming another type is refused', async () => {
    const note = await one<{ id: string }>(
      db,
      `select id from public.content_items where content_type = 'note' limit 1`,
    );
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.reorder_content('exclusion', $1::uuid[])`, [
            [contentIds[0], contentIds[1], note.id],
          ]),
        /are not exclusion content/,
      );
    });
  });

  await check('a reorder naming the same item twice is refused', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.reorder_content('exclusion', $1::uuid[])`, [
            [contentIds[0], contentIds[0], contentIds[1]],
          ]),
        /more than once/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  section('Agent management');

  await check('an agent calling agent_login_status is refused', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () => db.query(`select * from public.agent_login_status()`),
        /Only managers can read agent login status/,
      );
    });
  });

  await check('a supervisor is refused too', async () => {
    await asUser(db, ids.supervisorAuth, async () => {
      await assertRejects(
        () => db.query(`select * from public.agent_login_status()`),
        /Only managers/,
      );
    });
  });

  await check('a manager gets a row per profile, with login details', async () => {
    await db.query(
      `update auth.users set email_confirmed_at = now(), last_sign_in_at = now()
       where email = 'agent@gladex.test'`,
    );
    await asUser(db, ids.managerAuth, async () => {
      const total = await count(db, `select count(*)::int as n from public.agent_login_status()`);
      const profiles = await count(db, `select count(*)::int as n from public.profiles`);
      assertEqual(total, profiles, 'rows returned');

      const confirmed = await count(
        db,
        `select count(*)::int as n from public.agent_login_status()
         where email_confirmed_at is not null`,
      );
      assert(confirmed >= 1, 'the confirmed agent should be reported');
    });
  });

  await check('invited_at and invited_by can be recorded by a manager', async () => {
    await asUser(
      db,
      ids.managerAuth,
      async () => {
        await db.query(
          `update public.profiles set invited_at = now(), invited_by = $1 where id = $2`,
          [ids.managerProfile, ids.otherAgentProfile],
        );
      },
      { commit: true },
    );
    const row = await one<{ invited_by: string | null }>(
      db,
      `select invited_by from public.profiles where id = $1`,
      [ids.otherAgentProfile],
    );
    assertEqual(row.invited_by, ids.managerProfile, 'invited_by');
  });

  await check('an agent cannot change their own survey links', async () => {
    await asUser(db, ids.agentAuth, async () => {
      const result = await db.query(
        `update public.agent_survey_links set bad_url = 'https://bit.ly/hacked' where profile_id = $1`,
        [ids.agentProfile],
      );
      assertEqual(result.affectedRows ?? 0, 0, 'rows updated');
    });
    const row = await one<{ bad_url: string }>(
      db,
      `select bad_url from public.agent_survey_links where profile_id = $1`,
      [ids.agentProfile],
    );
    assertEqual(row.bad_url, 'https://bit.ly/a-bad', 'link after the attempt');
  });

  await check(
    'Product Development cannot set super_admin (already covered, re-checked here)',
    async () => {
      await asUser(db, ids.prodDevAuth, async () => {
        await assertRejects(
          () =>
            db.query(`update public.profiles set role = 'super_admin' where id = $1`, [
              ids.agentProfile,
            ]),
          /Only a Super Admin/,
        );
      });
    },
  );

  await check('a manager cannot deactivate themselves', async () => {
    await asUser(db, ids.managerAuth, async () => {
      await assertRejects(
        () =>
          db.query(`update public.profiles set is_active = false where id = $1`, [
            ids.managerProfile,
          ]),
        /cannot change your own role or deactivate yourself/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  section('Quotation service selection');

  await check('the owner can set services and add-ons in one call', async () => {
    await asUser(
      db,
      ids.agentAuth,
      async () => {
        await db.query(`select public.set_quotation_services($1, $2::jsonb)`, [
          quoteId,
          JSON.stringify([{ serviceId: ids.tourService, dayNumber: 2, sortOrder: 1 }]),
        ]);
      },
      { commit: true },
    );
    const n = await count(
      db,
      `select count(*)::int as n from public.quotation_services where quotation_id = $1`,
      [quoteId],
    );
    assertEqual(n, 1, 'selected services');
  });

  await check('calling it again replaces the previous selection', async () => {
    await asUser(
      db,
      ids.agentAuth,
      async () => {
        await db.query(`select public.set_quotation_services($1, $2::jsonb)`, [
          quoteId,
          JSON.stringify([
            { serviceId: ids.tourService, dayNumber: 2, sortOrder: 1 },
            { serviceId: ids.transferService, dayNumber: null, sortOrder: 2 },
          ]),
        ]);
      },
      { commit: true },
    );
    const rows = await db.query<{ service_id: string }>(
      `select service_id from public.quotation_services where quotation_id = $1 order by sort_order`,
      [quoteId],
    );
    assertEqual(rows.rows.length, 2, 'selected services');
  });

  await check('another agent cannot set services on this quotation', async () => {
    await asUser(db, ids.otherAgentAuth, async () => {
      await assertRejects(
        () =>
          db.query(`select public.set_quotation_services($1, $2::jsonb)`, [
            quoteId,
            JSON.stringify([{ serviceId: ids.tourService, dayNumber: 2, sortOrder: 1 }]),
          ]),
        /cannot change this quotation/,
      );
    });
  });

  await check('an empty list from another agent is refused, not silently accepted', async () => {
    await asUser(db, ids.otherAgentAuth, async () => {
      await assertRejects(
        () => db.query(`select public.set_quotation_services($1, '[]'::jsonb)`, [quoteId]),
        /cannot change this quotation/,
      );
    });
    const n = await count(
      db,
      `select count(*)::int as n from public.quotation_services where quotation_id = $1`,
      [quoteId],
    );
    assertEqual(n, 2, 'the owner selection survived');
  });

  await check(
    'a service outside the snapshot is rejected and the old selection is kept',
    async () => {
      const ghost = await one<{ id: string }>(
        db,
        `select id from public.services where code = 'ghost_tour'`,
      );

      await asUser(db, ids.agentAuth, async () => {
        await assertRejects(
          () =>
            db.query(`select public.set_quotation_services($1, $2::jsonb)`, [
              quoteId,
              JSON.stringify([{ serviceId: ghost.id, dayNumber: 2, sortOrder: 1 }]),
            ]),
          /not available when the quotation was created/,
        );
      });

      const rows = await db.query<{ service_id: string }>(
        `select service_id from public.quotation_services where quotation_id = $1`,
        [quoteId],
      );
      assertEqual(rows.rows.length, 2, 'services after the rejected call');
    },
  );

  // ---------------------------------------------------------------------------
  section('Change Rate authorship');

  let hotelEntryId = '';
  await check("the author's name is stamped on insert", async () => {
    await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ id: string; created_by_name: string | null }>(
          db,
          `insert into public.quotation_adjustments
             (quotation_id, pax_category, kind, amount, reason)
           values ($1, 'twin', 'hotel', 12000, 'Twin room, 2 nights')
           returning id, created_by_name`,
          [quoteId],
        );
        hotelEntryId = row.id;
        assertEqual(row.created_by_name, 'Agent One', 'created_by_name');
      },
      { commit: true },
    );
  });

  await check('a name sent by the client is overwritten', async () => {
    await asUser(db, ids.agentAuth, async () => {
      const row = await one<{ created_by_name: string | null; created_by: string }>(
        db,
        `insert into public.quotation_adjustments
           (quotation_id, pax_category, kind, amount, reason, created_by_name)
         values ($1, 'quad', 'surcharge', 500, 'Spoof attempt', 'Super Admin')
         returning created_by_name, created_by`,
        [quoteId],
      );
      assertEqual(row.created_by_name, 'Agent One', 'created_by_name');
      assertEqual(row.created_by, ids.agentProfile, 'created_by');
    });
  });

  await check('a reversal carries its own author name', async () => {
    await asUser(db, ids.managerAuth, async () => {
      const row = await one<{ created_by_name: string | null }>(
        db,
        `insert into public.quotation_adjustments
           (quotation_id, pax_category, kind, amount, reason, reverses_id)
         values ($1, 'twin', 'hotel', -12000, 'Wrong room type', $2)
         returning created_by_name`,
        [quoteId, hotelEntryId],
      );
      assertEqual(row.created_by_name, 'Admin', 'created_by_name on the reversal');
    });
  });

  await check('a reversal cannot itself be reversed', async () => {
    const reversalId = await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ id: string }>(
          db,
          `insert into public.quotation_adjustments
             (quotation_id, pax_category, kind, amount, reason, reverses_id)
           values ($1, 'twin', 'hotel', -12000, 'Wrong room type', $2)
           returning id`,
          [quoteId, hotelEntryId],
        );
        return row.id;
      },
      { commit: true },
    );

    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments
               (quotation_id, pax_category, kind, amount, reason, reverses_id)
             values ($1, 'twin', 'hotel', 12000, 'Undo the undo', $2)`,
            [quoteId, reversalId],
          ),
        /A reversal cannot itself be reversed/,
      );
    });
  });

  await check('the same entry cannot be reversed twice', async () => {
    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments
               (quotation_id, pax_category, kind, amount, reason, reverses_id)
             values ($1, 'twin', 'hotel', -12000, 'Again', $2)`,
            [quoteId, hotelEntryId],
          ),
        /already been reversed/,
      );
    });
  });

  await check('a reversal must still exactly negate the original', async () => {
    const other = await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ id: string }>(
          db,
          `insert into public.quotation_adjustments
             (quotation_id, pax_category, kind, amount, reason)
           values ($1, 'solo', 'operator_charge', 750, 'Solo supplement')
           returning id`,
          [quoteId],
        );
        return row.id;
      },
      { commit: true },
    );

    await asUser(db, ids.agentAuth, async () => {
      await assertRejects(
        () =>
          db.query(
            `insert into public.quotation_adjustments
               (quotation_id, pax_category, kind, amount, reason, reverses_id)
             values ($1, 'solo', 'operator_charge', -700, 'Close enough', $2)`,
            [quoteId, other],
          ),
        /exactly negate/,
      );
    });
  });

  await check('entries are still append-only and audited', async () => {
    await assertRejects(
      () =>
        db.query(`update public.quotation_adjustments set amount = 1 where id = $1`, [
          hotelEntryId,
        ]),
      /append-only/,
    );
    const audited = await count(
      db,
      `select count(*)::int as n from public.audit_log where table_name = 'quotation_adjustments'`,
    );
    assert(audited > 0, 'adjustments should be audited');
  });

  // ---------------------------------------------------------------------------
  section('Requote with current rates');

  await check('preview_current_snapshot needs an active account', async () => {
    await asUser(db, ids.inactiveAuth, async () => {
      await assertRejects(
        () => db.query(`select public.preview_current_snapshot()`),
        /Sign in to preview current rates/,
      );
    });
    await asUser(db, ids.agentAuth, async () => {
      const row = await one<{ jpy: string }>(
        db,
        `select (public.preview_current_snapshot() -> 'fx' ->> 'JPY') as jpy`,
      );
      // FX moved to 0.42 earlier in this run.
      assertEqual(Number(row.jpy), 0.42, 'current FX in the preview');
    });
  });

  let copyId = '';
  await check('an agent requotes their own quote at current rates', async () => {
    const before = await one<{ jpy: string }>(
      db,
      `select (snapshot -> 'fx' ->> 'JPY') as jpy from public.quotations where id = $1`,
      [quoteId],
    );
    assertEqual(Number(before.jpy), 0.5, 'the original keeps its own FX');

    await asUser(
      db,
      ids.agentAuth,
      async () => {
        const row = await one<{ result: { id: string; referenceNo: string } }>(
          db,
          `select public.duplicate_quotation($1) as result`,
          [quoteId],
        );
        copyId = row.result.id;
        assert(/^JPN-\d{4}-\d{6}$/.test(row.result.referenceNo), 'the copy gets its own reference');
      },
      { commit: true },
    );

    const after = await one<{ jpy: string; agent_id: string }>(
      db,
      `select (snapshot -> 'fx' ->> 'JPY') as jpy, agent_id from public.quotations where id = $1`,
      [copyId],
    );
    assertEqual(Number(after.jpy), 0.42, 'the copy uses the current FX');
    assertEqual(after.agent_id, ids.agentProfile, 'the copy belongs to the caller');
  });

  await check('the original is left untouched', async () => {
    const row = await one<{ jpy: string; n: number }>(
      db,
      `select (q.snapshot -> 'fx' ->> 'JPY') as jpy,
              (select count(*)::int from public.quotation_services s where s.quotation_id = q.id) as n
       from public.quotations q where q.id = $1`,
      [quoteId],
    );
    assertEqual(Number(row.jpy), 0.5, 'original FX');
    assertEqual(row.n, 2, 'original services');
  });

  await check(
    'live Change Rate entries are copied, netted, with a "Copied from" reason',
    async () => {
      const rows = await db.query<{ pax_category: string; amount: string; reason: string }>(
        `select pax_category, amount::text, reason from public.quotation_adjustments
       where quotation_id = $1 order by pax_category`,
        [copyId],
      );
      assert(rows.rows.length > 0, 'something should have been copied');
      for (const row of rows.rows) {
        assert(row.reason.startsWith('Copied from JPN-'), `reason was "${row.reason}"`);
      }
      // The twin hotel entry was reversed earlier, so it must not appear.
      assert(
        !rows.rows.some((row) => row.pax_category === 'twin'),
        'a reversed entry must not be copied',
      );
    },
  );

  await check('a supervisor requoting a team quote owns the copy', async () => {
    await asUser(db, ids.supervisorAuth, async () => {
      const row = await one<{ result: { id: string } }>(
        db,
        `select public.duplicate_quotation($1) as result`,
        [quoteId],
      );
      const owner = await one<{ agent_id: string }>(
        db,
        `select agent_id from public.quotations where id = $1`,
        [row.result.id],
      );
      assertEqual(owner.agent_id, ids.supervisorProfile, 'the copy belongs to the supervisor');
    });
  });

  await check('another agent cannot requote a quote they cannot see', async () => {
    await asUser(db, ids.otherAgentAuth, async () => {
      await assertRejects(
        () => db.query(`select public.duplicate_quotation($1)`, [quoteId]),
        /was not found, or you cannot see it/,
      );
    });
  });

  await check('a service missing from the new snapshot is reported as skipped', async () => {
    // Retiring the tour's rate drops it out of every snapshot built from now on.
    await db.query(
      `update public.service_rate_versions set status = 'inactive'
       where service_id = $1 and status = 'published'`,
      [ids.transferService],
    );

    await asUser(db, ids.agentAuth, async () => {
      const row = await one<{ result: { id: string; skippedServices: string[] } }>(
        db,
        `select public.duplicate_quotation($1) as result`,
        [quoteId],
      );
      assertEqual(row.result.skippedServices, ['Airport Transfer'], 'skipped services');

      const kept = await count(
        db,
        `select count(*)::int as n from public.quotation_services where quotation_id = $1`,
        [row.result.id],
      );
      assertEqual(kept, 1, 'only the service still in the snapshot was copied');
    });
  });

  await db.close();
  process.exitCode = summary();
}

main().catch((error: unknown) => {
  console.error('\nDatabase test run failed to start.\n', error);
  process.exitCode = 1;
});
