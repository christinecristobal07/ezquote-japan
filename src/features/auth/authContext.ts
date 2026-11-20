import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CurrentProfile } from '@/data/repositories/profileRepository';

export type AuthStatus = 'loading' | 'signedOut' | 'pendingApproval' | 'signedIn';

export interface AuthValue {
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly profile: CurrentProfile | null;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);
