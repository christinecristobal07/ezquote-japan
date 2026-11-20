import type { Role } from '@/domain/permissions';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  product_development: 'Product Development',
  admin: 'Admin',
  sales_supervisor: 'Sales Supervisor',
  sales_agent: 'Sales Agent',
};
