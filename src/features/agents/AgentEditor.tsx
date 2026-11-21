import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
} from '@/components/ui';
import {
  checkSurveyLink,
  computeDataIssues,
  formatClosingBlock,
  formatGreeting,
  type DataIssue,
  type LinkOwner,
} from '@/domain';
import { ROLE_LABELS } from '@/app/roleLabels';
import type { AgentProfile } from '@/data/repositories/agentRepository';
import type { Role } from '@/domain/permissions';
import type { AgentEditorValues } from './agentEditorValues';
import { useProfileAudit } from './queries';

const ALL_ROLES: readonly Role[] = [
  'super_admin',
  'product_development',
  'admin',
  'sales_supervisor',
  'sales_agent',
];

export interface AgentEditorProps {
  readonly agent: AgentProfile;
  readonly values: AgentEditorValues;
  readonly allAgents: readonly AgentProfile[];
  /** The signed-in user, so we can block self-edits of role and active. */
  readonly currentProfileId: string;
  readonly currentRole: Role;
  readonly busy?: boolean;
  onChange: (values: AgentEditorValues) => void;
  onSave: (issues: readonly DataIssue[]) => void;
  onCancel: () => void;
}

export function AgentEditor({
  agent,
  values,
  allAgents,
  currentProfileId,
  currentRole,
  busy = false,
  onChange,
  onSave,
  onCancel,
}: AgentEditorProps) {
  const [showAudit, setShowAudit] = useState(false);
  const audit = useProfileAudit(showAudit ? agent.id : null);

  const isSelf = agent.id === currentProfileId;
  const canGrantSuperAdmin = currentRole === 'super_admin';

  const owners: readonly LinkOwner[] = useMemo(
    () =>
      allAgents.map((other) => ({
        profileId: other.id,
        fullName: other.fullName,
        badUrl: other.badUrl,
        greatUrl: other.greatUrl,
      })),
    [allAgents],
  );

  const issues = computeDataIssues(
    { profileId: agent.id, fullName: values.fullName, email: values.email || null },
    { badUrl: values.badUrl || null, greatUrl: values.greatUrl || null },
    owners,
  );

  const badVerdict = checkSurveyLink(values.badUrl || null, 'bad');
  const greatVerdict = checkSurveyLink(values.greatUrl || null, 'great');

  function set<K extends keyof AgentEditorValues>(key: K, value: AgentEditorValues[K]): void {
    onChange({ ...values, [key]: value });
  }

  const supervisors = allAgents.filter(
    (other) => other.role === 'sales_supervisor' && other.isActive,
  );

  const nameError = values.fullName.trim() === '' ? 'A name is required.' : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title={`Edit ${agent.fullName}`} />
        <CardBody className="space-y-4">
          <Field label="Full name" required error={nameError}>
            <Input
              value={values.fullName}
              onChange={(event) => {
                set('fullName', event.target.value);
              }}
            />
          </Field>

          <Field
            label="Email"
            hint={
              agent.hasLogin
                ? "Changing a login email isn't supported yet."
                : 'Used to send the invitation and to link the login.'
            }
          >
            <Input
              type="email"
              value={values.email}
              readOnly={agent.hasLogin}
              disabled={agent.hasLogin}
              onChange={(event) => {
                set('email', event.target.value);
              }}
            />
          </Field>

          <Field label="Role" hint={isSelf ? 'You cannot change your own role.' : undefined}>
            <Select
              value={values.role}
              disabled={isSelf}
              onChange={(event) => {
                set('role', event.target.value as Role);
              }}
            >
              {ALL_ROLES.filter(
                (role) => role !== 'super_admin' || canGrantSuperAdmin || values.role === role,
              ).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>

          {values.role === 'sales_agent' && (
            <Field label="Supervisor" hint="Who sees this agent's quotations.">
              <Select
                value={values.supervisorId ?? ''}
                onChange={(event) => {
                  set('supervisorId', event.target.value === '' ? null : event.target.value);
                }}
              >
                <option value="">None</option>
                {supervisors.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Checkbox
            label={isSelf ? 'Active (you cannot deactivate yourself)' : 'Active'}
            checked={values.isActive}
            disabled={isSelf}
            onChange={(event) => {
              set('isActive', event.target.checked);
            }}
          />

          <Field
            label="Bad link"
            error={badVerdict.kind === 'invalid' ? badVerdict.reason : undefined}
          >
            <Input
              value={values.badUrl}
              onChange={(event) => {
                set('badUrl', event.target.value);
              }}
            />
          </Field>
          {values.badUrl !== '' && (
            <a
              href={values.badUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 inline-flex items-center gap-1 text-sm hover:underline"
            >
              Open Bad link <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          )}

          <Field
            label="Great link"
            error={greatVerdict.kind === 'invalid' ? greatVerdict.reason : undefined}
          >
            <Input
              value={values.greatUrl}
              onChange={(event) => {
                set('greatUrl', event.target.value);
              }}
            />
          </Field>
          {values.greatUrl !== '' && (
            <a
              href={values.greatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 inline-flex items-center gap-1 text-sm hover:underline"
            >
              Open Great link <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          )}

          {issues.notes.length > 0 && (
            <Alert tone="warning" title="Needs attention">
              <ul className="list-inside list-disc">
                {issues.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              loading={busy}
              disabled={nameError !== undefined}
              onClick={() => {
                onSave(issues.issues);
              }}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Closing block preview"
            description="How this agent signs off a quotation."
          />
          <CardBody>
            <pre className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">
              {[
                formatGreeting(values.fullName || agent.fullName),
                formatClosingBlock({
                  agentName: values.fullName || agent.fullName,
                  badUrl: issues.rejected.bad ? null : values.badUrl || null,
                  greatUrl: issues.rejected.great ? null : values.greatUrl || null,
                }),
              ]
                .filter((part): part is string => part !== null)
                .join('\n\n')}
            </pre>
            {(issues.rejected.bad || issues.rejected.great) && (
              <p className="mt-2 text-xs text-slate-600">
                Rejected links are left out of the preview, as they would be of a quotation.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="History"
            actions={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowAudit((value) => !value);
                }}
              >
                {showAudit ? 'Hide' : 'Show'}
              </Button>
            }
          />
          {showAudit && (
            <CardBody>
              {audit.isPending ? (
                <Spinner label="Loading history…" />
              ) : audit.error !== null ? (
                <p className="text-sm text-slate-600">Only managers can read the audit log.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {audit.data.map((entry) => (
                    <li key={entry.id} className="border-b border-slate-100 pb-2">
                      <Badge tone="neutral">{entry.action}</Badge>{' '}
                      <span className="text-slate-700">
                        {entry.changedByName ?? 'system'} ·{' '}
                        {new Date(entry.changedAt).toLocaleString('en-PH')}
                      </span>
                    </li>
                  ))}
                  {audit.data.length === 0 && (
                    <li className="text-slate-600">No changes recorded.</li>
                  )}
                </ul>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
