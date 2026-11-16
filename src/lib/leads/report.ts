import {
  LEAD_STATUSES,
  OUTREACH_CHANNELS,
  type LeadOutreachLog,
  type LeadStatus,
  type LeadWithStats,
  type OutreachChannel,
} from "./types";

export interface ProjectOutreachBreakdown {
  projectSlug: string;
  totalLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  meetingsBooked: number;
  wonLeads: number;
  lostLeads: number;
  totalLogs: number;
  replyRatePercent: number;
}

export interface ChannelOutreachBreakdown {
  channel: OutreachChannel;
  totalLogs: number;
  positiveOutcomes: number;
  positiveRatePercent: number;
}

export interface LeadsReportSummary {
  totalLeads: number;
  contactedLeads: number;
  uncontactedLeads: number;
  engagedLeads: number;
  meetingsBooked: number;
  wonLeads: number;
  lostLeads: number;
  totalOutreachLogs: number;
  avgTouchesPerContactedLead: number;
  contactRatePercent: number;
  replyRatePercent: number;
  conversionRatePercent: number;
  overdueFollowUps: number;
  dueTodayOrSoonFollowUps: number;
  byStatus: Record<LeadStatus, number>;
  byProject: ProjectOutreachBreakdown[];
  byChannel: ChannelOutreachBreakdown[];
}

const ENGAGED_STATUSES = new Set<LeadStatus>([
  "replied",
  "meeting_booked",
  "won",
]);

const POSITIVE_OUTCOMES = new Set([
  "replied",
  "interested",
  "meeting_booked",
]);

function roundPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function computeLeadsReport(
  leads: LeadWithStats[],
  logs: LeadOutreachLog[],
  now: number = Date.now(),
): LeadsReportSummary {
  const byStatus: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    replied: 0,
    meeting_booked: 0,
    won: 0,
    lost: 0,
  };

  for (const status of LEAD_STATUSES) {
    byStatus[status] = 0;
  }

  let contactedLeads = 0;
  let engagedLeads = 0;
  let meetingsBooked = 0;
  let wonLeads = 0;
  let lostLeads = 0;
  let overdueFollowUps = 0;
  let dueTodayOrSoonFollowUps = 0;
  let totalTouchesAcrossLeads = 0;

  const soonHorizonMs = now + 3 * 24 * 60 * 60 * 1000; // next 72 hours

  const projectMap = new Map<
    string,
    {
      totalLeads: number;
      contactedLeads: number;
      repliedLeads: number;
      meetingsBooked: number;
      wonLeads: number;
      lostLeads: number;
      totalLogs: number;
    }
  >();

  const leadProjectById = new Map<string, string>();

  for (const lead of leads) {
    leadProjectById.set(lead.id, lead.projectSlug);
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;

    const isContacted =
      lead.status !== "new" ||
      lead.outreachCount > 0 ||
      lead.lastContactedAt != null;
    const isEngaged = ENGAGED_STATUSES.has(lead.status);
    const isMeetingOrWon =
      lead.status === "meeting_booked" || lead.status === "won";

    if (isContacted) contactedLeads++;
    if (isEngaged) engagedLeads++;
    if (isMeetingOrWon) meetingsBooked++;
    if (lead.status === "won") wonLeads++;
    if (lead.status === "lost") lostLeads++;

    totalTouchesAcrossLeads += lead.outreachCount;

    if (
      lead.nextFollowUpAt != null &&
      lead.status !== "won" &&
      lead.status !== "lost"
    ) {
      if (lead.nextFollowUpAt < now) {
        overdueFollowUps++;
      } else if (lead.nextFollowUpAt <= soonHorizonMs) {
        dueTodayOrSoonFollowUps++;
      }
    }

    const projStats = projectMap.get(lead.projectSlug) ?? {
      totalLeads: 0,
      contactedLeads: 0,
      repliedLeads: 0,
      meetingsBooked: 0,
      wonLeads: 0,
      lostLeads: 0,
      totalLogs: 0,
    };
    projStats.totalLeads++;
    if (isContacted) projStats.contactedLeads++;
    if (isEngaged) projStats.repliedLeads++;
    if (isMeetingOrWon) projStats.meetingsBooked++;
    if (lead.status === "won") projStats.wonLeads++;
    if (lead.status === "lost") projStats.lostLeads++;
    projStats.totalLogs += lead.outreachCount;
    projectMap.set(lead.projectSlug, projStats);
  }

  const channelMap = new Map<
    OutreachChannel,
    { totalLogs: number; positiveOutcomes: number }
  >();
  for (const ch of OUTREACH_CHANNELS) {
    channelMap.set(ch, { totalLogs: 0, positiveOutcomes: 0 });
  }

  for (const log of logs) {
    const chStats = channelMap.get(log.channel) ?? {
      totalLogs: 0,
      positiveOutcomes: 0,
    };
    chStats.totalLogs++;
    if (POSITIVE_OUTCOMES.has(log.outcome)) {
      chStats.positiveOutcomes++;
    }
    channelMap.set(log.channel, chStats);
  }

  const totalLeads = leads.length;
  const uncontactedLeads = Math.max(0, totalLeads - contactedLeads);
  const totalOutreachLogs = Math.max(logs.length, totalTouchesAcrossLeads);

  const avgTouchesPerContactedLead =
    contactedLeads > 0
      ? Math.round((totalOutreachLogs / contactedLeads) * 10) / 10
      : 0;

  const byProject: ProjectOutreachBreakdown[] = Array.from(
    projectMap.entries(),
  )
    .map(([projectSlug, s]) => ({
      projectSlug,
      ...s,
      replyRatePercent: roundPercent(s.repliedLeads, s.contactedLeads),
    }))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  const byChannel: ChannelOutreachBreakdown[] = OUTREACH_CHANNELS.map(
    (channel) => {
      const s = channelMap.get(channel) ?? {
        totalLogs: 0,
        positiveOutcomes: 0,
      };
      return {
        channel,
        totalLogs: s.totalLogs,
        positiveOutcomes: s.positiveOutcomes,
        positiveRatePercent: roundPercent(s.positiveOutcomes, s.totalLogs),
      };
    },
  ).filter((c) => c.totalLogs > 0);

  return {
    totalLeads,
    contactedLeads,
    uncontactedLeads,
    engagedLeads,
    meetingsBooked,
    wonLeads,
    lostLeads,
    totalOutreachLogs,
    avgTouchesPerContactedLead,
    contactRatePercent: roundPercent(contactedLeads, totalLeads),
    replyRatePercent: roundPercent(engagedLeads, contactedLeads),
    conversionRatePercent: roundPercent(wonLeads, totalLeads),
    overdueFollowUps,
    dueTodayOrSoonFollowUps,
    byStatus,
    byProject,
    byChannel,
  };
}
