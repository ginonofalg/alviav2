import type { Express } from "express";
import { getAuth } from "@clerk/express";
import crypto from "crypto";
import { storage } from "../storage";
import type { ReviewRatings } from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const reviewRatingsSchema = z.object({
  questionClarity: z.number().min(1).max(5).nullable().optional(),
  alviaUnderstanding: z.number().min(1).max(5).nullable().optional(),
  conversationFlow: z.number().min(1).max(5).nullable().optional(),
  comfortLevel: z.number().min(1).max(5).nullable().optional(),
  technicalQuality: z.number().min(1).max(5).nullable().optional(),
  overallExperience: z.number().min(1).max(5).nullable().optional(),
});

const submitReviewSchema = z.object({
  ratings: reviewRatingsSchema.optional(),
  segmentComments: z.array(z.object({
    segmentId: z.string().min(1),
    comment: z.string().max(2000),
  })).optional(),
  closingComments: z.string().max(5000).optional(),
  skipped: z.boolean().optional(),
});

async function validateReviewAccess(sessionId: string, tokenHeader: string | undefined, req: any): Promise<{ valid: boolean; session: any; error?: string; statusCode?: number }> {
  const session = await storage.getSession(sessionId);
  if (!session) {
    return { valid: false, session: null, error: "Session not found", statusCode: 404 };
  }

  if (getAuth(req)?.userId) {
    return { valid: true, session };
  }

  if (tokenHeader) {
    const tokenHash = crypto.createHash("sha256").update(tokenHeader).digest("hex");
    if (session.reviewAccessToken === tokenHash) {
      if (session.reviewAccessExpiresAt && new Date() > session.reviewAccessExpiresAt) {
        return { valid: false, session, error: "Review window has expired", statusCode: 410 };
      }
      return { valid: true, session };
    }
  }

  if (session.reviewCompletedAt) {
    return { valid: false, session, error: "Review already submitted", statusCode: 400 };
  }

  if (session.status === "completed" && !session.reviewAccessToken) {
    return { valid: true, session };
  }

  return { valid: false, session: null, error: "Unauthorized", statusCode: 401 };
}

