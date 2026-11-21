import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  PageSpinner,
  useToast,
} from '@/components/ui';
import { isManager, type Role } from '@/domain/permissions';
import { summariseInvites, type InviteResult } from '@/domain';
import { ROLE_LABELS } from '@/app/roleLabels';
import { ContentError } from '@/data/repositories/contentRepository';
import type { AgentProfile } from '@/data/repositories/agentRepository';
import { useAuth } from '@/features/auth/useAuth';
import { AgentEditor } from './AgentEditor';
import { toEditorValues, type AgentEditorValues } from './agentEditorValues';
import {
  useAgents,
  useBulkUpdate,
  useCreateAgent,
  useInviteAgents,
  useLoginStatus,
  useSaveAgent,
} from './queries';

type LoginLabel = 'Not invited' | 'Invited' | 'Active';

function loginLabel(
  agent: AgentProfile,
  status: { emailConfirmedAt: string | null; lastSignInAt: string | null } | undefined,
): { label: LoginLabel; detail: string } {
  if (status?.emailConfirmedAt != null) {
    return {
      label: 'Active',
      detail:
        status.lastSignInAt == null
          ? 'never signed in'
          : `last sign-in ${new Date(status.lastSignInAt).toLocaleDateString('en-PH')}`,
    };
  }
  if (agent.invitedAt !== null) {
    return { label: 'Invited', detail: new Date(agent.invitedAt).toLocaleDateString('en-PH') };
  }
  return { label: 'Not invited', detail: '' };
}

function linkLabel(agent: AgentProfile): { text: string; tone: 'success' | 'warning' | 'danger' } {
  const invalid =
    agent.dataIssues.includes('invalid_bad_link') ||
    agent.dataIssues.includes('invalid_great_link');
  if (agent.dataIssues.includes('placeholder_link'))
    return { text: 'Placeholder', tone: 'warning' };
  if (invalid) return { text: 'Invalid', tone: 'danger' };
  if (agent.badUrl === null && agent.greatUrl === null) return { text: 'Missing', tone: 'warning' };
  return { text: 'OK', tone: 'success' };
}

