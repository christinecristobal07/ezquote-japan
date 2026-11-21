import type { AgentProfile } from '@/data/repositories/agentRepository';
import type { Role } from '@/domain/permissions';

export interface AgentEditorValues {
  fullName: string;
  email: string;
  role: Role;
  supervisorId: string | null;
  isActive: boolean;
  badUrl: string;
  greatUrl: string;
}

export function toEditorValues(agent: AgentProfile): AgentEditorValues {
  return {
    fullName: agent.fullName,
    email: agent.email ?? '',
    role: agent.role,
    supervisorId: agent.supervisorId,
    isActive: agent.isActive,
    badUrl: agent.badUrl ?? '',
    greatUrl: agent.greatUrl ?? '',
  };
}
