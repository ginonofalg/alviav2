import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import { insertWaitlistEntrySchema } from "@shared/schema";
import { z } from "zod";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get invite status for the authenticated user
  app.get("/api/auth/invite-status", isAuthenticated, async (req: any, res) => {
    try {
      const email = req.user.claims.email;
      if (!email) {
        return res.status(400).json({ message: "No email in user claims" });
      }
      
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

  // Submit to waitlist (for authenticated but non-invited users)
  app.post("/api/waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const claims = req.user.claims;
      const email = claims.email;
      
      if (!email) {
        return res.status(400).json({ message: "No email in user claims" });
      }

      // Validate request body
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
          errors: parsed.error.flatten().fieldErrors 
        });
      }

      const entry = await storage.createWaitlistEntry({
        email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        replitUserId: claims.sub,
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
        }
      });
    } catch (error) {
      console.error("Error adding to waitlist:", error);
      res.status(500).json({ message: "Failed to add to waitlist" });
    }
  });
}
