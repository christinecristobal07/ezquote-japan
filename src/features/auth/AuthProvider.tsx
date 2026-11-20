import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import {
  getSession,
  onAuthStateChange,
  signOut as repoSignOut,
} from '@/data/repositories/authRepository';
import { getCurrentProfile, type CurrentProfile } from '@/data/repositories/profileRepository';
import { AuthContext, type AuthStatus, type AuthValue } from './authContext';

export type { AuthStatus, AuthValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void getSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setSessionLoaded(true);
      });

    const subscription = onAuthStateChange((next) => {
      setSession(next);
      setSessionLoaded(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const profileQuery = useQuery<CurrentProfile | null>({
    queryKey: ['profile', userId],
    queryFn: getCurrentProfile,
    enabled: userId !== null,
    // A deactivated account loses its readable profile, so re-checking on focus
    // locks the person out without waiting for a reload.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  });

  const profile: CurrentProfile | null = profileQuery.data ?? null;
  const profilePending = profileQuery.status === 'pending';

  const value = useMemo<AuthValue>(() => {
    const signOutAndClear = async (): Promise<void> => {
      await repoSignOut();
      setSession(null);
      queryClient.clear();
    };

    let status: AuthStatus;
    if (!sessionLoaded) {
      status = 'loading';
    } else if (session === null) {
      status = 'signedOut';
    } else if (profilePending) {
      status = 'loading';
    } else if (profile === null) {
      // RLS hides inactive and unapproved profiles alike, so null covers both.
      status = 'pendingApproval';
    } else {
      status = 'signedIn';
    }

    return { status, session, profile, signOut: signOutAndClear };
  }, [queryClient, session, sessionLoaded, profile, profilePending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