export function AgentsPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const agents = useAgents();
  const manager = profile !== null && isManager(profile.role);
  const login = useLoginStatus(manager);
  const save = useSaveAgent();
  const create = useCreateAgent();
  const invite = useInviteAgents();
  const bulk = useBulkUpdate();

  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [values, setValues] = useState<AgentEditorValues | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [inviteResults, setInviteResults] = useState<readonly InviteResult[] | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const statusById = useMemo(
    () => new Map((login.data ?? []).map((row) => [row.profileId, row])),
    [login.data],
  );
  const nameById = useMemo(
    () => new Map((agents.data ?? []).map((row) => [row.id, row.fullName])),
    [agents.data],
  );

  const rows = (agents.data ?? []).filter((agent) => {
    if (issuesOnly && agent.dataIssues.length === 0) return false;
    if (roleFilter !== 'all' && agent.role !== roleFilter) return false;
    if (activeFilter === 'active' && !agent.isActive) return false;
    if (activeFilter === 'inactive' && agent.isActive) return false;
    const needle = search.trim().toLowerCase();
    return needle === '' || `${agent.fullName} ${agent.email ?? ''}`.toLowerCase().includes(needle);
  });

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  if (agents.isPending || profile === null) return <PageSpinner label="Loading agents…" />;

  if (editing !== null && values !== null) {
    return (
      <AgentEditor
        agent={editing}
        values={values}
        allAgents={agents.data ?? []}
        currentProfileId={profile.id}
        currentRole={profile.role}
        busy={save.isPending}
        onChange={setValues}
        onCancel={() => {
          setEditing(null);
          setValues(null);
        }}
        onSave={(issues) => {
          save.mutate(
            {
              id: editing.id,
              updatedAt: editing.updatedAt,
              values: {
                fullName: values.fullName.trim(),
                email: values.email.trim() === '' ? null : values.email.trim().toLowerCase(),
                role: values.role,
                supervisorId: values.role === 'sales_agent' ? values.supervisorId : null,
                isActive: values.isActive,
                dataIssues: issues,
              },
              badUrl: values.badUrl.trim() === '' ? null : values.badUrl.trim(),
              greatUrl: values.greatUrl.trim() === '' ? null : values.greatUrl.trim(),
            },
            {
              onSuccess: () => {
                setEditing(null);
                setValues(null);
                toast.success('Agent saved.');
              },
              onError: reportError,
            },
          );
        }}
      />
    );
  }

  const selectedRows = rows.filter((agent) => selected.has(agent.id));

  return (
    <>
      <PageHeader
        title="Agents"
        description="Profiles, roles, invitations and Rate My Service links."
        actions={
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            Add agent
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" className="w-56">
          <Input
            value={search}
            placeholder="Name or email"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </Field>
        <Field label="Role" className="w-48">
          <Select
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value === 'all' ? 'all' : (event.target.value as Role));
            }}
          >
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className="w-40">
          <Select
            value={activeFilter}
            onChange={(event) => {
              const next = event.target.value;
              setActiveFilter(next === 'active' || next === 'inactive' ? next : 'all');
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Button
          variant={issuesOnly ? 'primary' : 'secondary'}
          onClick={() => {
            setIssuesOnly((value) => !value);
          }}
        >
          Needs attention
        </Button>
      </div>

      {selectedRows.length > 0 && (
        <Alert tone="info" className="mb-4">
          <span className="flex flex-wrap items-center gap-2">
            {selectedRows.length} selected
            <Button
              size="sm"
              loading={invite.isPending}
              onClick={() => {
                invite.mutate(
                  selectedRows.map((agent) => agent.id),
                  {
                    onSuccess: (results) => {
                      setInviteResults(results);
                      setSelected(new Set());
                    },
                    onError: reportError,
                  },
                );
              }}
            >
              Invite / resend
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setDeactivating(true);
              }}
            >
              Deactivate
            </Button>
          </span>
        </Alert>
      )}

      <Card>
        <CardHeader title={`${String(rows.length)} agents`} />
        <DataTable
          caption="Agent profiles"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'select',
              header: 'Select',
              cell: (row) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.fullName}`}
                  checked={selected.has(row.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    setSelected(next);
                  }}
                />
              ),
            },
            { key: 'name', header: 'Name', cell: (row) => row.fullName },
            { key: 'email', header: 'Email', cell: (row) => row.email ?? '—' },
            {
              key: 'role',
              header: 'Role',
              cell: (row) => <Badge tone="info">{ROLE_LABELS[row.role]}</Badge>,
            },
            {
              key: 'supervisor',
              header: 'Supervisor',
              cell: (row) =>
                row.supervisorId === null ? '—' : (nameById.get(row.supervisorId) ?? '—'),
            },
            {
              key: 'links',
              header: 'Links',
              cell: (row) => {
                const link = linkLabel(row);
                return <Badge tone={link.tone}>{link.text}</Badge>;
              },
            },
            {
              key: 'issues',
              header: 'Issues',
              cell: (row) => (
                <span className="flex flex-wrap gap-1">
                  {row.dataIssues.map((issue) => (
                    <Badge key={issue} tone="warning">
                      {issue.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </span>
              ),
            },
            {
              key: 'login',
              header: 'Login',
              cell: (row) => {
                const status = loginLabel(row, statusById.get(row.id));
                return (
                  <span>
                    <Badge tone={status.label === 'Active' ? 'success' : 'neutral'}>
                      {status.label}
                    </Badge>
                    {status.detail !== '' && (
                      <span className="ml-1 text-xs text-slate-500">{status.detail}</span>
                    )}
                  </span>
                );
              },
            },
            {
              key: 'active',
              header: 'Active',
              cell: (row) => (
                <Badge tone={row.isActive ? 'success' : 'neutral'}>
                  {row.isActive ? 'Yes' : 'No'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(row);
                    setValues(toEditorValues(row));
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Dialog
        open={inviteResults !== null}
        onOpenChange={(open) => {
          if (!open) setInviteResults(null);
        }}
        title="Invitation results"
        description={
          inviteResults === null
            ? ''
            : (() => {
                const summary = summariseInvites(inviteResults);
                return `${String(summary.invited)} invited · ${String(summary.resent)} resent · ${String(summary.skipped)} skipped · ${String(summary.errors)} failed`;
              })()
        }
        footer={
          <Button
            onClick={() => {
              setInviteResults(null);
            }}
          >
            Close
          </Button>
        }
      >
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {(inviteResults ?? []).map((result) => (
            <li key={result.profileId} className="flex gap-2">
              <Badge
                tone={
                  result.status === 'error'
                    ? 'danger'
                    : result.status === 'skipped'
                      ? 'neutral'
                      : 'success'
                }
              >
                {result.status}
              </Badge>
              <span>
                {nameById.get(result.profileId) ?? result.profileId}: {result.message}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title={`Deactivate ${String(selectedRows.length)} agent(s)?`}
        message="They are locked out at their next window focus. Profiles are never deleted."
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => {
          await bulk
            .mutateAsync({
              rows: selectedRows
                .filter((agent) => agent.id !== profile.id)
                .map((agent) => ({
                  id: agent.id,
                  updatedAt: agent.updatedAt,
                  values: {
                    fullName: agent.fullName,
                    email: agent.email,
                    role: agent.role,
                    supervisorId: agent.supervisorId,
                    isActive: false,
                    dataIssues: agent.dataIssues,
                  },
                })),
            })
            .then(() => {
              toast.success('Agents deactivated.');
              setSelected(new Set());
            })
            .catch(reportError);
          setDeactivating(false);
        }}
      />

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!open && !create.isPending) setAdding(false);
        }}
        title="Add an agent"
        description="They are created inactive until you invite them."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={newName.trim() === ''}
              onClick={() => {
                create.mutate(
                  {
                    fullName: newName.trim(),
                    email: newEmail.trim() === '' ? null : newEmail.trim().toLowerCase(),
                    role: 'sales_agent',
                    supervisorId: null,
                    isActive: true,
                  },
                  {
                    onSuccess: () => {
                      setAdding(false);
                      setNewName('');
                      setNewEmail('');
                      toast.success('Agent added.');
                    },
                    onError: reportError,
                  },
                );
              }}
            >
              Add agent
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" required>
            <Input
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
              }}
            />
          </Field>
          <Field label="Email" hint="Needed before they can be invited.">
            <Input
              type="email"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value);
              }}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
