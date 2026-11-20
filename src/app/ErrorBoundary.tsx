import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button, Card, CardBody } from '@/components/ui';

function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    return { title: `${String(error.status)} ${error.statusText}`, detail: String(error.data) };
  }
  if (error instanceof Error) return { title: error.message, detail: error.stack ?? '' };
  return { title: 'Unknown error', detail: String(error) };
}

function ErrorView({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { title, detail } = describe(error);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardBody>
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page could not be shown. Trying again usually helps; if it keeps happening, tell the
            team what you were doing.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={onRetry}>Try again</Button>
            <Button
              variant="secondary"
              onClick={() => {
                globalThis.location.assign('/');
              }}
            >
              Go to dashboard
            </Button>
          </div>
          {import.meta.env.DEV && (
            <details className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-medium">Technical details (dev only)</summary>
              <p className="mt-2 font-semibold">{title}</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{detail}</pre>
            </details>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

/** Route-level handler: react-router catches render and loader errors here. */
export function RouteErrorElement() {
  const error = useRouteError();
  const navigate = useNavigate();
  return (
    <ErrorView
      error={error}
      onRetry={() => {
        void navigate(0);
      }}
    />
  );
}

interface BoundaryState {
  error: unknown;
}

/** Last-resort boundary for anything thrown outside the router. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <ErrorView
          error={this.state.error}
          onRetry={() => {
            globalThis.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
