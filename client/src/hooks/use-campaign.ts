import { useQuery } from "@tanstack/react-query";
import type { Campaign } from "@shared/schema";

export function useActiveCampaign() {
  return useQuery<Campaign | null>({
    queryKey: ["/api/campaigns/active"],
    staleTime: 5 * 60 * 1000,
  });
}
