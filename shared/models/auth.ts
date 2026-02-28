import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export interface OnboardingState {
  welcomeCompleted: boolean;
  dashboardGuideHidden: boolean;
  projectGuideShown: boolean;
  templateGuideShown: boolean;
  collectionGuideShown: boolean;
  completedAt: string | null;
  testMode?: boolean;
  firstProjectCreated?: boolean;
  firstTemplateCreated?: boolean;
  firstCollectionCreated?: boolean;
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  welcomeCompleted: false,
  dashboardGuideHidden: false,
  projectGuideShown: false,
  templateGuideShown: false,
  collectionGuideShown: false,
  completedAt: null,
  testMode: false,
};

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  onboardingState: jsonb("onboarding_state").$type<OnboardingState>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
