/**
 * Counting what is wrong with the imported agent list.
 *
 * 158 workbook rows became 156 profiles, and 43 of them arrived with something
 * missing: no email, a placeholder survey link, or a malformed one. Those have
 * to be fixed before anyone is invited, because an agent with a broken Rate My
 * Service link sends every client to an error page — worse than sending none,
 * since the client clicks it.
 *
 * The counts are shown beside the filter so the size of the job is visible
 * without anybody scrolling the table to work it out.
 */

import type { DataIssue } from './validation.ts';

export const DATA_ISSUES: readonly DataIssue[] = [
  'needs_email',
  'placeholder_link',
  'invalid_bad_link',
  'invalid_great_link',
];

export const DATA_ISSUE_LABELS: Readonly<Record<DataIssue, string>> = {
  needs_email: 'No email',
  placeholder_link: 'Placeholder link',
  invalid_bad_link: 'Invalid bad link',
  invalid_great_link: 'Invalid great link',
};

/** What each one stops the agent doing, so the fix is obviously worth making. */
export const DATA_ISSUE_CONSEQUENCES: Readonly<Record<DataIssue, string>> = {
  needs_email: 'Cannot be invited at all.',
  placeholder_link: 'Their quotations carry a link that goes nowhere useful.',
  invalid_bad_link: 'The "bad experience" link sends the client to an error page.',
  invalid_great_link: 'The "great experience" link sends the client to an error page.',
};

export interface IssueHolder {
  readonly dataIssues: readonly string[];
}

export interface IssueSummary {
  /** How many agents carry each issue. An agent may carry several. */
  readonly byIssue: Readonly<Record<DataIssue, number>>;
  /** Agents with at least one issue, counted once each. */
  readonly affected: number;
  readonly total: number;
}

export function summariseDataIssues(agents: readonly IssueHolder[]): IssueSummary {
  const byIssue: Record<DataIssue, number> = {
    needs_email: 0,
    placeholder_link: 0,
    invalid_bad_link: 0,
    invalid_great_link: 0,
  };

  let affected = 0;
  for (const agent of agents) {
    let counted = false;
    for (const issue of DATA_ISSUES) {
      if (!agent.dataIssues.includes(issue)) continue;
      byIssue[issue] += 1;
      counted = true;
    }
    if (counted) affected += 1;
  }

  return { byIssue, affected, total: agents.length };
}

export type IssueFilter = 'all' | 'any' | DataIssue;

/** Whether one agent passes the chosen issue filter. */
export function matchesIssueFilter(agent: IssueHolder, filter: IssueFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'any') {
    return DATA_ISSUES.some((issue) => agent.dataIssues.includes(issue));
  }
  return agent.dataIssues.includes(filter);
}

/** "Needs attention (43)" — the count sits in the option, so it is always visible. */
export function issueFilterLabel(filter: IssueFilter, summary: IssueSummary): string {
  if (filter === 'all') return `All agents (${String(summary.total)})`;
  if (filter === 'any') return `Needs attention (${String(summary.affected)})`;
  return `${DATA_ISSUE_LABELS[filter]} (${String(summary.byIssue[filter])})`;
}
