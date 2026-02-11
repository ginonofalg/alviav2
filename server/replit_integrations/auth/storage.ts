import { users, type User, type UpsertUser, type OnboardingState, DEFAULT_ONBOARDING_STATE } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateOnboardingState(userId: string, partial: Partial<OnboardingState>): Promise<OnboardingState>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateOnboardingState(userId: string, partial: Partial<OnboardingState>): Promise<OnboardingState> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    const current: OnboardingState = (user.onboardingState as OnboardingState) ?? { ...DEFAULT_ONBOARDING_STATE };
    const updated: OnboardingState = { ...current, ...partial };

    await db
      .update(users)
      .set({ onboardingState: updated, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return updated;
  }
}

export const authStorage = new AuthStorage();
