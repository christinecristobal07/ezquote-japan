import { describe, expect, it } from 'vitest';
import {
  DATA_ISSUES,
  DATA_ISSUE_CONSEQUENCES,
  DATA_ISSUE_LABELS,
  issueFilterLabel,
  matchesIssueFilter,
  summariseDataIssues,
  type IssueHolder,
} from './issueSummary.ts';

function agent(...dataIssues: string[]): IssueHolder {
  return { dataIssues };
}

describe('summariseDataIssues', () => {
  it('counts a clean list as nothing to do', () => {
    const summary = summariseDataIssues([agent(), agent(), agent()]);
    expect(summary.affected).toBe(0);
    expect(summary.total).toBe(3);
    expect(summary.byIssue).toEqual({
      needs_email: 0,
      placeholder_link: 0,
      invalid_bad_link: 0,
      invalid_great_link: 0,
    });
  });

  it('counts each issue separately', () => {
    const summary = summariseDataIssues([
      agent('needs_email'),
      agent('needs_email'),
      agent('placeholder_link'),
      agent('invalid_bad_link'),
    ]);
    expect(summary.byIssue.needs_email).toBe(2);
    expect(summary.byIssue.placeholder_link).toBe(1);
    expect(summary.byIssue.invalid_bad_link).toBe(1);
    expect(summary.byIssue.invalid_great_link).toBe(0);
  });

  it('counts an agent with several issues once in the total', () => {
    const summary = summariseDataIssues([
      agent('needs_email', 'invalid_bad_link', 'invalid_great_link'),
      agent(),
    ]);
    // Three issues, but one agent to chase.
    expect(summary.affected).toBe(1);
    expect(summary.byIssue.needs_email).toBe(1);
    expect(summary.byIssue.invalid_bad_link).toBe(1);
    expect(summary.byIssue.invalid_great_link).toBe(1);
  });

  it('ignores an issue it does not know', () => {
    const summary = summariseDataIssues([agent('something_else')]);
    expect(summary.affected).toBe(0);
    expect(summary.total).toBe(1);
  });

  it('copes with an empty list', () => {
    expect(summariseDataIssues([])).toEqual({
      byIssue: {
        needs_email: 0,
        placeholder_link: 0,
        invalid_bad_link: 0,
        invalid_great_link: 0,
      },
      affected: 0,
      total: 0,
    });
  });

  it('reproduces the shape of the real import', () => {
    // 22 with no email, 11 placeholder, 13 bad, 12 great; 43 agents affected
    // because some carry more than one.
    const agents: IssueHolder[] = [
      ...Array.from({ length: 22 }, () => agent('needs_email')),
      ...Array.from({ length: 11 }, () => agent('placeholder_link')),
      ...Array.from({ length: 13 }, () => agent('invalid_bad_link')),
      ...Array.from({ length: 10 }, () => agent('invalid_great_link')),
      // Two agents carrying both link problems at once.
      agent('invalid_great_link', 'invalid_bad_link'),
      agent('invalid_great_link', 'invalid_bad_link'),
      ...Array.from({ length: 100 }, () => agent()),
    ];
    const summary = summariseDataIssues(agents);
    expect(summary.byIssue.needs_email).toBe(22);
    expect(summary.byIssue.placeholder_link).toBe(11);
    expect(summary.byIssue.invalid_great_link).toBe(12);
    expect(summary.byIssue.invalid_bad_link).toBe(15);
    expect(summary.affected).toBe(58);
    expect(summary.total).toBe(158);
  });
});

describe('matchesIssueFilter', () => {
  it('lets everything through on "all"', () => {
    expect(matchesIssueFilter(agent(), 'all')).toBe(true);
    expect(matchesIssueFilter(agent('needs_email'), 'all')).toBe(true);
  });

  it('"any" keeps only agents with something wrong', () => {
    expect(matchesIssueFilter(agent(), 'any')).toBe(false);
    expect(matchesIssueFilter(agent('placeholder_link'), 'any')).toBe(true);
  });

  it('"any" ignores an unrecognised issue', () => {
    expect(matchesIssueFilter(agent('something_else'), 'any')).toBe(false);
  });

  it('a specific filter keeps only that issue', () => {
    const both = agent('needs_email', 'invalid_bad_link');
    expect(matchesIssueFilter(both, 'needs_email')).toBe(true);
    expect(matchesIssueFilter(both, 'invalid_bad_link')).toBe(true);
    expect(matchesIssueFilter(both, 'placeholder_link')).toBe(false);
  });
});

describe('issueFilterLabel', () => {
  const summary = summariseDataIssues([
    agent('needs_email'),
    agent('needs_email'),
    agent('placeholder_link'),
    agent(),
  ]);

  it('puts the count in the option, so it shows without filtering', () => {
    expect(issueFilterLabel('all', summary)).toBe('All agents (4)');
    expect(issueFilterLabel('any', summary)).toBe('Needs attention (3)');
    expect(issueFilterLabel('needs_email', summary)).toBe('No email (2)');
    expect(issueFilterLabel('invalid_great_link', summary)).toBe('Invalid great link (0)');
  });
});

describe('the issue vocabulary', () => {
  it('labels and explains every issue it can count', () => {
    for (const issue of DATA_ISSUES) {
      expect(DATA_ISSUE_LABELS[issue]).toBeTruthy();
      expect(DATA_ISSUE_CONSEQUENCES[issue]).toBeTruthy();
    }
  });

  it('says plainly that no email means no invitation', () => {
    expect(DATA_ISSUE_CONSEQUENCES.needs_email).toContain('Cannot be invited');
  });
});
