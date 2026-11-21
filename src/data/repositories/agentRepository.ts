import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import type { DataIssue, InviteResult } from '@/domain';
import { ConflictError, ContentError, toContentError } from './contentRepository';

type Role = Database['public']['Enums']['app_role'];

export interface AgentProfile {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly role: Role;
  readonly supervisorId: string | null;
  readonly isActive: boolean;
  readonly dataIssues: readonly DataIssue[];
  readonly hasLogin: boolean;
  readonly invitedAt: string | null;
  readonly updatedAt: string;
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

interface RawProfile {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  supervisor_id: string | null;
  is_active: boolean;
  data_issues: DataIssue[];
  user_id: string | null;
  invited_at: string | null;
  updated_at: string;
  agent_survey_links: { bad_url: string | null; great_url: string | null }[];
}

const PROFILE_COLUMNS =
  'id, full_name, email, role, supervisor_id, is_active, data_issues, user_id, invited_at, updated_at, agent_survey_links ( bad_url, great_url )';

function toAgent(row: RawProfile): AgentProfile {
  const links = row.agent_survey_links[0];
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    supervisorId: row.supervisor_id,
    isActive: row.is_active,
    dataIssues: row.data_issues,
    hasLogin: row.user_id !== null,
    invitedAt: row.invited_at,
    updatedAt: row.updated_at,
    badUrl: links?.bad_url ?? null,
    greatUrl: links?.great_url ?? null,
  };
}

export async function listAgents(): Promise<readonly AgentProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('full_name')
    .overrideTypes<RawProfile[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map(toAgent);
}

export interface LoginStatus {
  readonly profileId: string;
  readonly invitedAt: string | null;
  readonly emailConfirmedAt: string | null;
  readonly lastSignInAt: string | null;
}

/** Managers only; the function raises 42501 for anyone else. */
export async function listLoginStatus(): Promise<readonly LoginStatus[]> {
  const { data, error } = await supabase.rpc('agent_login_status');
  if (error) throw toContentError(error);
  return data.map((row) => ({
    profileId: row.profile_id,
    invitedAt: row.invited_at,
    emailConfirmedAt: row.email_confirmed_at,
    lastSignInAt: row.last_sign_in_at,
  }));
}

export interface AgentUpdate {
  readonly fullName: string;
  readonly email: string | null;
  readonly role: Role;
  readonly supervisorId: string | null;
  readonly isActive: boolean;
  readonly dataIssues: readonly DataIssue[];
}

/** Turns the guard triggers' 42501 messages into something readable. */
function toAgentError(error: { message: string; code?: string }): ContentError {
  if (
    error.code === '42501' ||
    /Only a Super Admin|your own role|login link/i.test(error.message)
  ) {
    return new ContentError(error.message.replace(/^.*?:\s*/, ''));
  }
  return toContentError(error as never);
}

export async function updateAgent(
  id: string,
  loadedUpdatedAt: string,
  input: AgentUpdate,
): Promise<AgentProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName,
      email: input.email,
      role: input.role,
      supervisor_id: input.supervisorId,
      is_active: input.isActive,
      data_issues: [...input.dataIssues],
    })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(PROFILE_COLUMNS)
    .overrideTypes<RawProfile[], { merge: false }>();

  if (error) throw toAgentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toAgent(row);
}

export async function createAgent(input: Omit<AgentUpdate, 'dataIssues'>): Promise<void> {
  const { error } = await supabase.from('profiles').insert({
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    supervisor_id: input.supervisorId,
    is_active: input.isActive,
  });
  if (error) throw toAgentError(error);
}

export async function saveSurveyLinks(
  profileId: string,
  badUrl: string | null,
  greatUrl: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('agent_survey_links')
    .upsert(
      { profile_id: profileId, bad_url: badUrl, great_url: greatUrl },
      { onConflict: 'profile_id' },
    );
  if (error) throw toAgentError(error);
}

export async function inviteAgents(
  profileIds: readonly string[],
): Promise<readonly InviteResult[]> {
  const response = await supabase.functions.invoke<{ results: InviteResult[] }>('invite-agents', {
    body: { profileIds: [...profileIds] },
  });
  const error: unknown = response.error;
  const data = response.data;
  if (error) throw new ContentError('Could not send the invitations. Please try again.');
  return data?.results ?? [];
}

export interface AuditEntry {
  readonly id: number;
  readonly action: string;
  readonly changedAt: string;
  readonly changedByName: string | null;
  readonly oldData: unknown;
  readonly newData: unknown;
}

/** Managers only; RLS hides the audit log from everyone else. */
export async function listProfileAudit(profileId: string): Promise<readonly AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select(
      'id, action, changed_at, old_data, new_data, changed_by_profile:profiles!audit_log_changed_by_fkey ( full_name )',
    )
    .eq('table_name', 'profiles')
    .eq('record_id', profileId)
    .order('changed_at', { ascending: false })
    .limit(25)
    .overrideTypes<
      {
        id: number;
        action: string;
        changed_at: string;
        old_data: unknown;
        new_data: unknown;
        changed_by_profile: { full_name: string } | null;
      }[],
      { merge: false }
    >();
  if (error) throw toContentError(error);
  return data.map((row) => ({
    id: row.id,
    action: row.action,
    changedAt: row.changed_at,
    changedByName: row.changed_by_profile?.full_name ?? null,
    oldData: row.old_data,
    newData: row.new_data,
  }));
}
