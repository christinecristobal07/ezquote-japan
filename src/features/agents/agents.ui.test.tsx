import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AgentProfile } from '@/data/repositories/agentRepository';
import type { AuthValue } from '@/features/auth/authContext';
import type { Role } from '@/domain/permissions';
import { AgentEditor } from './AgentEditor';
import { toEditorValues } from './agentEditorValues';

const SURVEY_BAD =
  'https://app.ratemyservice.io/org303765/submitsurvey/agent12997/VeryDissatisfied?surveyAnswerId=9712';
const SURVEY_GREAT =
  'https://app.ratemyservice.io/org303765/submitsurvey/agent12997/Satisfied?surveyAnswerId=9713';

function agent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'p1',
    fullName: 'Aira',
    email: 'aira.gladex@gmail.com',
    role: 'sales_agent',
    supervisorId: null,
    isActive: true,
    dataIssues: [],
    hasLogin: false,
    invitedAt: null,
    updatedAt: '2026-11-21T00:00:00Z',
    badUrl: SURVEY_BAD,
    greatUrl: SURVEY_GREAT,
    ...overrides,
  };
}

const SUPERVISOR = agent({
  id: 'sup1',
  fullName: 'Supervisor Sam',
  role: 'sales_supervisor',
  badUrl: null,
  greatUrl: null,
});

function renderEditor(options: {
  subject?: AgentProfile;
  currentProfileId?: string;
  currentRole?: Role;
  allAgents?: AgentProfile[];
}) {
  const subject = options.subject ?? agent();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentEditor
          agent={subject}
          values={toEditorValues(subject)}
          allAgents={options.allAgents ?? [subject, SUPERVISOR]}
          currentProfileId={options.currentProfileId ?? 'manager-1'}
          currentRole={options.currentRole ?? 'admin'}
          onChange={onChange}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, onChange };
}

