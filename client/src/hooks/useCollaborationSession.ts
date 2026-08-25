import { collaborationApi } from "@/lib/collaboration-api";
import { useQuery } from "@tanstack/react-query";

export function useCollaborationSession(
  _options: { bootstrapAdmin?: boolean } = {}
) {
  const session = useQuery({
    queryKey: ["collaboration", "session"],
    queryFn: collaborationApi.session,
    staleTime: 30_000,
  });
  return {
    user: session.data?.user ?? null,
    isLoading: session.isLoading,
    error: session.error,
    refresh: () => session.refetch(),
  };
}
