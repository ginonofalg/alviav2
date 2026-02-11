import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export interface OnboardingState {
  welcomeCompleted: boolean;
  dashboardGuideHidden: boolean;
  projectGuideShown: boolean;
  templateGuideShown: boolean;
  collectionGuideShown: boolean;
  completedAt: string | null;
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  welcomeCompleted: false,
  dashboardGuideHidden: false,
  projectGuideShown: false,
  templateGuideShown: false,
  collectionGuideShown: false,
  completedAt: null,
};

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
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