export function registerReviewRoutes(app: Express) {
  app.get("/api/sessions/:id/review", async (req, res) => {
    try {
      const tokenHeader = req.headers["x-review-token"] as string | undefined;
      const { valid, session, error, statusCode } = await validateReviewAccess(req.params.id, tokenHeader, req);
      
      if (!valid) {
        return res.status(statusCode || 401).json({ message: error });
      }

      if (session.status !== "completed") {
        return res.status(400).json({ message: "Session not completed" });
      }

      const fullSession = await storage.getSession(req.params.id);
      if (!fullSession) {
        return res.status(404).json({ message: "Session not found" });
      }

      const collection = await storage.getCollection(fullSession.collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      const questions = await storage.getQuestionsByTemplate(collection.templateId);
      
      const liveTranscript = (fullSession.liveTranscript || []) as Array<{ speaker: string; text: string; timestamp: number; questionIndex: number }>;
      const questionSummaries = (fullSession.questionSummaries || []) as Array<{ questionIndex: number; respondentSummary: string; keyInsights: string[] }>;

      const transcriptByQuestion = new Map<number, string>();
      for (const entry of liveTranscript) {
        const existing = transcriptByQuestion.get(entry.questionIndex) || "";
        const speaker = entry.speaker === "alvia" ? "Alvia" : "You";
        transcriptByQuestion.set(entry.questionIndex, existing + `${speaker}: ${entry.text}\n\n`);
      }

      const summaryByQuestion = new Map<number, { respondentSummary: string; keyInsights: string[] }>();
      for (const summary of questionSummaries) {
        summaryByQuestion.set(summary.questionIndex, {
          respondentSummary: summary.respondentSummary,
          keyInsights: summary.keyInsights,
        });
      }

      const reviewComments = (fullSession.reviewComments || {}) as Record<string, string>;

      const segments = questions.map((q, index) => {
        const summary = summaryByQuestion.get(index);
        return {
          id: `q-${index}`,
          questionId: q.id,
          transcript: transcriptByQuestion.get(index) || null,
          summaryBullets: summary?.keyInsights || null,
          respondentComment: reviewComments[String(index)] || null,
          question: {
            questionText: q.questionText,
            questionType: q.questionType,
          },
          isAdditionalQuestion: false,
        };
      });

      const additionalQuestions = (fullSession.additionalQuestions || []) as Array<{ 
        questionText: string; 
        rationale: string;
        transcript?: string;
        summaryBullets?: string[];
      }>;
      const aqSegments = additionalQuestions.map((aq, index) => {
        const aqIndex = questions.length + index;
        const summary = summaryByQuestion.get(aqIndex);
        const aqTranscript = aq.transcript || transcriptByQuestion.get(aqIndex) || null;
        return {
          id: `aq-${index}`,
          questionId: null,
          transcript: aqTranscript,
          summaryBullets: aq.summaryBullets || summary?.keyInsights || null,
          respondentComment: reviewComments[`aq-${index}`] || null,
          question: {
            questionText: aq.questionText,
            questionType: "open",
          },
          isAdditionalQuestion: true,
          additionalQuestionIndex: index,
          rationale: aq.rationale,
        };
      });

      const safeSession = {
        id: fullSession.id,
        status: fullSession.status,
        closingComments: fullSession.closingComments,
        reviewRatings: fullSession.reviewRatings,
        reviewCompletedAt: fullSession.reviewCompletedAt,
        segments,
        additionalQuestionSegments: aqSegments,
      };

      res.json(safeSession);
    } catch (error) {
      console.error("Error fetching review data:", error);
      res.status(500).json({ message: "Failed to fetch review data" });
    }
  });

  app.post("/api/sessions/:id/review", async (req, res) => {
    try {
      const parseResult = submitReviewSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = fromError(parseResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const tokenHeader = req.headers["x-review-token"] as string | undefined;
      const { valid, session, error, statusCode } = await validateReviewAccess(req.params.id, tokenHeader, req);
      
      if (!valid) {
        return res.status(statusCode || 401).json({ message: error });
      }

      if (session.reviewCompletedAt) {
        return res.status(400).json({ message: "Review already submitted" });
      }

      const { ratings, segmentComments, closingComments, skipped } = parseResult.data;

      let reviewComments: Record<string, string> | null = null;
      if (segmentComments && !skipped) {
        reviewComments = {};
        for (const { segmentId, comment } of segmentComments) {
          if (segmentId.startsWith("aq-")) {
            reviewComments[segmentId] = comment;
          } else {
            const indexStr = segmentId.replace("q-", "");
            reviewComments[indexStr] = comment;
          }
        }
      }

      const updated = await storage.submitSessionReview(req.params.id, {
        reviewRatings: skipped ? null : (ratings as ReviewRatings),
        closingComments: skipped ? null : closingComments,
        reviewComments: skipped ? null : reviewComments,
        reviewSkipped: skipped ?? false,
        reviewCompletedAt: new Date(),
        reviewAccessToken: null,
        reviewAccessExpiresAt: null,
      });

      res.json({ success: true, session: updated });
    } catch (error) {
      console.error("Error submitting review:", error);
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  app.post("/api/sessions/:id/review/generate-link", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await storage.setReviewAccessToken(session.id, tokenHash, expiresAt);

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

      res.json({
        token,
        expiresAt,
        url: `${baseUrl}/review/${token}`,
      });
    } catch (error) {
      console.error("Error generating review link:", error);
      res.status(500).json({ message: "Failed to generate review link" });
    }
  });

  app.get("/api/review/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const session = await storage.getSessionByReviewToken(tokenHash);

      if (!session) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }

      if (session.reviewAccessExpiresAt && new Date() > session.reviewAccessExpiresAt) {
        return res.status(410).json({ message: "This review link has expired" });
      }

      res.json({ sessionId: session.id });
    } catch (error) {
      console.error("Error validating review token:", error);
      res.status(500).json({ message: "Failed to validate token" });
    }
  });
}
