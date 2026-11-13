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
  OUTREACH_CHANNELS,
  OUTREACH_CHANNEL_META,
  OUTREACH_OUTCOMES,
  OUTREACH_OUTCOME_META,
  type CreateLeadInput,
  type LeadStatus,
  type LeadWithStats,
  type OutreachChannel,
  type OutreachOutcome,
  type UpdateLeadInput,
} from "@/lib/leads/types";
import type { LeadProjectOption } from "@/lib/leads/repo";
import { Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";

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

interface LeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: LeadProjectOption[];
  defaultProjectSlug?: string;
  lead?: LeadWithStats | null;
  onCreate: (input: CreateLeadInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateLeadInput) => Promise<void>;
}

interface LeadFormProps {
  projects: LeadProjectOption[];
  defaultProjectSlug?: string;
  lead?: LeadWithStats | null;
  onCreate: (input: CreateLeadInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateLeadInput) => Promise<void>;
  onClose: () => void;
}

function LeadDialogForm({
  projects,
  defaultProjectSlug,
  lead,
  onCreate,
  onUpdate,
  onClose,
}: LeadFormProps) {
  const isEditing = Boolean(lead);

  const initialProject =
    lead?.projectSlug ||
    (defaultProjectSlug && defaultProjectSlug !== "all"
      ? defaultProjectSlug
      : projects[0]?.slug || "lawa");

  const [projectSlug, setProjectSlug] = useState(initialProject);
  const [name, setName] = useState(lead?.name || "");
  const [role, setRole] = useState(lead?.role || "");
  const [company, setCompany] = useState(lead?.company || "");
  const [website, setWebsite] = useState(lead?.website || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [linkedinUrl, setLinkedinUrl] = useState(lead?.linkedinUrl || "");
  const [source, setSource] = useState(lead?.source || "");
  const [status, setStatus] = useState<LeadStatus>(lead?.status || "new");
  const [nextFollowUpStr, setNextFollowUpStr] = useState(
    toLocalDateTimeInputValue(lead?.nextFollowUpAt),
  );
  const [notes, setNotes] = useState(lead?.notes || "");

  // Optional initial approach when creating a new lead
  const [logInitialApproach, setLogInitialApproach] = useState(false);
  const [approachChannel, setApproachChannel] =
    useState<OutreachChannel>("email");
  const [approachOutcome, setApproachOutcome] =
    useState<OutreachOutcome>("sent");
  const [approachedAtStr, setApproachedAtStr] = useState(() =>
    toLocalDateTimeInputValue(Date.now()),
  );
  const [approachSubject, setApproachSubject] = useState("");
  const [approachMessage, setApproachMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Lead name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nextFollowUpAt = fromLocalDateTimeInputValue(nextFollowUpStr);

      if (isEditing && lead) {
        await onUpdate(lead.id, {
          projectSlug,
          name: name.trim(),
          role: role.trim() || null,
          company: company.trim() || null,
          website: website.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          source: source.trim() || null,
          status,
          nextFollowUpAt,
          notes: notes.trim() || null,
        });
      } else {
        const approachedAt =
          fromLocalDateTimeInputValue(approachedAtStr) ?? Date.now();
        await onCreate({
          projectSlug,
          name: name.trim(),
          role: role.trim() || null,
          company: company.trim() || null,
          website: website.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          source: source.trim() || null,
          status,
          nextFollowUpAt,
          notes: notes.trim() || null,
          initialApproach: logInitialApproach
            ? {
                channel: approachChannel,
                direction: "outbound",
                outcome: approachOutcome,
                subject: approachSubject.trim() || null,
                message: approachMessage.trim() || null,
                approachedAt,
              }
            : null,
        });
      }
      onClose();
    } catch {
      // Error surfaced via caller toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 py-1 max-h-[75vh] overflow-y-auto pr-1"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="lead-name">Lead Name *</Label>
          <Input
            id="lead-name"
            placeholder="e.g. Marina Costa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            disabled={isSubmitting}
            data-testid="lead-name-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-project">Related Project *</Label>
          <Select
            value={projectSlug}
            onValueChange={setProjectSlug}
            disabled={isSubmitting}
          >
            <SelectTrigger id="lead-project" data-testid="lead-project-select">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.name} ({p.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="lead-company">Company / Firm</Label>
          <Input
            id="lead-company"
            placeholder="e.g. Costa & Associados"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={isSubmitting}
            data-testid="lead-company-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-role">Role / Title</Label>
          <Input
            id="lead-role"
            placeholder="e.g. Managing Partner"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="lead-email">Email</Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="marina@costaadv.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            data-testid="lead-email-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-phone">Phone / WhatsApp</Label>
          <Input
            id="lead-phone"
            type="tel"
            placeholder="+55 11 99999-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="lead-website">Website</Label>
          <Input
            id="lead-website"
            placeholder="https://costaadv.com.br"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            disabled={isSubmitting}
            data-testid="lead-website-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-linkedin">LinkedIn / Social URL</Label>
          <Input
            id="lead-linkedin"
            placeholder="https://linkedin.com/in/marinacosta"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="space-y-1.5">
          <Label>Pipeline Status</Label>
          <Select
            value={status}
            onValueChange={(val) => setStatus(val as LeadStatus)}
            disabled={isSubmitting}
          >
            <SelectTrigger data-testid="lead-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: LEAD_STATUS_META[st].dotColor }}
                    />
                    {LEAD_STATUS_META[st].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-source">Lead Source</Label>
          <Input
            id="lead-source"
            placeholder="LinkedIn, Referral, Google..."
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-followup">Next Follow-up</Label>
          <Input
            id="lead-followup"
            type="datetime-local"
            value={nextFollowUpStr}
            onChange={(e) => setNextFollowUpStr(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-notes">Lead Context & Notes</Label>
        <Textarea
          id="lead-notes"
          placeholder="Key pain points, firm size, personalization notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          disabled={isSubmitting}
        />
      </div>

      {!isEditing && (
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <PlusCircle className="h-3.5 w-3.5 text-primary" />
                Log initial approach right now
              </p>
              <p className="text-[11px] text-muted-foreground">
                Record the timestamp and channel if you already approached this
                lead.
              </p>
            </div>
            <Button
              type="button"
              variant={logInitialApproach ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLogInitialApproach((prev) => !prev)}
              data-testid="toggle-initial-approach"
            >
              {logInitialApproach ? "Logging Approach" : "Add Approach Log"}
            </Button>
          </div>

          {logInitialApproach && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Channel</Label>
                  <Select
                    value={approachChannel}
                    onValueChange={(v) =>
                      setApproachChannel(v as OutreachChannel)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="h-8 text-xs">
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

                <div className="space-y-1">
                  <Label className="text-xs">Outcome</Label>
                  <Select
                    value={approachOutcome}
                    onValueChange={(v) =>
                      setApproachOutcome(v as OutreachOutcome)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="h-8 text-xs">
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

                <div className="space-y-1">
                  <Label htmlFor="init-approached-at" className="text-xs">
                    Time Approached
                  </Label>
                  <Input
                    id="init-approached-at"
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={approachedAtStr}
                    onChange={(e) => setApproachedAtStr(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="init-subject" className="text-xs">
                  Subject / Hook
                </Label>
                <Input
                  id="init-subject"
                  placeholder="e.g. Automating legal intake at Costa & Associados"
                  className="h-8 text-xs"
                  value={approachSubject}
                  onChange={(e) => setApproachSubject(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="init-message" className="text-xs">
                  Approach Notes / Message Summary
                </Label>
                <Textarea
                  id="init-message"
                  placeholder="What message was sent or discussed during the approach..."
                  className="text-xs"
                  rows={2}
                  value={approachMessage}
                  onChange={(e) => setApproachMessage(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}
        </div>
      )}

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
          disabled={isSubmitting || !name.trim()}
          data-testid="save-lead-submit"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Lead"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LeadDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectSlug,
  lead,
  onCreate,
  onUpdate,
}: LeadDialogProps) {
  const isEditing = Boolean(lead);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update lead contact details, project assignment, or pipeline stage."
              : "Track a new outbound prospect and link it to a dashboard project."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <LeadDialogForm
            key={lead ? lead.id : `new-${defaultProjectSlug || "all"}`}
            projects={projects}
            defaultProjectSlug={defaultProjectSlug}
            lead={lead}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
