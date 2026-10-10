import { redirect, notFound } from "next/navigation";
import { requireDaisyOwner, DaisyForbiddenError, DaisyUnauthorizedError } from "@/lib/daisy/owner";
import { getProject, listThread, getOpenGate, daisyStorageConfigured } from "@/lib/daisy/repo";
import { isAllowedPreviewUrl } from "@/lib/daisy/preview-allowlist";
import { ProjectView } from "@/components/daisy/project-view";
import { StorageNotConfiguredCard } from "@/components/daisy/storage-not-configured-card";

export const dynamic = "force-dynamic";

interface DaisyProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function DaisyProjectPage({ params }: DaisyProjectPageProps) {
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
      <div className="container mx-auto p-4 md:p-6 max-w-7xl">
        <StorageNotConfiguredCard />
      </div>
    );
  }

  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const [thread, openGate] = await Promise.all([
    listThread(projectId),
    getOpenGate(projectId),
  ]);

  const isAllowedPreview = isAllowedPreviewUrl(project.previewUrl);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <ProjectView
        project={project}
        thread={thread}
        openGate={openGate}
        isAllowedPreview={isAllowedPreview}
      />
    </div>
  );
}
