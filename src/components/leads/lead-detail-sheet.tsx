"use client";

import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  type LeadOutreachLog,
  type LeadStatus,
  type LeadWithStats,
} from "@/lib/leads/types";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Clock,
  ExternalLink,
  FolderGit2,
  Globe,
  Link2,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
} from "lucide-react";

function formatFullTimestamp(ms: number | null | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

interface LeadDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadWithStats | null;
  projectLabel: string;
  logs: LeadOutreachLog[];
  nowMs: number;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<void>;
  onOpenLogDialog: (lead: LeadWithStats) => void;
  onEditLead: (lead: LeadWithStats) => void;
  onDeleteLead: (leadId: string) => Promise<void>;
  onDeleteLog: (leadId: string, logId: string) => Promise<void>;
}

export function LeadDetailSheet({
  open,
  onOpenChange,
  lead,
  projectLabel,
  logs,
  nowMs,
  onStatusChange,
  onOpenLogDialog,
  onEditLead,
  onDeleteLead,
  onDeleteLog,
}: LeadDetailSheetProps) {
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  if (!lead) return null;

  const isOverdueFollowUp =
    lead.nextFollowUpAt != null &&
    lead.nextFollowUpAt < nowMs &&
    lead.status !== "won" &&
    lead.status !== "lost";

  const handleConfirmDeleteLead = async () => {
    setIsDeletingLead(true);
    try {
      await onDeleteLead(lead.id);
      onOpenChange(false);
    } finally {
      setIsDeletingLead(false);
    }
  };

  const handleRemoveLog = async (logId: string) => {
    setDeletingLogId(logId);
    try {
      await onDeleteLog(lead.id, logId);
    } finally {
      setDeletingLogId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-5 p-6"
        data-testid="lead-detail-sheet"
      >
        <SheetHeader className="space-y-2 border-b border-border/70 pb-4 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="gap-1 font-mono text-[11px] uppercase tracking-wider"
            >
              <FolderGit2 className="h-3 w-3 text-primary" />
              {projectLabel}
            </Badge>
            {lead.source && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Source: {lead.source}
              </Badge>
            )}
          </div>

          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-bold tracking-tight truncate">
                {lead.name}
              </SheetTitle>
              <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                {lead.role && <span>{lead.role}</span>}
                {lead.role && lead.company && <span>·</span>}
                {lead.company && (
                  <span className="font-medium text-foreground inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {lead.company}
                  </span>
                )}
              </SheetDescription>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onEditLead(lead)}
                data-testid="sheet-edit-lead"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                disabled={isDeletingLead}
                onClick={handleConfirmDeleteLead}
                data-testid="sheet-delete-lead"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Status:
              </span>
              <Select
                value={lead.status}
                onValueChange={(val) =>
                  onStatusChange(lead.id, val as LeadStatus)
                }
              >
                <SelectTrigger className="h-8 w-[165px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: LEAD_STATUS_META[st].dotColor,
                          }}
                        />
                        {LEAD_STATUS_META[st].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => onOpenLogDialog(lead)}
              data-testid="sheet-log-approach-btn"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Log Approach
            </Button>
          </div>
        </SheetHeader>

        {/* Contact & Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs rounded-lg border border-border/70 bg-muted/25 p-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Email:</span>
            {lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="font-medium text-primary hover:underline truncate"
              >
                {lead.email}
              </a>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Phone:</span>
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="font-medium text-foreground hover:underline truncate"
              >
                {lead.phone}
              </a>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Website:</span>
            {lead.website ? (
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
              >
                <span className="truncate">
                  {lead.website.replace(/^https?:\/\//i, "")}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">Social:</span>
            {lead.linkedinUrl ? (
              <a
                href={lead.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
              >
                <span className="truncate">Profile</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">
              Last Approached:
            </span>
            <span className="font-medium text-foreground truncate">
              {formatFullTimestamp(lead.lastContactedAt)}
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">
              Next Follow-up:
            </span>
            <span
              className={`font-medium truncate ${
                isOverdueFollowUp
                  ? "text-amber-600 dark:text-amber-400 font-semibold"
                  : "text-foreground"
              }`}
            >
              {formatFullTimestamp(lead.nextFollowUpAt)}
              {isOverdueFollowUp ? " (Overdue)" : ""}
            </span>
          </div>
        </div>

        {/* Notes */}
        {lead.notes && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lead Notes
            </h3>
            <div className="rounded-lg border border-border/60 bg-card p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
              {lead.notes}
            </div>
          </div>
        )}

        {/* Outreach Timeline */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Outreach & Approach Logs ({logs.length})
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Newest first
            </span>
          </div>

          {logs.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center"
              data-testid="lead-logs-empty"
            >
              <p className="text-xs font-medium text-foreground">
                No outreach logged yet
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Click &ldquo;Log Approach&rdquo; whenever you email, message, or
                call this lead.
              </p>
            </div>
          ) : (
            <ol className="space-y-3 list-none p-0 m-0" data-testid="lead-logs-timeline">
              {logs.map((log) => {
                const chMeta =
                  OUTREACH_CHANNEL_META[log.channel] ??
                  OUTREACH_CHANNEL_META.other;
                const outMeta =
                  OUTREACH_OUTCOME_META[log.outcome] ??
                  OUTREACH_OUTCOME_META.sent;

                return (
                  <li
                    key={log.id}
                    className="rounded-lg border border-border/70 bg-card p-3.5 space-y-2 shadow-2xs"
                    data-testid="lead-log-item"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${chMeta.badgeClass}`}
                        >
                          {chMeta.label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${outMeta.badgeClass}`}
                        >
                          {outMeta.label}
                        </Badge>
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          {log.direction === "inbound" ? (
                            <>
                              <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
                              Inbound
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="h-3 w-3 text-blue-500" />
                              Outbound
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <time
                          dateTime={new Date(log.approachedAt).toISOString()}
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          {formatFullTimestamp(log.approachedAt)}
                        </time>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingLogId === log.id}
                          onClick={() => handleRemoveLog(log.id)}
                          title="Delete log entry"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span className="sr-only">Delete log entry</span>
                        </Button>
                      </div>
                    </div>

                    {log.subject && (
                      <p className="text-xs font-semibold text-foreground">
                        {log.subject}
                      </p>
                    )}

                    {log.message && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {log.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
