import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ServiceForm } from './ServiceForm';
import { emptyService, fromService } from './serviceFormValues';
import type { ServiceMeta } from '@/data/repositories/contentRepository';
import type { City, Operator } from '@/data/repositories/referenceRepository';
import { ConflictError, updateContentItem } from '@/data/repositories/contentRepository';
import type { AuthValue } from '@/features/auth/authContext';
import type { Role } from '@/domain/permissions';

const CITIES: City[] = [
  { id: 'c1', name: 'Tokyo', sortOrder: 1, isActive: true, updatedAt: 'x' },
  { id: 'c2', name: 'Osaka', sortOrder: 2, isActive: true, updatedAt: 'x' },
];
const OPERATORS: Operator[] = [
  { id: 'o1', name: 'Gladex Ops', notes: null, isActive: true, updatedAt: 'x' },
];

function renderForm(props: Partial<Parameters<typeof ServiceForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ServiceForm
        mode="create"
        initial={emptyService()}
        cities={CITIES}
        operators={OPERATORS}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ServiceForm', () => {
  it('hides the direction field for a tour', () => {
    renderForm();
    expect(screen.queryByLabelText(/Direction/)).not.toBeInTheDocument();
  });

  it('shows the direction field for a transfer, defaulting to round trip', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/^Type/), 'transfer');

    const direction = screen.getByLabelText(/Direction/);
    expect(direction).toBeInTheDocument();
    expect(direction).toHaveValue('round_trip');
  });

  it('clears the direction again when switching back to a tour', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    await user.selectOptions(screen.getByLabelText(/^Type/), 'transfer');
    await user.selectOptions(screen.getByLabelText(/^Type/), 'tour');
    await user.type(screen.getByLabelText(/^Name/), 'Hakone Tour');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      serviceType: 'tour',
      transferDirection: null,
    });
  });

  it('generates the code from the name while creating', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^Name/), 'Kyoto & Nara Tour');
    expect(screen.getByLabelText(/^Code/)).toHaveValue('kyoto_nara_tour');
  });

  it('stops generating once the code is edited by hand', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/^Name/), 'Fuji');
    await user.clear(screen.getByLabelText(/^Code/));
    await user.type(screen.getByLabelText(/^Code/), 'custom_code');
    await user.type(screen.getByLabelText(/^Name/), ' Tour');
    expect(screen.getByLabelText(/^Code/)).toHaveValue('custom_code');
  });

  it('makes the code read-only when editing', () => {
    const service: ServiceMeta = {
      id: 's1',
      code: 'mt_fuji_tour',
      name: 'Mt Fuji Tour',
      serviceType: 'tour',
      cityId: 'c1',
      operatorId: null,
      description: null,
      itineraryTitle: 'MT. FUJI TOUR',
      itineraryText: '🗻Chureito Pagoda',
      inclusionText: 'with MT FUJI TOUR',
      consumesDay: true,
      addsNight: false,
      transferDirection: null,
      sortOrder: 1,
      isActive: true,
      updatedAt: 'x',
    };
    renderForm({ mode: 'edit', initial: fromService(service) });

    const code = screen.getByLabelText(/^Code/);
    expect(code).toHaveValue('mt_fuji_tour');
    expect(code).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Type/)).toBeDisabled();
  });

  it('previews the itinerary with emoji intact', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Itinerary text/), '🏨Hotel Pickup');
    // The textarea holds it too, so look for the preview paragraph.
    const matches = screen.getAllByText('🏨Hotel Pickup');
    expect(matches.some((element) => element.tagName === 'P')).toBe(true);
  });

  it('previews the inclusion line with its prefix', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Inclusion line/), 'with MT FUJI TOUR');
    expect(screen.getByText('✅ with MT FUJI TOUR')).toBeInTheDocument();
  });

  it('warns when an existing service has no published rate', () => {
    renderForm({ mode: 'edit', serviceId: 's1', hasPublishedRate: false });
    expect(screen.getByText('No published rate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set a rate' })).toHaveAttribute(
      'href',
      '/admin/rates/s1',
    );
  });

  it('blocks saving without a name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('A name is required.')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
describe('optimistic concurrency', () => {
  it('reports a conflict when the row changed underneath', async () => {
    vi.resetModules();
    vi.doMock('@/data/supabaseClient', () => ({
      supabase: {
        from: () => ({
          update: () => ({
            eq: () => ({
              eq: () => ({
                // Zero rows: the updated_at filter matched nothing.
                select: () => ({ overrideTypes: () => ({ data: [], error: null }) }),
              }),
            }),
          }),
        }),
      },
    }));
    const repo = await import('@/data/repositories/contentRepository');

    await expect(
      repo.updateContentItem('id-1', '2026-11-20T10:00:00Z', {
        body: 'New text',
        conditionServiceId: null,
        isActive: true,
        startsOn: null,
        endsOn: null,
      }),
    ).rejects.toThrow('This item was changed by someone else. Reload to see the latest.');

    vi.doUnmock('@/data/supabaseClient');
    vi.resetModules();
  });

  it('exposes the reload wording on the error type', () => {
    expect(new ConflictError().message).toBe(
      'This item was changed by someone else. Reload to see the latest.',
    );
    expect(typeof updateContentItem).toBe('function');
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

describe('content.manage guard', () => {
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
      <MemoryRouter initialEntries={['/admin/content']}>
        <Routes>
          <Route
            path="/admin/content"
            element={
              <RequireRole permission="content.manage">
                <p>Content management</p>
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
    expect(screen.queryByText('Content management')).not.toBeInTheDocument();
  });

  it.each(['super_admin', 'product_development', 'admin'] as const)('lets %s through', (role) => {
    renderAs(role);
    expect(screen.getByText('Content management')).toBeInTheDocument();
  });
});
