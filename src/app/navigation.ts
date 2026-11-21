import {
  BanknoteArrowUp,
  FileText,
  FilePlus2,
  LayoutDashboard,
  ScrollText,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { can, isManager, type Permission, type Role } from '@/domain/permissions';

export type NavGroupName = 'Sales' | 'Administration';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: LucideIcon;
  /** Omitted for items everyone signed in may reach. */
  readonly permission?: Permission;
  readonly group: NavGroupName;
  /** Managers see every quotation under Quotations, so Team is redundant for them. */
  readonly supervisorOnly?: boolean;
}

export interface NavGroup {
  readonly name: NavGroupName;
  readonly items: readonly NavItem[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Sales' },
  {
    label: 'New quotation',
    path: '/quotations/new',
    icon: FilePlus2,
    permission: 'quotation.create',
    group: 'Sales',
  },
  {
    label: 'Quotations',
    path: '/quotations',
    icon: FileText,
    permission: 'quotation.viewOwn',
    group: 'Sales',
  },
  {
    label: 'Team quotations',
    path: '/team/quotations',
    icon: UsersRound,
    permission: 'quotation.viewTeam',
    group: 'Sales',
    supervisorOnly: true,
  },
  {
    label: 'Rates & FX',
    path: '/admin/rates',
    icon: BanknoteArrowUp,
    permission: 'rates.manage',
    group: 'Administration',
  },
  {
    label: 'Content',
    path: '/admin/content',
    icon: ScrollText,
    permission: 'content.manage',
    group: 'Administration',
  },
  {
    label: 'Agents',
    path: '/admin/agents',
    icon: Users,
    permission: 'agents.manage',
    group: 'Administration',
  },
  {
    label: 'Audit log',
    path: '/audit',
    icon: ScrollText,
    permission: 'audit.view',
    group: 'Administration',
  },
];

const GROUP_ORDER: readonly NavGroupName[] = ['Sales', 'Administration'];

export function visibleNavItems(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.supervisorOnly === true && isManager(role)) return false;
    if (item.permission === undefined) return true;
    return can(role, item.permission);
  });
}

/** Groups with no visible items are dropped, so no empty headings render. */
export function visibleNavGroups(role: Role): readonly NavGroup[] {
  const items = visibleNavItems(role);
  return GROUP_ORDER.map((name) => ({
    name,
    items: items.filter((item) => item.group === name),
  })).filter((group) => group.items.length > 0);
}

/**
 * Which nav item should look active for a given URL.
 *
 * A NavLink highlights on a prefix match, so "/quotations" lit up while the
 * agent was on "/quotations/new" — two items active at once, and neither
 * obviously the one they had clicked. The most specific item wins instead:
 * "/quotations/new" owns its own URL, while "/quotations/<id>" still belongs
 * to "Quotations", which is where an agent would look for an open quotation.
 */
export function activeNavPath(pathname: string, paths: readonly string[]): string | null {
  const current = pathname.replace(/\/+$/, '') || '/';

  const matches = paths.filter((path) => {
    if (path === '/') return current === '/';
    const base = path.replace(/\/+$/, '');
    // A segment boundary, so "/quotations" does not match "/quotationsfoo".
    return current === base || current.startsWith(`${base}/`);
  });

  if (matches.length === 0) return null;
  return matches.reduce((best, path) => (path.length > best.length ? path : best));
}
