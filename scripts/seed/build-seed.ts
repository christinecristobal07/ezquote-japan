import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { readAgents } from './agents.ts';
import { DEFAULT_SERVICE_CODES } from './content.ts';
import { buildFixList, buildSql } from './emit.ts';
import { applyItineraries, readHotels } from './hotels.ts';
import { readRates } from './rates.ts';
import type { SeedSetting } from './types.ts';
import { SeedError } from './workbook.ts';

const here = dirname(fileURLToPath(import.meta.url));
const WORKBOOK = resolve(here, 'data/workbook.xlsx');
const OUT_DIR = resolve(here, 'out');

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK);

  const rates = readRates(wb);
  const hotels = readHotels(wb);
  const itineraries = applyItineraries(wb, rates.services);
  const agents = readAgents(wb);

  const warnings = [...rates.warnings];
  for (const key of itineraries.unmatchedKeys) {
    warnings.push(`JAPAN QUOTATION: itinerary row "${key}" matched no service. Ignored.`);
  }

  const settings: SeedSetting[] = [
    ...itineraries.settings,
    {
      key: 'quotation.validity_label',
      value: rates.validityLabel,
      description: 'Validity line printed on every quotation.',
    },
    {
      key: 'quotation.default_service_codes',
      value: DEFAULT_SERVICE_CODES,
      description: 'Services added to a new quotation by default.',
    },
  ];

  const sql = buildSql({
    services: rates.services,
    hotels,
    agents: agents.agents,
    settings,
    warnings,
  });
  const fixList = buildFixList(agents.agents);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'seed.sql'), sql, 'utf8');
  await writeFile(resolve(OUT_DIR, 'agent-fix-list.csv'), fixList.csv, 'utf8');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const priced = rates.services.filter((s) => s.rate !== null);
  const tours = priced.filter((s) => s.serviceType === 'tour').length;
  const transfers = priced.filter((s) => s.serviceType === 'transfer').length;
  const unpriced = rates.services.length - priced.length;

  const count = (issue: string): number =>
    agents.agents.filter((a) => a.dataIssues.some((i) => i === issue)).length;
  const withIssues = agents.agents.filter((a) => a.dataIssues.length > 0).length;

  console.log('');
  console.log('EZQUOTE Japan seed');
  console.log('------------------');
  console.log(
    `  services          ${priced.length} priced (${tours} tours, ${transfers} transfers) + ${unpriced} unpriced`,
  );
  console.log(`  hotels            ${hotels.length}`);
  console.log(`  cities            3`);
  console.log(`  app settings      ${settings.length}`);
  console.log(`  validity          ${rates.validityLabel}`);
  console.log(
    `  profiles          ${agents.agents.length} from ${agents.rowCount} rows (${agents.mergedCount} merged)`,
  );
  console.log(`  needs email       ${count('needs_email')}`);
  console.log(`  placeholder link  ${count('placeholder_link')}`);
  console.log(`  invalid bad link  ${count('invalid_bad_link')}`);
  console.log(`  invalid great     ${count('invalid_great_link')}`);
  console.log(`  agents w/ issues  ${withIssues}`);
  console.log(`  fix list rows     ${fixList.rows}`);
  console.log('');
  for (const warning of warnings) console.log(`  WARNING: ${warning}`);
  if (warnings.length > 0) console.log('');
  console.log(`  wrote ${resolve(OUT_DIR, 'seed.sql')}`);
  console.log(`  wrote ${resolve(OUT_DIR, 'agent-fix-list.csv')}`);
  console.log('');
}

main().catch((error: unknown) => {
  if (error instanceof SeedError) {
    console.error(`\nSeed build failed.\n  ${error.message}\n`);
  } else {
    console.error('\nSeed build failed.\n', error, '\n');
  }
  process.exitCode = 1;
});
