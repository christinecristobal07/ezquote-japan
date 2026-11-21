import { ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, Spinner } from '@/components/ui';
import { supabase } from '@/data/supabaseClient';
import { formatClosingBlock } from '@/domain';
import { ROLE_LABELS } from '@/app/roleLabels';
import { useAuth } from '@/features/auth/useAuth';

interface MyLinks {
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

/**
 * RLS already restricts agent_survey_links to the signed-in agent's own row,
 * so this reads the table directly rather than going through the manager-only
 * agent repository.
 */
async function fetchMyLinks(profileId: string): Promise<MyLinks> {
  const { data, error } = await supabase
    .from('agent_survey_links')
    .select('bad_url, great_url')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { badUrl: data?.bad_url ?? null, greatUrl: data?.great_url ?? null };
}

function LinkRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2 text-sm">
      <span className="w-16 font-medium text-slate-700">{label}</span>
      {url === null ? (
        <Badge tone="warning">Not set</Badge>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-slate-600">{url}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 inline-flex items-center gap-1 hover:underline"
          >
            Open <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        </>
      )}
    </div>
  );
}

export function MyProfilePage() {
  const { profile } = useAuth();
  const links = useQuery({
    queryKey: ['myLinks', profile?.id ?? 'none'],
    queryFn: () => fetchMyLinks(profile?.id ?? ''),
    enabled: profile !== null,
  });

  if (profile === null) return <Spinner label="Loading your profile…" />;

  return (
    <>
      <PageHeader title="My profile" description="Your details and Rate My Service links." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{profile.fullName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 text-slate-500">Email</dt>
                <dd className="text-slate-800">{profile.email ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 text-slate-500">Role</dt>
                <dd>
                  <Badge tone="info">{ROLE_LABELS[profile.role]}</Badge>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rate My Service" description="These go out with your quotations." />
          <CardBody>
            {links.isPending ? (
              <Spinner label="Loading your links…" />
            ) : (
              <>
                <LinkRow label="Bad" url={links.data?.badUrl ?? null} />
                <LinkRow label="Great" url={links.data?.greatUrl ?? null} />
                <Alert tone="info" className="mt-4">
                  Ask an admin to update these.
                </Alert>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="How you sign off" description="The closing block of your quotations." />
        <CardBody>
          <pre className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">
            {formatClosingBlock({
              agentName: profile.fullName,
              badUrl: links.data?.badUrl ?? null,
              greatUrl: links.data?.greatUrl ?? null,
            })}
          </pre>
        </CardBody>
      </Card>
    </>
  );
}
