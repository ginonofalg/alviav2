import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

interface InviteStatus {
  isInvited: boolean;
  isOnWaitlist: boolean;
  email: string;
}

async function fetchInviteStatus(): Promise<InviteStatus | null> {
  const response = await fetch("/api/auth/invite-status", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: inviteStatus, isLoading: isLoadingInvite } = useQuery<InviteStatus | null>({
    queryKey: ["/api/auth/invite-status"],
    queryFn: fetchInviteStatus,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user, // Only fetch if user is authenticated
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.setQueryData(["/api/auth/invite-status"], null);
    },
  });

  const isAuthenticated = !!user;
  const isInvited = inviteStatus?.isInvited ?? false;
  const isOnWaitlist = inviteStatus?.isOnWaitlist ?? false;

  return {
    user,
    isLoading: isLoadingUser || (isAuthenticated && isLoadingInvite),
    isAuthenticated,
    isInvited,
    isOnWaitlist,
    email: inviteStatus?.email ?? user?.email ?? null,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
