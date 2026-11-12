import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  createUserMcpToken,
  listUserMcpTokens,
} from "@/lib/kanban/mcp/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokens = await listUserMcpTokens(session.user.id);
    return NextResponse.json({ tokens });
  } catch (error: unknown) {
    console.error("Failed to list Kanban MCP tokens:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    if (!rawName || rawName.length > 80) {
      return NextResponse.json(
        { error: "Token name must be between 1 and 80 characters" },
        { status: 400 },
      );
    }

    const created = await createUserMcpToken(session.user.id, rawName);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create Kanban MCP token:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
