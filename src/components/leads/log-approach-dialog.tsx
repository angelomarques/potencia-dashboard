"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deriveLeadStatusFromOutcome,
  LEAD_STATUSES,
  LEAD_STATUS_META,
  OUTREACH_CHANNELS,
  OUTREACH_CHANNEL_META,
  OUTREACH_OUTCOMES,
  OUTREACH_OUTCOME_META,
  type LeadStatus,
  type LeadWithStats,
  type OutreachChannel,
  type OutreachDirection,
  type OutreachOutcome,
} from "@/lib/leads/types";
import { CalendarClock, Loader2, Send } from "lucide-react";

function toLocalDateTimeInputValue(ms: number | null | undefined): string {
  if (!ms || Number.isNaN(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInputValue(val: string): number | null {
  if (!val.trim()) return null;
  const parsed = new Date(val).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

interface LogApproachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadWithStats | null;
  onSubmitLog: (
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
  ) => Promise<void>;
}

function LogApproachForm({
  lead,
  onSubmitLog,
  onClose,
}: {
  lead: LeadWithStats;
  onSubmitLog: LogApproachDialogProps["onSubmitLog"];
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<OutreachChannel>(
    lead.lastChannel || "email",
  );
  const [direction, setDirection] = useState<OutreachDirection>("outbound");
  const [outcome, setOutcome] = useState<OutreachOutcome>("sent");
  const [approachedAtStr, setApproachedAtStr] = useState(() =>
    toLocalDateTimeInputValue(Date.now()),
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [nextFollowUpStr, setNextFollowUpStr] = useState(
    toLocalDateTimeInputValue(lead.nextFollowUpAt),
  );
  const [statusMode, setStatusMode] = useState<"auto" | LeadStatus>("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const predictedStatus = deriveLeadStatusFromOutcome(lead.status, outcome);

  const setFollowUpDaysFromNow = (days: number) => {
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    target.setHours(10, 0, 0, 0);
    setNextFollowUpStr(toLocalDateTimeInputValue(target.getTime()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const approachedAt =
        fromLocalDateTimeInputValue(approachedAtStr) ?? Date.now();
      const nextFollowUpAt = fromLocalDateTimeInputValue(nextFollowUpStr);

      await onSubmitLog(lead.id, {
        channel,
        direction,
        outcome,
        subject: subject.trim() || null,
        message: message.trim() || null,
        approachedAt,
        nextFollowUpAt,
        autoUpdateStatus: statusMode === "auto",
        explicitStatus: statusMode === "auto" ? undefined : statusMode,
      });
      onClose();
    } catch {
      // Handled by caller toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {lead.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {lead.company || lead.email || "No company specified"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[11px] uppercase">
            {lead.projectSlug}
          </Badge>
          <Badge
            variant="outline"
            className={LEAD_STATUS_META[lead.status].badgeClass}
          >
            {LEAD_STATUS_META[lead.status].label}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Channel *</Label>
          <Select
            value={channel}
            onValueChange={(v) => setChannel(v as OutreachChannel)}
            disabled={isSubmitting}
          >
            <SelectTrigger data-testid="log-channel-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTREACH_CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {OUTREACH_CHANNEL_META[ch].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Direction</Label>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as OutreachDirection)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound (We approached)</SelectItem>
              <SelectItem value="inbound">Inbound (Lead reached out)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Outcome *</Label>
          <Select
            value={outcome}
            onValueChange={(v) => setOutcome(v as OutreachOutcome)}
            disabled={isSubmitting}
          >
            <SelectTrigger data-testid="log-outcome-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTREACH_OUTCOMES.map((out) => (
                <SelectItem key={out} value={out}>
                  {OUTREACH_OUTCOME_META[out].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="log-approached-at">Time Approached *</Label>
          <Input
            id="log-approached-at"
            type="datetime-local"
            value={approachedAtStr}
            onChange={(e) => setApproachedAtStr(e.target.value)}
            required
            disabled={isSubmitting}
            data-testid="log-approached-at-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Lead Pipeline Status After Log</Label>
          <Select
            value={statusMode}
            onValueChange={(v) => setStatusMode(v as "auto" | LeadStatus)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Auto ({LEAD_STATUS_META[predictedStatus].label})
              </SelectItem>
              {LEAD_STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  Set to: {LEAD_STATUS_META[st].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="log-subject">Subject / Angle</Label>
        <Input
          id="log-subject"
          placeholder="e.g. Follow-up on Lawa case automation demo"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={isSubmitting}
          data-testid="log-subject-input"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="log-message">Message / Call Notes</Label>
        <Textarea
          id="log-message"
          placeholder="Paste the message sent, call summary, or key objection/response..."
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isSubmitting}
          data-testid="log-message-input"
        />
      </div>

      <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label
            htmlFor="log-next-followup"
            className="text-xs flex items-center gap-1.5"
          >
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            Next Follow-up Reminder
          </Label>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setFollowUpDaysFromNow(2)}
            >
              +2d
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setFollowUpDaysFromNow(4)}
            >
              +4d
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setFollowUpDaysFromNow(7)}
            >
              +1w
            </Button>
            {nextFollowUpStr && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => setNextFollowUpStr("")}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <Input
          id="log-next-followup"
          type="datetime-local"
          className="h-8 text-xs mt-1.5"
          value={nextFollowUpStr}
          onChange={(e) => setNextFollowUpStr(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit-approach-log"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save Approach Log
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LogApproachDialog({
  open,
  onOpenChange,
  lead,
  onSubmitLog,
}: LogApproachDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Log Outbound Approach</DialogTitle>
          <DialogDescription>
            Record when and how this lead was approached, along with the outcome
            and next follow-up date.
          </DialogDescription>
        </DialogHeader>

        {open && lead && (
          <LogApproachForm
            key={`${lead.id}-${open}`}
            lead={lead}
            onSubmitLog={onSubmitLog}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
