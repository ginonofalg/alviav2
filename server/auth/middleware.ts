import { clerkMiddleware, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export const clerkAuthMiddleware = clerkMiddleware;

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function getUserId(req: Request): string {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Not authenticated");
  return auth.userId;
}

export function getOptionalUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth?.userId ?? null;
}
