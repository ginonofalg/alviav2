import { db } from "../db";
import { users } from "@shared/models/auth";
import { workspaces, workspaceMembers, respondents, inviteList, waitlistEntries, simulationRuns } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { authStorage } from "./storage";
import { seedDemoProjectIfNeeded } from "../demo-seed";

export async function syncClerkUser(
  clerkUserId: string,
  clerkEmail: string,
  clerkFirstName: string | null,
  clerkLastName: string | null,
  clerkProfileImageUrl: string | null
) {
  const existingById = await authStorage.getUser(clerkUserId);
  if (existingById) {
    return await authStorage.upsertUser({
      id: clerkUserId,
      email: clerkEmail,
      firstName: clerkFirstName,
      lastName: clerkLastName,
      profileImageUrl: clerkProfileImageUrl,
    });
  }

  const existingByEmail = await authStorage.getUserByEmail(clerkEmail);
  if (existingByEmail) {
    const oldId = existingByEmail.id;
    console.log(`[auth-sync] Migrating user ${clerkEmail} from ${oldId} to ${clerkUserId}`);

    await db.transaction(async (tx) => {
      await tx.update(workspaces).set({ ownerId: clerkUserId }).where(eq(workspaces.ownerId, oldId));
      await tx.update(workspaceMembers).set({ userId: clerkUserId }).where(eq(workspaceMembers.userId, oldId));
      await tx.update(respondents).set({ userId: clerkUserId }).where(eq(respondents.userId, oldId));
      await tx.update(inviteList).set({ addedBy: clerkUserId }).where(eq(inviteList.addedBy, oldId));
      await tx.update(waitlistEntries).set({ replitUserId: clerkUserId }).where(eq(waitlistEntries.replitUserId, oldId));
      await tx.update(simulationRuns).set({ launchedBy: clerkUserId }).where(eq(simulationRuns.launchedBy, oldId));

      await tx.update(users).set({
        id: clerkUserId,
        email: clerkEmail,
        firstName: clerkFirstName,
        lastName: clerkLastName,
        profileImageUrl: clerkProfileImageUrl,
        updatedAt: new Date(),
      }).where(eq(users.id, oldId));
    });

    console.log(`[auth-sync] Successfully migrated user ${clerkEmail} from ${oldId} to ${clerkUserId}`);
    return await authStorage.getUser(clerkUserId);
  }

  const newUser = await authStorage.upsertUser({
    id: clerkUserId,
    email: clerkEmail,
    firstName: clerkFirstName,
    lastName: clerkLastName,
    profileImageUrl: clerkProfileImageUrl,
  });

  seedDemoProjectIfNeeded(clerkUserId).catch((err) => {
    console.error("[auth-sync] Failed to seed demo project:", err);
  });

  return newUser;
}
