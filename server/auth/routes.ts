import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, getUserId } from "./middleware";
import { syncClerkUser } from "./sync";
import { storage } from "../storage";
import { z } from "zod";
import type { OnboardingState } from "@shared/models/auth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const clerkUserId = getUserId(req);

      let email: string | undefined;
      let firstName: string | undefined;
      let lastName: string | undefined;
      let imageUrl: string | undefined;

      try {
        const { clerkClient } = await import("@clerk/express");
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress;
        firstName = clerkUser.firstName ?? undefined;
        lastName = clerkUser.lastName ?? undefined;
        imageUrl = clerkUser.imageUrl ?? undefined;
      } catch (err) {
        console.error("[auth] Failed to fetch Clerk user details, falling back to DB lookup:", err);
      }

      let user;
      if (email) {
        user = await syncClerkUser(clerkUserId, email, firstName ?? null, lastName ?? null, imageUrl ?? null);
      } else {
        user = await authStorage.getUser(clerkUserId);
        if (!user) {
          user = await authStorage.upsertUser({
            id: clerkUserId,
            email: null,
            firstName: null,
            lastName: null,
            profileImageUrl: null,
          });
        }
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/auth/invite-status", isAuthenticated, async (req: any, res) => {
    try {
      const clerkUserId = getUserId(req);
      const user = await authStorage.getUser(clerkUserId);

      if (!user?.email) {
        return res.status(400).json({ message: "No email associated with user" });
      }

      const email = user.email;
      const isInvited = await storage.isEmailInvited(email);
      const waitlistEntry = await storage.getWaitlistEntryByEmail(email);

      res.json({
        isInvited,
        isOnWaitlist: !!waitlistEntry,
        email,
      });
    } catch (error) {
      console.error("Error checking invite status:", error);
      res.status(500).json({ message: "Failed to check invite status" });
    }
  });

  app.post("/api/waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const clerkUserId = getUserId(req);
      const user = await authStorage.getUser(clerkUserId);

      if (!user?.email) {
        return res.status(400).json({ message: "No email associated with user" });
      }

      const waitlistSchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        consentNewsletter: z.boolean().default(false),
        consentMarketing: z.boolean().default(false),
      });

      const parsed = waitlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const entry = await storage.createWaitlistEntry({
        email: user.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        replitUserId: clerkUserId,
        consentNewsletter: parsed.data.consentNewsletter,
        consentMarketing: parsed.data.consentMarketing,
      });

      res.json({
        success: true,
        message: "You've been added to the waitlist!",
        entry: {
          id: entry.id,
          email: entry.email,
          submittedAt: entry.submittedAt,
        },
      });
    } catch (error) {
      console.error("Error adding to waitlist:", error);
      res.status(500).json({ message: "Failed to add to waitlist" });
    }
  });

  const onboardingSchema = z.object({
    welcomeCompleted: z.boolean().optional(),
    dashboardGuideHidden: z.boolean().optional(),
    projectGuideShown: z.boolean().optional(),
    templateGuideShown: z.boolean().optional(),
    collectionGuideShown: z.boolean().optional(),
    completedAt: z.string().nullable().optional(),
    testMode: z.boolean().optional(),
    firstProjectCreated: z.boolean().optional(),
    firstTemplateCreated: z.boolean().optional(),
    firstCollectionCreated: z.boolean().optional(),
  });

  app.patch("/api/auth/onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const parsed = onboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
      }
      const updated = await authStorage.updateOnboardingState(userId, parsed.data as Partial<OnboardingState>);
      res.json(updated);
    } catch (error) {
      console.error("Error updating onboarding state:", error);
      res.status(500).json({ message: "Failed to update onboarding state" });
    }
  });
}
