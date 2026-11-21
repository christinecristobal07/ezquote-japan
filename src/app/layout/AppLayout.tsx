import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, LogOut, Menu, UserRound, X } from 'lucide-react';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { ROLE_LABELS } from '@/app/roleLabels';
import { cn } from '@/lib/cn';
import { SidebarNav } from './Sidebar';

const FOOTER_TEXT =
  'This tool is exclusively owned by Gladex Travel and Tours Corp. Any redistribution or reproduction of part or all of the contents in any form is prohibited.';

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('leading-tight', compact && 'text-center')}>
      <p className="text-sm font-semibold text-slate-900">EZQUOTE Japan</p>
      {!compact && <p className="text-xs text-slate-500">Gladex Travel &amp; Tours</p>}
    </div>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape closes the drawer and hands focus back to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        hamburgerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  // Move focus into the drawer so the keyboard does not stay behind it.
  useEffect(() => {
    if (drawerOpen) drawerRef.current?.focus();
  }, [drawerOpen]);

  if (profile === null) return null;

  const role = profile.role;
  const roleLabel = ROLE_LABELS[role];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a
        href="#main-content"
        className="focus:bg-brand-600 sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <IconButton
          ref={hamburgerRef}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav"
          className="md:hidden"
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </IconButton>

        <Brand />

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"
              >
                <span className="bg-brand-600 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white">
                  {profile.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{profile.fullName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <span className="block font-medium text-slate-900">{profile.fullName}</span>
                {profile.email !== null && <span className="block">{profile.email}</span>}
                <Badge tone="info" className="mt-1">
                  {roleLabel}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void navigate('/me');
                }}
              >
                <span className="flex items-center gap-2">
                  <UserRound aria-hidden="true" className="h-4 w-4" />
                  My profile
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                danger
                onSelect={() => {
                  void signOut();
                }}
              >
                <span className="flex items-center gap-2">
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  Sign out
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            'hidden shrink-0 flex-col border-r border-slate-200 bg-white md:flex',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <SidebarNav role={role} collapsed={collapsed} />
          <div className="border-t border-slate-200 p-2">
            <IconButton
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => {
                setCollapsed((value) => !value);
              }}
            >
              {collapsed ? (
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              )}
            </IconButton>
          </div>
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Click-to-dismiss only. Escape and the Close button are the
                keyboard paths, so this stays out of the tab order rather than
                being a second control with the same name. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => {
                setDrawerOpen(false);
                hamburgerRef.current?.focus();
              }}
            />
            <div
              id="mobile-nav"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl"
            >
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <Brand />
                <IconButton
                  aria-label="Close menu"
                  onClick={() => {
                    setDrawerOpen(false);
                    hamburgerRef.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </IconButton>
              </div>
              <SidebarNav
                role={role}
                onNavigate={() => {
                  setDrawerOpen(false);
                }}
              />
            </div>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-xs text-slate-500 md:px-8">
        {FOOTER_TEXT}
      </footer>
    </div>
  );
}
