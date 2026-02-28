import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth as useClerkAuth, useClerk } from "@clerk/clerk-react";
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

export function useAuth() {
  const queryClient = useQueryClient();
  const { isSignedIn, isLoaded: clerkLoaded } = useClerkAuth();
  const { signOut } = useClerk();

  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    enabled: !!isSignedIn,
  });

  const { data: inviteStatus, isLoading: isLoadingInvite } = useQuery<InviteStatus | null>({
    queryKey: ["/api/auth/invite-status"],
    queryFn: fetchInviteStatus,
    retry: false,
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  const isAuthenticated = !!isSignedIn && !!user;
  const isInvited = inviteStatus?.isInvited ?? false;
  const isOnWaitlist = inviteStatus?.isOnWaitlist ?? false;

  const handleLogout = async () => {
    await signOut();
    queryClient.setQueryData(["/api/auth/user"], null);
    queryClient.setQueryData(["/api/auth/invite-status"], null);
  };

  return {
    user,
    isLoading: !clerkLoaded || isLoadingUser || (isAuthenticated && isLoadingInvite),
    isAuthenticated,
    isInvited,
    isOnWaitlist,
    email: inviteStatus?.email ?? user?.email ?? null,
    logout: handleLogout,
    isLoggingOut: false,
  };
}
