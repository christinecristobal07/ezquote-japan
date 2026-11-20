import { AuthCard } from '@/components/ui/Form';
import { useAuth } from './useAuth';

/**
 * Shown when a signed-in user has no readable profile. RLS hides inactive and
 * unapproved profiles alike, so the app cannot tell the two apart and says the
 * one thing that is true of both.
 */
export function PendingApprovalPage() {
  const { signOut } = useAuth();

  return (
    <AuthCard title="Account pending approval">
      <p className="text-sm text-slate-600">
        Your sign-in worked, but your account has not been activated yet. A manager needs to approve
        it before you can use EZQUOTE. Please check back later.
      </p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 w-full rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
      >
        Sign out
      </button>
    </AuthCard>
  );
}
