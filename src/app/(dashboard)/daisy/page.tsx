import { redirect, notFound } from "next/navigation";
import { requireDaisyOwner, DaisyForbiddenError, DaisyUnauthorizedError } from "@/lib/daisy/owner";
import { listProjects, daisyStorageConfigured } from "@/lib/daisy/repo";
import { ProjectList } from "@/components/daisy/project-list";
import { StorageNotConfiguredCard } from "@/components/daisy/storage-not-configured-card";

export const dynamic = "force-dynamic";

export default async function DaisyStudioPage() {
  try {
    await requireDaisyOwner();
  } catch (err) {
    if (err instanceof DaisyForbiddenError) {
      notFound();
    }
    if (err instanceof DaisyUnauthorizedError) {
      redirect("/sign-in");
    }
    redirect("/sign-in");
  }

  if (!daisyStorageConfigured()) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daisy Studio</h1>
          <p className="text-sm text-muted-foreground">
            AI UI-designer agent studio
          </p>
        </div>
        <StorageNotConfiguredCard />
      </div>
    );
  }

  const projects = await listProjects();

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daisy Studio</h1>
        <p className="text-sm text-muted-foreground">
          External AI UI-designer studio projects and reviews
        </p>
      </div>
      <ProjectList projects={projects} />
    </div>
  );
}
