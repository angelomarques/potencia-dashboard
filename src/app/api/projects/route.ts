import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import {
  createDashboardProject,
  listDashboardProjects,
  ProjectServiceError,
} from "@/lib/projects/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await listDashboardProjects();
    return NextResponse.json({ projects });
  } catch (error: unknown) {
    console.error("Failed to list projects:", error);
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

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const name = typeof body?.name === "string" ? body.name : "";
    const slug = typeof body?.slug === "string" ? body.slug : undefined;
    const tagline =
      typeof body?.tagline === "string"
        ? body.tagline
        : body?.tagline === null
          ? null
          : undefined;

    const project = await createDashboardProject({
      name,
      slug,
      tagline,
      createdBy: session.user.id,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ProjectServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create project:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
