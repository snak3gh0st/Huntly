import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Proposal, Tier } from '../types/proposal';

const apiKey = () => localStorage.getItem('huntly_api_key') ?? '';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), {
      status: res.status,
      body,
    });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function useLeadProposals(leadId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['proposals', 'lead', leadId],
    queryFn: () => api<Proposal[]>(`/api/leads/${leadId}/proposals`),
    enabled: opts?.enabled ?? true,
  });
}

export function useProposal(id: string | null, opts?: { pollingMs?: number }) {
  return useQuery({
    queryKey: ['proposal', id],
    queryFn: () => api<Proposal>(`/api/proposals/${id}`),
    enabled: !!id,
    refetchInterval: opts?.pollingMs,
  });
}

export function useGenerateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, notes }: { leadId: string; notes?: string }) =>
      api<{ id: string; status: string; token: string }>(`/api/leads/${leadId}/proposals`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['proposals', 'lead', leadId] });
    },
  });
}

export function usePatchProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { finalTier?: Tier; paymentLinkUrl?: string | null; content?: unknown } }) =>
      api<Proposal>(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(['proposal', data.id], data);
    },
  });
}

export function useProposalAction(action: 'regenerate' | 'approve' | 'send-email' | 'mark-paid' | 'deploy' | 'send-delivery') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: unknown }) =>
      api<Proposal | { sent: boolean; messageId: string }>(
        `/api/proposals/${id}/${action}`,
        { method: 'POST', body: body ? JSON.stringify(body) : undefined },
      ),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['proposal', id] });
    },
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; leadId: string }) =>
      api<void>(`/api/proposals/${id}`, { method: 'DELETE' }),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['proposals', 'lead', leadId] });
    },
  });
}
