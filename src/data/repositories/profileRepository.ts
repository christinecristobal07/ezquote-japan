import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import type { Role } from '@/domain/permissions';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface CurrentProfile {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly role: Role;
  readonly isActive: boolean;
  readonly supervisorId: string | null;
}

const COLUMNS = 'id, full_name, email, role, is_active, supervisor_id' as const;

type SelectedProfile = Pick<
  ProfileRow,
  'id' | 'full_name' | 'email' | 'role' | 'is_active' | 'supervisor_id'
>;

function toProfile(row: SelectedProfile): CurrentProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    supervisorId: row.supervisor_id,
  };
}

/**
 * The signed-in user's profile, or null.
 *
 * Null means "no profile this user may read". RLS hides inactive profiles, so
 * a deactivated or unapproved account lands here too — the app treats that as
 * pending approval rather than guessing why.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId === undefined) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  return data === null ? null : toProfile(data);
}
