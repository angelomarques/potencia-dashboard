export const LEAD_STATUSES = [
  "new",
  "contacted",
  "replied",
  "meeting_booked",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_META: Record<
  LeadStatus,
  {
    label: string;
    description: string;
    badgeClass: string;
    dotColor: string;
  }
> = {
  new: {
    label: "New",
    description: "Not yet approached",
    badgeClass:
      "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    dotColor: "#94a3b8",
  },
  contacted: {
    label: "Contacted",
    description: "Initial outbound sent, awaiting response",
    badgeClass:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    dotColor: "#3b82f6",
  },
  replied: {
    label: "Replied",
    description: "Lead responded or engaged",
    badgeClass:
      "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    dotColor: "#a855f7",
  },
  meeting_booked: {
    label: "Meeting Booked",
    description: "Discovery or demo call scheduled",
    badgeClass:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dotColor: "#f59e0b",
  },
  won: {
    label: "Won",
    description: "Converted to customer / active user",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotColor: "#10b981",
  },
  lost: {
    label: "Lost",
    description: "Not a fit or declined",
    badgeClass:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotColor: "#f43f5e",
  },
};

export const OUTREACH_CHANNELS = [
  "email",
  "linkedin",
  "cold_call",
  "whatsapp",
  "instagram",
  "other",
] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_CHANNEL_META: Record<
  OutreachChannel,
  {
    label: string;
    badgeClass: string;
  }
> = {
  email: {
    label: "Email",
    badgeClass:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  linkedin: {
    label: "LinkedIn",
    badgeClass:
      "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  cold_call: {
    label: "Cold Call",
    badgeClass:
      "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  whatsapp: {
    label: "WhatsApp",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  instagram: {
    label: "Instagram",
    badgeClass:
      "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  },
  other: {
    label: "Other",
    badgeClass:
      "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  },
};

export const OUTREACH_DIRECTIONS = ["outbound", "inbound"] as const;
export type OutreachDirection = (typeof OUTREACH_DIRECTIONS)[number];

export const OUTREACH_OUTCOMES = [
  "sent",
  "no_answer",
  "voicemail",
  "replied",
  "interested",
  "meeting_booked",
  "not_interested",
  "bounced",
] as const;

export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];

export const OUTREACH_OUTCOME_META: Record<
  OutreachOutcome,
  {
    label: string;
    badgeClass: string;
  }
> = {
  sent: {
    label: "Approached / Sent",
    badgeClass:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  no_answer: {
    label: "No Answer",
    badgeClass:
      "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  voicemail: {
    label: "Voicemail Left",
    badgeClass:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  replied: {
    label: "Replied",
    badgeClass:
      "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  },
  interested: {
    label: "Interested",
    badgeClass:
      "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
  meeting_booked: {
    label: "Meeting Booked",
    badgeClass:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  not_interested: {
    label: "Not Interested",
    badgeClass:
      "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  bounced: {
    label: "Bounced / Invalid",
    badgeClass:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
};

export interface Lead {
  id: string;
  projectSlug: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  linkedinUrl: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  lastContactedAt: number | null;
  nextFollowUpAt: number | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LeadWithStats extends Lead {
  outreachCount: number;
  lastChannel: OutreachChannel | null;
  lastOutcome: OutreachOutcome | null;
  lastLogMessage: string | null;
}

export interface LeadOutreachLog {
  id: string;
  leadId: string;
  channel: OutreachChannel;
  direction: OutreachDirection;
  outcome: OutreachOutcome;
  subject: string | null;
  message: string | null;
  approachedAt: number;
  createdBy: string | null;
  createdAt: number;
}

export interface CreateLeadInput {
  projectSlug: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  status?: LeadStatus;
  notes?: string | null;
  nextFollowUpAt?: number | null;
  createdBy?: string | null;
  initialApproach?: {
    channel: OutreachChannel;
    direction?: OutreachDirection;
    outcome?: OutreachOutcome;
    subject?: string | null;
    message?: string | null;
    approachedAt?: number;
  } | null;
}

export interface UpdateLeadInput {
  projectSlug?: string;
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  status?: LeadStatus;
  notes?: string | null;
  lastContactedAt?: number | null;
  nextFollowUpAt?: number | null;
}

export interface CreateOutreachLogInput {
  leadId: string;
  channel: OutreachChannel;
  direction?: OutreachDirection;
  outcome?: OutreachOutcome;
  subject?: string | null;
  message?: string | null;
  approachedAt?: number;
  nextFollowUpAt?: number | null;
  autoUpdateStatus?: boolean;
  explicitStatus?: LeadStatus;
  createdBy?: string | null;
}

export function isValidLeadStatus(val: unknown): val is LeadStatus {
  return (
    typeof val === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(val)
  );
}

export function isValidOutreachChannel(val: unknown): val is OutreachChannel {
  return (
    typeof val === "string" &&
    (OUTREACH_CHANNELS as readonly string[]).includes(val)
  );
}

export function isValidOutreachDirection(
  val: unknown,
): val is OutreachDirection {
  return (
    typeof val === "string" &&
    (OUTREACH_DIRECTIONS as readonly string[]).includes(val)
  );
}

export function isValidOutreachOutcome(val: unknown): val is OutreachOutcome {
  return (
    typeof val === "string" &&
    (OUTREACH_OUTCOMES as readonly string[]).includes(val)
  );
}

const STATUS_PROGRESSION_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  meeting_booked: 3,
  won: 4,
  lost: -1,
};

/**
 * Determines the next lead status when a new outreach log is recorded and
 * autoUpdateStatus is enabled.
 */
export function deriveLeadStatusFromOutcome(
  currentStatus: LeadStatus,
  outcome: OutreachOutcome,
): LeadStatus {
  if (outcome === "not_interested") {
    return currentStatus === "won" ? "won" : "lost";
  }

  let candidate: LeadStatus = currentStatus;
  if (outcome === "meeting_booked") {
    candidate = "meeting_booked";
  } else if (outcome === "replied" || outcome === "interested") {
    candidate = "replied";
  } else if (
    outcome === "sent" ||
    outcome === "no_answer" ||
    outcome === "voicemail"
  ) {
    candidate = "contacted";
  }

  if (currentStatus === "lost") {
    // Re-engaging a lost lead brings them back into the active stage
    if (
      outcome === "replied" ||
      outcome === "interested" ||
      outcome === "meeting_booked"
    ) {
      return candidate;
    }
    return "lost";
  }

  const currentRank = STATUS_PROGRESSION_RANK[currentStatus] ?? 0;
  const candidateRank = STATUS_PROGRESSION_RANK[candidate] ?? 0;
  return candidateRank > currentRank ? candidate : currentStatus;
}
