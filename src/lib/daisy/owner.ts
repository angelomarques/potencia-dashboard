import { getSession } from "@/lib/auth/server";
import { auth } from "@/lib/auth/auth";
import { env } from "@/env";

export class DaisyUnauthorizedError extends Error {
  constructor(message = "Unauthorized: Session required") {
    super(message);
    this.name = "DaisyUnauthorizedError";
  }
}

export class DaisyForbiddenError extends Error {
  constructor(message = "Forbidden: Not the Daisy owner") {
    super(message);
    this.name = "DaisyForbiddenError";
  }
}

/**
 * Validates that the current request has an authenticated session
 * and, if DAISY_OWNER_EMAIL is configured, matches the owner email (case-insensitive).
 *
 * Can be called with no arguments (uses Next.js headers in Server Components)
 * or with explicit Headers (for API routes or oRPC procedures).
 */
export async function requireDaisyOwner(reqHeaders?: Headers) {
  const session = reqHeaders
    ? await auth.api.getSession({ headers: reqHeaders })
    : await getSession();

  if (!session || !session.user) {
    throw new DaisyUnauthorizedError();
  }

  if (!isDaisyOwnerEmail(session.user.email)) {
    throw new DaisyForbiddenError();
  }

  return session;
}

export function isDaisyOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const ownerEmail = (env?.DAISY_OWNER_EMAIL || process.env.DAISY_OWNER_EMAIL)?.trim();
  // Fail closed in production: owner-only page requires DAISY_OWNER_EMAIL there.
  if (!ownerEmail) return process.env.VERCEL_ENV !== "production";
  return email.trim().toLowerCase() === ownerEmail.toLowerCase();
}
