import { NextResponse } from "next/server";
import { requireDaisyOwner, DaisyUnauthorizedError, DaisyForbiddenError } from "@/lib/daisy/owner";
import { uploadDaisyReference } from "@/lib/daisy/r2";

export async function POST(request: Request) {
  try {
    await requireDaisyOwner(request.headers);
  } catch (err) {
    if (err instanceof DaisyUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof DaisyForbiddenError) {
      return NextResponse.json({ error: "Forbidden: Not the Daisy owner" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const gateId = searchParams.get("gateId");

  if (!projectId || !gateId) {
    return NextResponse.json(
      { error: "Missing projectId or gateId query parameter" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided ('file' field required in form-data)" },
      { status: 400 }
    );
  }

  try {
    const reference = await uploadDaisyReference({
      projectId,
      gateId,
      file,
    });
    return NextResponse.json(reference, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload reference";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
