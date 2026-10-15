import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import { devEmailOutbox } from "../db/schema";

export type EmailPurpose = "verify_email" | "reset_password" | "existing_account" | "invitation" | "access_request";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  purpose: EmailPurpose;
};

export type EmailSendResult =
  | { delivered: true; mode: "resend" | "dev-sink" | "memory" }
  | { delivered: false; mode: "unconfigured" | "failed"; reason: string };

export type EmailSender = {
  send: (message: OutboundEmail) => Promise<EmailSendResult>;
};

const memoryMailbox: OutboundEmail[] = [];

export function readMemoryMailbox(): OutboundEmail[] {
  return memoryMailbox;
}

export function clearMemoryMailbox() {
  memoryMailbox.length = 0;
}

export function createEmailSender(input: {
  mode: "resend" | "dev-sink" | "memory" | "unconfigured";
  db: AppDatabase;
  resendApiKey: string | null;
  emailFrom: string | null;
  now: () => Date;
}): EmailSender {
  return {
    async send(message) {
      if (input.mode === "memory") {
        memoryMailbox.push(message);
        return { delivered: true, mode: "memory" };
      }
      if (input.mode === "dev-sink") {
        await input.db.insert(devEmailOutbox).values({
          id: randomUUID(),
          recipient: message.to,
          subject: message.subject,
          body: message.text,
          purpose: message.purpose,
          createdAt: input.now(),
        });
        return { delivered: true, mode: "dev-sink" };
      }
      if (input.mode === "unconfigured" || !input.resendApiKey || !input.emailFrom) {
        return {
          delivered: false,
          mode: "unconfigured",
          reason: "Email delivery is not configured.",
        };
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: input.emailFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok) {
        return { delivered: false, mode: "failed", reason: "The email provider rejected the message." };
      }
      return { delivered: true, mode: "resend" };
    },
  };
}

export async function listDevOutbox(db: AppDatabase) {
  return db.select().from(devEmailOutbox).orderBy(devEmailOutbox.createdAt);
}

export async function clearDevOutbox(db: AppDatabase) {
  await db.delete(devEmailOutbox).where(eq(devEmailOutbox.purpose, devEmailOutbox.purpose));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createToken(): string {
  return randomBytes(32).toString("base64url");
}
