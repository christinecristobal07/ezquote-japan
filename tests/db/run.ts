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

  await db.close();
  process.exitCode = summary();
}

main().catch((error: unknown) => {
  console.error('\nDatabase test run failed to start.\n', error);
  process.exitCode = 1;
});
