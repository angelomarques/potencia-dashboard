import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { verifyTurnstileToken } from "./turnstile";
import { getTrustedOrigins } from "./trusted-origins";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {},
  },
  plugins: [nextCookies()],
  trustedOrigins: getTrustedOrigins(process.env),
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Turnstile is verified in the custom sign-up API before calling auth;
          // this hook is a safety net if token is passed via headers.
          const token =
            (ctx?.headers?.get?.("x-turnstile-token") as string | null) ||
            undefined;
          if (token) {
            const ip = ctx?.headers?.get?.("cf-connecting-ip") || ctx?.headers?.get?.("x-forwarded-for");
            const ok = await verifyTurnstileToken(token, ip);
            if (!ok) {
              throw new Error("Turnstile verification failed");
            }
          }
          return { data: user };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
