import type { Express, Request, Response } from "express";
import { Webhook } from "svix";
import { syncClerkUser } from "./sync";

interface WebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
}

export function registerWebhookRoutes(app: Express): void {
  app.post("/api/webhooks/clerk", async (req: Request, res: Response) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!webhookSecret) {
      console.error("[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET is not set");
      return res.status(500).json({ message: "Webhook secret not configured" });
    }

    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ message: "Missing svix headers" });
    }

    let event: WebhookEvent;
    try {
      const wh = new Webhook(webhookSecret);
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        return res.status(400).json({ message: "Missing raw body for verification" });
      }
      event = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("[clerk-webhook] Signature verification failed:", err);
      return res.status(400).json({ message: "Invalid signature" });
    }

    try {
      if (event.type === "user.created" || event.type === "user.updated") {
        const { id, email_addresses, first_name, last_name, image_url } = event.data;
        const primaryEmail = email_addresses?.[0]?.email_address;
        if (primaryEmail) {
          await syncClerkUser(id, primaryEmail, first_name ?? null, last_name ?? null, image_url ?? null);
          console.log(`[clerk-webhook] Synced user ${primaryEmail} (${event.type})`);
        }
      } else if (event.type === "user.deleted") {
        console.log(`[clerk-webhook] User deleted event received for ${event.data.id} — no action taken`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[clerk-webhook] Error processing event:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
