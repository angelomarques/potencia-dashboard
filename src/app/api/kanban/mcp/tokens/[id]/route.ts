import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { revokeUserMcpToken } from "@/lib/kanban/mcp/tokens";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Token ID is required" },
        { status: 400 },
      );
    }

    const revoked = await revokeUserMcpToken(session.user.id, id);
    if (!revoked) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error("Failed to revoke Kanban MCP token:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