describe('AgentEditor roles', () => {
  it('hides Super Admin from an Admin', () => {
    renderEditor({ currentRole: 'admin' });
    const options = Array.from(screen.getByLabelText(/^Role/).querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    expect(options).not.toContain('Super Admin');
    expect(options).toContain('Sales Agent');
  });

  it('offers Super Admin to a Super Admin', () => {
    renderEditor({ currentRole: 'super_admin' });
    const options = Array.from(screen.getByLabelText(/^Role/).querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    expect(options).toContain('Super Admin');
  });

  it('still shows the current role even if it is Super Admin', () => {
    renderEditor({
      subject: agent({ role: 'super_admin' }),
      currentRole: 'product_development',
    });
    const options = Array.from(screen.getByLabelText(/^Role/).querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    expect(options).toContain('Super Admin');
  });

  it('disables role and active on your own profile', () => {
    renderEditor({ currentProfileId: 'p1' });
    expect(screen.getByLabelText(/^Role/)).toBeDisabled();
    expect(screen.getByLabelText(/you cannot deactivate yourself/i)).toBeDisabled();
  });

  it('leaves them editable on somebody else', () => {
    renderEditor({ currentProfileId: 'manager-1' });
    expect(screen.getByLabelText(/^Role/)).toBeEnabled();
    expect(screen.getByLabelText('Active')).toBeEnabled();
  });
});

describe('AgentEditor supervisor field', () => {
  it('shows the supervisor select for a sales agent', () => {
    renderEditor({ subject: agent({ role: 'sales_agent' }) });
    expect(screen.getByLabelText(/Supervisor/)).toBeInTheDocument();
  });

  it.each(['sales_supervisor', 'admin', 'product_development', 'super_admin'] as const)(
    'hides it for %s',
    (role) => {
      renderEditor({ subject: agent({ role }), currentRole: 'super_admin' });
      expect(screen.queryByLabelText(/Supervisor/)).not.toBeInTheDocument();
    },
  );

  it('lists only active supervisors', () => {
    const inactive = agent({
      id: 'sup2',
      fullName: 'Retired Rita',
      role: 'sales_supervisor',
      isActive: false,
    });
    renderEditor({ allAgents: [agent(), SUPERVISOR, inactive] });
    const options = Array.from(screen.getByLabelText(/Supervisor/).querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    expect(options).toContain('Supervisor Sam');
    expect(options).not.toContain('Retired Rita');
  });
});

describe('AgentEditor email', () => {
  it('is editable while no login is linked', () => {
    renderEditor({ subject: agent({ hasLogin: false }) });
    expect(screen.getByLabelText(/^Email/)).toBeEnabled();
  });

  it('is read-only once a login exists, with a note', () => {
    renderEditor({ subject: agent({ hasLogin: true }) });
    const email = screen.getByLabelText(/^Email/);
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByText(/Changing a login email isn't supported yet/)).toBeInTheDocument();
  });
});

describe('AgentEditor link validation', () => {
  it('names the other agent when a link is already in use', () => {
    const amalia = agent({ id: 'p2', fullName: 'Amalia', badUrl: SURVEY_BAD, greatUrl: null });
    const geneuele = agent({ id: 'p3', fullName: 'Geneuele', badUrl: SURVEY_BAD, greatUrl: null });
    renderEditor({ subject: geneuele, allAgents: [amalia, geneuele] });

    expect(screen.getByText(/Needs attention/)).toBeInTheDocument();
    expect(screen.getByText(/also used by Amalia/)).toBeInTheDocument();
  });

  it('flags a Bad link that carries a Satisfied rating', () => {
    renderEditor({ subject: agent({ badUrl: SURVEY_GREAT }) });
    // Shown twice on purpose: inline on the field, and in the summary list.
    expect(screen.getAllByText(/expected VeryDissatisfied/).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a rejected link out of the closing-block preview', () => {
    const amalia = agent({ id: 'p2', fullName: 'Amalia', badUrl: SURVEY_BAD, greatUrl: null });
    const geneuele = agent({
      id: 'p3',
      fullName: 'Geneuele',
      badUrl: SURVEY_BAD,
      greatUrl: SURVEY_GREAT,
    });
    renderEditor({ subject: geneuele, allAgents: [amalia, geneuele] });

    const preview = screen.getByText(/Hi my name is Geneuele/);
    expect(preview.textContent).toContain('GREAT ');
    expect(preview.textContent).not.toContain('BAD ');
  });

  it('shows the closing block with both links when they are clean', () => {
    renderEditor({});
    const preview = screen.getByText(/Hi my name is Aira/);
    expect(preview.textContent).toContain('How would you rate my service?');
    // The URL sits on its own line, so chat apps auto-link it.
    expect(preview.textContent).toContain(`BAD \u{1F614}\u{1F614}\u{1F614}\n${SURVEY_BAD}`);
  });

  it('offers Open buttons that cannot leak the opener', () => {
    renderEditor({});
    const open = screen.getByRole('link', { name: /Open Bad link/ });
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('reports typed changes back to the caller', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({});
    await user.type(screen.getByLabelText(/^Full name/), '!');
    expect(onChange).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
const authValue = vi.hoisted(() => ({ current: null as AuthValue | null }));

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => {
    if (authValue.current === null) throw new Error('no auth value set');
    return authValue.current;
  },
}));

const { RequireRole } = await import('@/app/guards/RequireRole');

describe('agents.manage guard', () => {
  function renderAs(role: Role) {
    authValue.current = {
      status: 'signedIn',
      session: null,
      profile: {
        id: 'p1',
        fullName: 'Test',
        email: null,
        role,
        isActive: true,
        supervisorId: null,
      },
      signOut: vi.fn(),
    };
    return render(
      <MemoryRouter initialEntries={['/admin/agents']}>
        <Routes>
          <Route
            path="/admin/agents"
            element={
              <RequireRole permission="agents.manage">
                <p>Agent management</p>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it.each(['sales_agent', 'sales_supervisor'] as const)('shows 403 to %s', (role) => {
    renderAs(role);
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
  });

  it('lets a manager through', () => {
    renderAs('admin');
    expect(screen.getByText('Agent management')).toBeInTheDocument();
  });
});
