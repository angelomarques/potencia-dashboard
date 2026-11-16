"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  OUTREACH_CHANNEL_META,
  OUTREACH_OUTCOME_META,
  type CreateLeadInput,
  type LeadOutreachLog,
  type LeadStatus,
  type LeadWithStats,
  type OutreachChannel,
  type OutreachDirection,
  type OutreachOutcome,
  type UpdateLeadInput,
} from "@/lib/leads/types";
import { computeLeadsReport } from "@/lib/leads/report";
import type { LeadProjectOption } from "@/lib/leads/repo";
import { LeadsReportCards } from "./leads-report-cards";
import { LeadDialog } from "./lead-dialog";
import { LogApproachDialog } from "./log-approach-dialog";
import { LeadDetailSheet } from "./lead-detail-sheet";
import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarClock,
  Clock,
  ExternalLink,
  FolderGit2,
  Globe,
  History,
  Link2,
  Mail,
  MessageSquarePlus,
  Phone,
  Plus,
  Search,
  Send,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function formatShortTimestamp(ms: number | null | undefined): string {
  if (!ms) return "Never";
  try {
    return new Date(ms).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

interface LeadsDashboardProps {
  initialStorageConfigured: boolean;
  initialProjects: LeadProjectOption[];
  initialLeads: LeadWithStats[];
  initialLogs: LeadOutreachLog[];
  initialProjectFilter?: string;
}

export function LeadsDashboard({
  initialStorageConfigured,
  initialProjects,
  initialLeads,
  initialLogs,
  initialProjectFilter = "all",
}: LeadsDashboardProps) {
  const [leads, setLeads] = useState<LeadWithStats[]>(initialLeads);
  const [logs, setLogs] = useState<LeadOutreachLog[]>(initialLogs);
  const [projects] = useState<LeadProjectOption[]>(initialProjects);
  const [nowMs] = useState<number>(() => Date.now());

  // Filters
  const [projectFilter, setProjectFilter] = useState<string>(
    initialProjectFilter || "all",
  );
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [followUpFilter, setFollowUpFilter] = useState<
    "all" | "overdue" | "upcoming"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDetailedReport, setShowDetailedReport] = useState(true);
  const [activeTab, setActiveTab] = useState<"leads" | "logs">("leads");

  // Modals & Drawer state
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadWithStats | null>(null);
  const [logDialogLead, setLogDialogLead] = useState<LeadWithStats | null>(
    null,
  );
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Table sort state (managed on header + DOM row reordering via moveBefore)
  const tableRef = useRef<HTMLTableElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const statusAnnouncementRef = useRef<HTMLDivElement | null>(null);
  const [sortState, setSortState] = useState<{
    columnIndex: number | null;
    direction: "ascending" | "descending";
  }>({ columnIndex: null, direction: "ascending" });

  const projectNameBySlug = useMemo(
    () => new Map(projects.map((p) => [p.slug, p.name])),
    [projects],
  );

  // Filtered leads for display & report
  const filteredLeads = useMemo(() => {
    const soonHorizon = nowMs + 3 * 24 * 60 * 60 * 1000;
    const q = searchQuery.trim().toLowerCase();

    return leads.filter((lead) => {
      if (projectFilter !== "all" && lead.projectSlug !== projectFilter) {
        return false;
      }
      if (statusFilter !== "all" && lead.status !== statusFilter) {
        return false;
      }
      if (followUpFilter === "overdue") {
        if (
          !lead.nextFollowUpAt ||
          lead.nextFollowUpAt >= nowMs ||
          lead.status === "won" ||
          lead.status === "lost"
        ) {
          return false;
        }
      } else if (followUpFilter === "upcoming") {
        if (
          !lead.nextFollowUpAt ||
          lead.nextFollowUpAt > soonHorizon ||
          lead.status === "won" ||
          lead.status === "lost"
        ) {
          return false;
        }
      }
      if (q) {
        const haystack = [
          lead.name,
          lead.company,
          lead.email,
          lead.website,
          lead.role,
          lead.phone,
          lead.source,
          lead.projectSlug,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [leads, projectFilter, statusFilter, followUpFilter, searchQuery, nowMs]);

  // Filtered logs for the selected project
  const filteredLogs = useMemo(() => {
    const allowedLeadIds = new Set(
      leads
        .filter(
          (l) => projectFilter === "all" || l.projectSlug === projectFilter,
        )
        .map((l) => l.id),
    );
    return logs.filter((lg) => allowedLeadIds.has(lg.leadId));
  }, [leads, logs, projectFilter]);

  // Report summary based on project filter
  const reportLeads = useMemo(
    () =>
      leads.filter(
        (l) => projectFilter === "all" || l.projectSlug === projectFilter,
      ),
    [leads, projectFilter],
  );

  const report = useMemo(
    () => computeLeadsReport(reportLeads, filteredLogs, nowMs),
    [reportLeads, filteredLogs, nowMs],
  );

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const selectedLeadLogs = useMemo(
    () =>
      selectedLeadId
        ? logs
            .filter((lg) => lg.leadId === selectedLeadId)
            .sort((a, b) => b.approachedAt - a.approachedAt)
        : [],
    [logs, selectedLeadId],
  );

  const leadById = useMemo(
    () => new Map(leads.map((l) => [l.id, l])),
    [leads],
  );

  // Sortable Table handler following modern-web-guidance `sortable-table`:
  // - Reads raw data-value or textContent once per row
  // - Compares numbers as numbers and text with Intl.Collator
  // - Reorders existing <tr> elements in <tbody> using moveBefore (with appendChild fallback)
  // - Updates a single visually-hidden role="status" live region
  const handleSortColumn = (
    columnIndex: number,
    columnLabel: string,
    dataType: "text" | "number",
  ) => {
    const tbody = tbodyRef.current;
    if (!tbody) return;

    const nextDirection: "ascending" | "descending" =
      sortState.columnIndex === columnIndex &&
      sortState.direction === "ascending"
        ? "descending"
        : "ascending";

    setSortState({ columnIndex, direction: nextDirection });

    const rows = Array.from(tbody.rows);
    const factor = nextDirection === "ascending" ? 1 : -1;

    const decorated = rows.map((row) => {
      const cell = row.cells[columnIndex];
      const raw = cell?.dataset.value ?? cell?.textContent?.trim() ?? "";
      return {
        row,
        strVal: raw,
        numVal: Number(raw) || 0,
      };
    });

    decorated.sort((a, b) => {
      if (dataType === "number") {
        return factor * (a.numVal - b.numVal);
      }
      return factor * textCollator.compare(a.strVal, b.strVal);
    });

    const reorderDom = () => {
      const container = tbody as HTMLElement & {
        moveBefore?: (node: Node, child: Node | null) => void;
      };
      for (const item of decorated) {
        if (typeof container.moveBefore === "function") {
          container.moveBefore(item.row, null);
        } else {
          container.appendChild(item.row);
        }
      }
    };

    const tableEl = tableRef.current as
      | (HTMLTableElement & {
          startViewTransition?: (cb: () => void) => void;
        })
      | null;

    if (tableEl && typeof tableEl.startViewTransition === "function") {
      tableEl.startViewTransition(reorderDom);
    } else {
      reorderDom();
    }

    if (statusAnnouncementRef.current) {
      statusAnnouncementRef.current.textContent = `Sorted by ${columnLabel}, ${nextDirection}, ${rows.length} rows`;
    }
  };

  // Handlers for CRUD operations
  const handleCreateLead = async (input: CreateLeadInput) => {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error || "Failed to create lead";
      toast.error(msg);
      throw new Error(msg);
    }

    setLeads((prev) => [data.lead, ...prev]);
    if (data.initialLog) {
      setLogs((prev) => [data.initialLog, ...prev]);
    }
    toast.success(`Added lead "${data.lead.name}"`);
  };

  const handleUpdateLead = async (id: string, input: UpdateLeadInput) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error || "Failed to update lead";
      toast.error(msg);
      throw new Error(msg);
    }

    setLeads((prev) => prev.map((l) => (l.id === id ? data.lead : l)));
    toast.success("Lead updated");
  };

  const handleQuickStatusChange = async (
    leadId: string,
    nextStatus: LeadStatus,
  ) => {
    const prevLeads = leads;
    setLeads((curr) =>
      curr.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l)),
    );

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update status");
      }
      setLeads((curr) => curr.map((l) => (l.id === leadId ? data.lead : l)));
      toast.success(
        `Status updated to ${LEAD_STATUS_META[nextStatus].label}`,
      );
    } catch (err) {
      setLeads(prevLeads);
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error || "Failed to delete lead";
      toast.error(msg);
      throw new Error(msg);
    }

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setLogs((prev) => prev.filter((lg) => lg.leadId !== leadId));
    toast.success("Lead deleted");
  };

  const handleSubmitApproachLog = async (
    leadId: string,
    payload: {
      channel: OutreachChannel;
      direction: OutreachDirection;
      outcome: OutreachOutcome;
      subject?: string | null;
      message?: string | null;
      approachedAt: number;
      nextFollowUpAt?: number | null;
      autoUpdateStatus: boolean;
      explicitStatus?: LeadStatus;
    },
  ) => {
    const res = await fetch(`/api/leads/${leadId}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error || "Failed to log approach";
      toast.error(msg);
      throw new Error(msg);
    }

    setLogs((prev) => [data.log, ...prev]);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
    toast.success("Approach logged");
  };

  const handleDeleteLog = async (leadId: string, logId: string) => {
    const res = await fetch(`/api/leads/${leadId}/logs/${logId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error || "Failed to delete log entry");
      return;
    }

    setLogs((prev) => prev.filter((lg) => lg.id !== logId));
    if (data.lead) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
    }
    toast.success("Outreach log entry removed");
  };

  return (
    <div
      className="flex-1 overflow-y-auto"
      data-testid="leads-outbound-dashboard"
    >
      {/* Visually hidden status element for screen reader sort announcements */}
      <div
        ref={statusAnnouncementRef}
        role="status"
        className="sr-status-live"
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
              <Send className="h-6 w-6 text-emerald-500" />
              Lead Outbound & Tracker
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track leads, company details, outreach approach timestamps, and
              conversion reports per project.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setShowDetailedReport((prev) => !prev)}
              data-testid="toggle-report-btn"
            >
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              {showDetailedReport ? "Hide Breakdown" : "Show Breakdown"}
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              disabled={!initialStorageConfigured}
              onClick={() => {
                setEditingLead(null);
                setLeadDialogOpen(true);
              }}
              data-testid="new-lead-btn"
            >
              <Plus className="h-4 w-4" />
              New Lead
            </Button>
          </div>
        </div>

        {/* Missing D1 Storage Banner */}
        {!initialStorageConfigured && (
          <div
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200"
            data-testid="leads-storage-warning"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">
                  Cloudflare D1 Storage Not Configured
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Configure{" "}
                  <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono">
                    CLOUDFLARE_ACCOUNT_ID
                  </code>
                  ,{" "}
                  <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono">
                    D1_DATABASE_ID
                  </code>
                  , and{" "}
                  <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono">
                    CLOUDFLARE_API_TOKEN
                  </code>{" "}
                  in your environment to persist leads and outreach logs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Report Cards + Pipeline Strip */}
        <LeadsReportCards
          report={report}
          projects={projects}
          showDetailedReport={showDetailedReport}
          selectedStatus={statusFilter}
          onSelectStatus={setStatusFilter}
          onSelectProject={setProjectFilter}
        />

        {/* Controls Bar: Project Selector, Follow-up Filter, Search, View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search lead, company, email, website..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
                data-testid="leads-search-input"
              />
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5">
              <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger
                  className="h-8 w-[160px] text-xs"
                  data-testid="leads-project-filter"
                >
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Follow-up Filter */}
            <Select
              value={followUpFilter}
              onValueChange={(v) =>
                setFollowUpFilter(v as "all" | "overdue" | "upcoming")
              }
            >
              <SelectTrigger
                className="h-8 w-[165px] text-xs"
                data-testid="leads-followup-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Follow-up Dates</SelectItem>
                <SelectItem value="overdue">Overdue Follow-ups</SelectItem>
                <SelectItem value="upcoming">Due Next 72 Hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Switcher: Leads Table vs Outreach Activity Feed */}
          <div className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 p-0.5">
            <Button
              type="button"
              variant={activeTab === "leads" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setActiveTab("leads")}
              data-testid="tab-leads-table"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Leads ({filteredLeads.length})
            </Button>
            <Button
              type="button"
              variant={activeTab === "logs" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setActiveTab("logs")}
              data-testid="tab-outreach-logs"
            >
              <History className="h-3.5 w-3.5" />
              Approach Logs ({filteredLogs.length})
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        {activeTab === "leads" ? (
          filteredLeads.length === 0 ? (
            <Card className="border-dashed" data-testid="leads-empty-state">
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                  <Send className="h-5 w-5" />
                </div>
                <h2 className="text-sm font-semibold">No leads found</h2>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  {leads.length === 0
                    ? "Start building your outbound pipeline by adding your first lead and linking it to a project."
                    : "No leads match your active project, status, or search filters."}
                </p>
                {initialStorageConfigured && leads.length === 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 h-8 text-xs gap-1.5"
                    onClick={() => {
                      setEditingLead(null);
                      setLeadDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add First Lead
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="leads-table-caption"
              className="leads-table-wrapper rounded-lg border border-border/70 bg-card shadow-2xs"
              data-testid="leads-table-region"
            >
              <table
                id="leads-table"
                ref={tableRef}
                className="leads-data-table"
              >
                <caption id="leads-table-caption" className="sr-only">
                  Lead outbound tracker and outreach history
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      data-type="text"
                      aria-sort={
                        sortState.columnIndex === 0
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortColumn(0, "Lead", "text")}
                      >
                        <span>Lead</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th
                      scope="col"
                      data-type="text"
                      aria-sort={
                        sortState.columnIndex === 1
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortColumn(1, "Project", "text")}
                      >
                        <span>Project</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th
                      scope="col"
                      data-type="text"
                      aria-sort={
                        sortState.columnIndex === 2
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSortColumn(2, "Company & Web", "text")
                        }
                      >
                        <span>Company & Web</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th scope="col">Contact</th>

                    <th
                      scope="col"
                      data-type="text"
                      aria-sort={
                        sortState.columnIndex === 4
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSortColumn(4, "Status", "text")}
                      >
                        <span>Status</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th
                      scope="col"
                      data-type="number"
                      aria-sort={
                        sortState.columnIndex === 5
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSortColumn(5, "Last Approached", "number")
                        }
                      >
                        <span>Last Approached</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th
                      scope="col"
                      data-type="number"
                      aria-sort={
                        sortState.columnIndex === 6
                          ? sortState.direction
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSortColumn(6, "Next Follow-up", "number")
                        }
                      >
                        <span>Next Follow-up</span>
                        <ArrowUp
                          aria-hidden="true"
                          className="sort-indicator"
                        />
                      </button>
                    </th>

                    <th scope="col">Actions</th>
                  </tr>
                </thead>

                <tbody ref={tbodyRef}>
                  {filteredLeads.map((lead) => {
                    const projectLabel =
                      projectNameBySlug.get(lead.projectSlug) ||
                      lead.projectSlug;
                    const isOverdue =
                      lead.nextFollowUpAt != null &&
                      lead.nextFollowUpAt < nowMs &&
                      lead.status !== "won" &&
                      lead.status !== "lost";

                    return (
                      <tr
                        key={lead.id}
                        data-testid="lead-row"
                        data-lead-id={lead.id}
                      >
                        {/* Row Header: Lead Name & Role */}
                        <th scope="row" data-value={lead.name}>
                          <div className="flex flex-col gap-0.5 min-w-[150px]">
                            <button
                              type="button"
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="text-left text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                              data-testid="open-lead-detail-btn"
                            >
                              {lead.name}
                            </button>
                            {lead.role && (
                              <span className="text-[11px] font-normal text-muted-foreground truncate max-w-[200px]">
                                {lead.role}
                              </span>
                            )}
                          </div>
                        </th>

                        {/* Project Badge */}
                        <td data-value={projectLabel}>
                          <Badge
                            variant="secondary"
                            className="font-mono text-[11px] uppercase tracking-wider gap-1"
                            data-testid="lead-project-badge"
                          >
                            <FolderGit2 className="h-3 w-3 text-primary" />
                            {projectLabel}
                          </Badge>
                        </td>

                        {/* Company & Website */}
                        <td data-value={lead.company || lead.website || ""}>
                          <div className="flex flex-col gap-0.5 text-xs min-w-[140px]">
                            {lead.company ? (
                              <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[180px]">
                                  {lead.company}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            )}
                            {lead.website && (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[180px]"
                              >
                                <Globe className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {lead.website.replace(/^https?:\/\//i, "")}
                                </span>
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Contact Channels (Email, Phone, LinkedIn) */}
                        <td>
                          <div className="flex flex-col gap-1 text-xs min-w-[150px]">
                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}`}
                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground truncate max-w-[190px]"
                                title={lead.email}
                              >
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{lead.email}</span>
                              </a>
                            )}
                            <div className="flex items-center gap-2.5">
                              {lead.phone && (
                                <a
                                  href={`tel:${lead.phone}`}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                  title={lead.phone}
                                >
                                  <Phone className="h-3 w-3 shrink-0" />
                                  <span>{lead.phone}</span>
                                </a>
                              )}
                              {lead.linkedinUrl && (
                                <a
                                  href={lead.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  <Link2 className="h-3 w-3 shrink-0" />
                                  <span>LinkedIn</span>
                                </a>
                              )}
                              {!lead.email &&
                                !lead.phone &&
                                !lead.linkedinUrl && (
                                  <span className="text-muted-foreground/60">
                                    —
                                  </span>
                                )}
                            </div>
                          </div>
                        </td>

                        {/* Pipeline Status */}
                        <td data-value={LEAD_STATUS_META[lead.status].label}>
                          <Select
                            value={lead.status}
                            onValueChange={(val) =>
                              handleQuickStatusChange(
                                lead.id,
                                val as LeadStatus,
                              )
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-[142px] text-xs px-2"
                              data-testid="row-status-select"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((st) => (
                                <SelectItem key={st} value={st}>
                                  <span className="flex items-center gap-1.5 text-xs">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{
                                        backgroundColor:
                                          LEAD_STATUS_META[st].dotColor,
                                      }}
                                    />
                                    {LEAD_STATUS_META[st].label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Last Approached & Outreach Count */}
                        <td data-value={String(lead.lastContactedAt ?? 0)}>
                          <div className="flex flex-col gap-1 text-xs min-w-[155px]">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">
                                {formatShortTimestamp(lead.lastContactedAt)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                                data-testid="lead-outreach-count"
                              >
                                {lead.outreachCount}{" "}
                                {lead.outreachCount === 1 ? "log" : "logs"}
                              </Badge>
                              {lead.lastChannel && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${
                                    OUTREACH_CHANNEL_META[lead.lastChannel]
                                      .badgeClass
                                  }`}
                                >
                                  {
                                    OUTREACH_CHANNEL_META[lead.lastChannel]
                                      .label
                                  }
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Next Follow-up */}
                        <td
                          data-value={String(
                            lead.nextFollowUpAt ?? Number.MAX_SAFE_INTEGER,
                          )}
                        >
                          {lead.nextFollowUpAt ? (
                            <div
                              className={`inline-flex items-center gap-1 text-xs ${
                                isOverdue
                                  ? "font-semibold text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {formatShortTimestamp(lead.nextFollowUpAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              —
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1"
                              onClick={() => setLogDialogLead(lead)}
                              data-testid="row-log-approach-btn"
                            >
                              <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                              Log
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedLeadId(lead.id)}
                              data-testid="row-view-history-btn"
                            >
                              History
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Chronological Outreach Activity Log Feed */
          <Card className="border-border/70" data-testid="outreach-activity-feed">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h2 className="text-sm font-semibold">
                  Chronological Approach Logs ({filteredLogs.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                  All logged approaches across{" "}
                  {projectFilter === "all"
                    ? "all projects"
                    : projectNameBySlug.get(projectFilter) || projectFilter}
                </span>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No outreach logs recorded yet. Click &ldquo;Log&rdquo; on any
                  lead row to record an approach.
                </div>
              ) : (
                <ol className="space-y-2.5 list-none p-0 m-0">
                  {filteredLogs.map((log) => {
                    const lead = leadById.get(log.leadId);
                    const chMeta =
                      OUTREACH_CHANNEL_META[log.channel] ??
                      OUTREACH_CHANNEL_META.other;
                    const outMeta =
                      OUTREACH_OUTCOME_META[log.outcome] ??
                      OUTREACH_OUTCOME_META.sent;
                    const projLabel = lead
                      ? projectNameBySlug.get(lead.projectSlug) ||
                        lead.projectSlug
                      : "unknown";

                    return (
                      <li
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                lead && setSelectedLeadId(lead.id)
                              }
                              className="font-semibold text-foreground hover:text-primary cursor-pointer"
                            >
                              {lead?.name || "Deleted Lead"}
                            </button>
                            {lead?.company && (
                              <span className="text-muted-foreground">
                                ({lead.company})
                              </span>
                            )}
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px] uppercase"
                            >
                              {projLabel}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${chMeta.badgeClass}`}
                            >
                              {chMeta.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${outMeta.badgeClass}`}
                            >
                              {outMeta.label}
                            </Badge>
                          </div>

                          {(log.subject || log.message) && (
                            <p className="text-muted-foreground truncate max-w-2xl">
                              {log.subject ? (
                                <strong className="text-foreground mr-1.5">
                                  {log.subject}:
                                </strong>
                              ) : null}
                              {log.message}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <time
                            dateTime={new Date(log.approachedAt).toISOString()}
                          >
                            {formatShortTimestamp(log.approachedAt)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create / Edit Lead Dialog */}
      <LeadDialog
        open={leadDialogOpen}
        onOpenChange={(open) => {
          setLeadDialogOpen(open);
          if (!open) setEditingLead(null);
        }}
        projects={projects}
        defaultProjectSlug={projectFilter}
        lead={editingLead}
        onCreate={handleCreateLead}
        onUpdate={handleUpdateLead}
      />

      {/* Quick Log Approach Dialog */}
      <LogApproachDialog
        open={Boolean(logDialogLead)}
        onOpenChange={(open) => {
          if (!open) setLogDialogLead(null);
        }}
        lead={logDialogLead}
        onSubmitLog={handleSubmitApproachLog}
      />

      {/* Lead Detail & Outreach History Sheet */}
      <LeadDetailSheet
        open={Boolean(selectedLead)}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null);
        }}
        lead={selectedLead}
        projectLabel={
          selectedLead
            ? projectNameBySlug.get(selectedLead.projectSlug) ||
              selectedLead.projectSlug
            : ""
        }
        logs={selectedLeadLogs}
        nowMs={nowMs}
        onStatusChange={handleQuickStatusChange}
        onOpenLogDialog={(lead) => setLogDialogLead(lead)}
        onEditLead={(lead) => {
          setEditingLead(lead);
          setLeadDialogOpen(true);
        }}
        onDeleteLead={handleDeleteLead}
        onDeleteLog={handleDeleteLog}
      />
    </div>
  );
}
