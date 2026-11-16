import React from "react";
import {
  leadsStorageConfigured,
  listAllOutreachLogs,
  listAvailableLeadProjects,
  listLeads,
} from "@/lib/leads/repo";
import { LeadsDashboard } from "@/components/leads/leads-dashboard";

export const dynamic = "force-dynamic";

interface LeadsPageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const { project } = await searchParams;
  const storageConfigured = leadsStorageConfigured();
  const projects = await listAvailableLeadProjects();

  const [leads, logs] = storageConfigured
    ? await Promise.all([listLeads(), listAllOutreachLogs()])
    : [[], []];

  const initialProjectFilter =
    project && projects.some((p) => p.slug === project) ? project : "all";

  return (
    <LeadsDashboard
      initialStorageConfigured={storageConfigured}
      initialProjects={projects}
      initialLeads={leads}
      initialLogs={logs}
      initialProjectFilter={initialProjectFilter}
    />
  );
}
