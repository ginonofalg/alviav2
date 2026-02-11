import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { OnboardingState } from "@shared/models/auth";
import { DEFAULT_ONBOARDING_STATE } from "@shared/models/auth";

interface DashboardStats {
  projectCount: number;
  templateCount: number;
  collectionCount: number;
}

export function useOnboarding() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const completedAtSetRef = useRef(false);

  const rawState = user?.onboardingState as OnboardingState | null | undefined;
  const isExistingUserWithoutOnboarding = !rawState && isAuthenticated;

  const state: OnboardingState = rawState ?? { ...DEFAULT_ONBOARDING_STATE };

  const inTestMode = !!state.testMode;

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated && (inTestMode || !state.completedAt),
  });

  const statsResolved = !statsLoading || !!stats;
  const existingUserHasData = isExistingUserWithoutOnboarding && (stats?.projectCount ?? 0) > 1;

  const milestones = {
    demoExplored: (stats?.projectCount ?? 0) > 0,
    projectCreated: !!state.firstProjectCreated || (stats?.projectCount ?? 0) > 1,
    templateCreated: !!state.firstTemplateCreated || (stats?.templateCount ?? 0) > 1,
    collectionCreated: !!state.firstCollectionCreated || (stats?.collectionCount ?? 0) > 0,
  };

  const completedCount = Object.values(milestones).filter(Boolean).length;
  const progress = completedCount / 4;
  const allComplete = completedCount === 4;

  const updateMutation = useMutation({
    mutationFn: async (partial: Partial<OnboardingState>) => {
      const res = await apiRequest("PATCH", "/api/auth/onboarding", partial);
      return res.json() as Promise<OnboardingState>;
    },
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: ["/api/auth/user"] });
      const previousUser = queryClient.getQueryData(["/api/auth/user"]);
      queryClient.setQueryData(["/api/auth/user"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          onboardingState: { ...state, ...partial },
        };
      });
      return { previousUser };
    },
    onError: (_err, _partial, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(["/api/auth/user"], context.previousUser);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const updateOnboarding = (partial: Partial<OnboardingState>) => {
    updateMutation.mutate(partial);
  };

  useEffect(() => {
    if (allComplete && !state.completedAt && !inTestMode && !completedAtSetRef.current && statsResolved) {
      completedAtSetRef.current = true;
      updateOnboarding({ completedAt: new Date().toISOString() });
    }
  }, [allComplete, state.completedAt, inTestMode, statsResolved]);

  const waitingForStats = isExistingUserWithoutOnboarding && !statsResolved;
  const isOnboarding = inTestMode || (!state.completedAt && !existingUserHasData && !waitingForStats);
  const showWelcome = isOnboarding && !state.welcomeCompleted;
  const showDashboardCard = isOnboarding && !state.dashboardGuideHidden && !allComplete;
  const showProjectGuide = isOnboarding && !state.projectGuideShown;
  const showTemplateGuide = isOnboarding && !state.templateGuideShown;
  const showCollectionGuide = isOnboarding && !state.collectionGuideShown;

  return {
    state,
    milestones,
    progress,
    completedCount,
    allComplete,
    isOnboarding,
    showWelcome,
    showDashboardCard,
    showProjectGuide,
    showTemplateGuide,
    showCollectionGuide,
    updateOnboarding,
    isUpdating: updateMutation.isPending,
  };
}
