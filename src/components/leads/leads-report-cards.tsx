"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  OUTREACH_CHANNEL_META,
  type LeadStatus,
} from "@/lib/leads/types";
import type { LeadsReportSummary } from "@/lib/leads/report";
import type { LeadProjectOption } from "@/lib/leads/repo";
import {
  CalendarClock,
  CheckCircle2,
  FolderGit2,
  MessageSquareReply,
  Send,
  Users,
} from "lucide-react";

interface LeadsReportCardsProps {
  report: LeadsReportSummary;
  projects: LeadProjectOption[];
  showDetailedReport: boolean;
  selectedStatus: LeadStatus | "all";
  onSelectStatus: (status: LeadStatus | "all") => void;
  onSelectProject: (slug: string) => void;
}

export function LeadsReportCards({
  report,
  projects,
  showDetailedReport,
  selectedStatus,
  onSelectStatus,
  onSelectProject,
}: LeadsReportCardsProps) {
  const projectNameBySlug = new Map(projects.map((p) => [p.slug, p.name]));

  return (
    <div className="space-y-4" data-testid="leads-report-section">
      {/* Top 5 KPI Summary Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Leads
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-2xl font-bold tracking-tight"
                data-testid="metric-total-leads"
              >
                {report.totalLeads}
              </span>
              <span className="text-xs text-muted-foreground">
                ({report.uncontactedLeads} uncontacted)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.contactRatePercent}% of list approached
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Outbound Approaches
              </span>
              <Send className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-2xl font-bold tracking-tight"
                data-testid="metric-total-approaches"
              >
                {report.totalOutreachLogs}
              </span>
              <span className="text-xs text-muted-foreground">
                across {report.contactedLeads} leads
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Avg {report.avgTouchesPerContactedLead} touches / contacted lead
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Reply & Engagement
              </span>
              <MessageSquareReply className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-2xl font-bold tracking-tight"
                data-testid="metric-reply-rate"
              >
                {report.replyRatePercent}%
              </span>
              <span className="text-xs text-muted-foreground">
                ({report.engagedLeads} replied)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Share of contacted leads that responded
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Meetings & Won
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-2xl font-bold tracking-tight"
                data-testid="metric-meetings-won"
              >
                {report.meetingsBooked}
              </span>
              <span className="text-xs text-muted-foreground">
                ({report.wonLeads} won · {report.conversionRatePercent}%)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Discovery calls booked & closed deals
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Follow-up Queue
              </span>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  report.overdueFollowUps > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : ""
                }`}
                data-testid="metric-overdue-followups"
              >
                {report.overdueFollowUps}
              </span>
              <span className="text-xs text-muted-foreground">overdue</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {report.dueTodayOrSoonFollowUps} due in next 72 hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Status Strip (Interactive Filter Pills) */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 p-2">
        <button
          type="button"
          onClick={() => onSelectStatus("all")}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            selectedStatus === "all"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span>All Stages</span>
          <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px]">
            {report.totalLeads}
          </span>
        </button>

        {LEAD_STATUSES.map((st) => {
          const meta = LEAD_STATUS_META[st];
          const count = report.byStatus[st] ?? 0;
          const active = selectedStatus === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => onSelectStatus(active ? "all" : st)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              data-testid={`pipeline-pill-${st}`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.dotColor }}
              />
              <span>{meta.label}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detailed Report Breakdown (By Project & By Channel) */}
      {showDetailedReport && (
        <div
          className="grid gap-4 lg:grid-cols-2"
          data-testid="detailed-outbound-report"
        >
          {/* Breakdown by Project */}
          <Card className="border-border/70">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                  Outbound Report by Project
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  Click project to filter
                </span>
              </div>

              {report.byProject.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No project lead activity recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {report.byProject.map((proj) => {
                    const label =
                      projectNameBySlug.get(proj.projectSlug) ||
                      proj.projectSlug;
                    return (
                      <div
                        key={proj.projectSlug}
                        onClick={() => onSelectProject(proj.projectSlug)}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs hover:border-primary/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-[11px] uppercase"
                          >
                            {label}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {proj.totalLeads}{" "}
                            {proj.totalLeads === 1 ? "lead" : "leads"}
                          </span>
                          <span className="text-muted-foreground">
                            · {proj.totalLogs} approaches
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <span>
                            Contacted:{" "}
                            <strong className="text-foreground">
                              {proj.contactedLeads}
                            </strong>
                          </span>
                          <span>
                            Replied:{" "}
                            <strong className="text-purple-600 dark:text-purple-400">
                              {proj.repliedLeads} ({proj.replyRatePercent}%)
                            </strong>
                          </span>
                          <span>
                            Won:{" "}
                            <strong className="text-emerald-600 dark:text-emerald-400">
                              {proj.wonLeads}
                            </strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breakdown by Channel */}
          <Card className="border-border/70">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-blue-500" />
                  Outreach Logs by Channel
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {report.totalOutreachLogs} total logs
                </span>
              </div>

              {report.byChannel.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No outreach logs recorded yet. Log an approach to see channel
                  metrics.
                </p>
              ) : (
                <div className="space-y-2">
                  {report.byChannel.map((ch) => {
                    const meta = OUTREACH_CHANNEL_META[ch.channel];
                    return (
                      <div
                        key={ch.channel}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {ch.totalLogs}{" "}
                            {ch.totalLogs === 1 ? "approach" : "approaches"}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Positive / Replied:{" "}
                          <strong className="text-foreground">
                            {ch.positiveOutcomes} ({ch.positiveRatePercent}%)
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
