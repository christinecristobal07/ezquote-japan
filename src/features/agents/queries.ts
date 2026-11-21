import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAgent,
  inviteAgents,
  listAgents,
  listLoginStatus,
  listProfileAudit,
  saveSurveyLinks,
  updateAgent,
  type AgentUpdate,
} from '@/data/repositories/agentRepository';

export const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
  loginStatus: () => [...agentKeys.all, 'loginStatus'] as const,
  audit: (profileId: string) => [...agentKeys.all, 'audit', profileId] as const,
};

export function useAgents() {
  return useQuery({ queryKey: agentKeys.list(), queryFn: listAgents });
}

/** Managers only. A non-manager gets 42501, so the query is left disabled. */
export function useLoginStatus(enabled: boolean) {
  return useQuery({
    queryKey: agentKeys.loginStatus(),
    queryFn: listLoginStatus,
    enabled,
    retry: false,
  });
}

export function useProfileAudit(profileId: string | null) {
  return useQuery({
    queryKey: agentKeys.audit(profileId ?? 'none'),
    queryFn: () => listProfileAudit(profileId ?? ''),
    enabled: profileId !== null,
    retry: false,
  });
}

export function useSaveAgent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      updatedAt: string;
      values: AgentUpdate;
      badUrl: string | null;
      greatUrl: string | null;
    }) => {
      const saved = await updateAgent(input.id, input.updatedAt, input.values);
      await saveSurveyLinks(input.id, input.badUrl, input.greatUrl);
      return saved;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useCreateAgent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useInviteAgents() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (profileIds: readonly string[]) => inviteAgents(profileIds),
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useBulkUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rows: readonly { id: string; updatedAt: string; values: AgentUpdate }[];
    }) => {
      for (const row of input.rows) {
        await updateAgent(row.id, row.updatedAt, row.values);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: agentKeys.all }),
  });
}
