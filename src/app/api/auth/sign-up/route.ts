import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { verifyTurnstileToken } from "@/lib/auth/turnstile";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, turnstileToken } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 400 },
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 },
      );
    }

    if (!turnstileToken || typeof turnstileToken !== "string") {
      return NextResponse.json(
        { error: "Cloudflare Turnstile verification token is required." },
        { status: 400 },
      );
    }

    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    const isTurnstileValid = await verifyTurnstileToken(turnstileToken, ip);
    if (!isTurnstileValid) {
      return NextResponse.json(
        { error: "Security check failed. Please refresh and complete the verification." },
        { status: 400 },
      );
    }

    const response = await auth.api.signUpEmail({
      body: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
      headers: request.headers,
      asResponse: true,
    });

    return response;
  } catch (error: unknown) {
    const err = error as { message?: string; statusCode?: number; status?: number } | undefined;
    const message = err?.message || "Failed to create account. Please try again.";
    const status = typeof err?.statusCode === "number" ? err.statusCode : typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
