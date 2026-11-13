import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveLeadStatusFromOutcome,
  isValidLeadStatus,
  isValidOutreachChannel,
  isValidOutreachOutcome,
  type LeadOutreachLog,
  type LeadWithStats,
} from "../types";
import { computeLeadsReport } from "../report";
import { mapLeadRow, mapLogRow } from "../repo";
import { splitSql } from "../../../../scripts/d1-migrate-lib.mjs";

describe("Lead Outbound Tracker - Status & Validation Logic", () => {
  it("validates statuses, channels, and outcomes", () => {
    expect(isValidLeadStatus("new")).toBe(true);
    expect(isValidLeadStatus("meeting_booked")).toBe(true);
    expect(isValidLeadStatus("invalid")).toBe(false);

    expect(isValidOutreachChannel("email")).toBe(true);
    expect(isValidOutreachChannel("linkedin")).toBe(true);
    expect(isValidOutreachChannel("whatsapp")).toBe(true);
    expect(isValidOutreachChannel("fax")).toBe(false);

    expect(isValidOutreachOutcome("sent")).toBe(true);
    expect(isValidOutreachOutcome("replied")).toBe(true);
    expect(isValidOutreachOutcome("unknown")).toBe(false);
  });

  it("advances lead status automatically based on outreach outcome", () => {
    expect(deriveLeadStatusFromOutcome("new", "sent")).toBe("contacted");
    expect(deriveLeadStatusFromOutcome("new", "voicemail")).toBe("contacted");
    expect(deriveLeadStatusFromOutcome("contacted", "replied")).toBe("replied");
    expect(deriveLeadStatusFromOutcome("contacted", "interested")).toBe(
      "replied",
    );
    expect(deriveLeadStatusFromOutcome("replied", "meeting_booked")).toBe(
      "meeting_booked",
    );
    // Does not downgrade an already advanced status on a regular follow-up send
    expect(deriveLeadStatusFromOutcome("replied", "sent")).toBe("replied");
    expect(deriveLeadStatusFromOutcome("meeting_booked", "sent")).toBe(
      "meeting_booked",
    );
    expect(deriveLeadStatusFromOutcome("won", "sent")).toBe("won");
    // Marks lost on not_interested unless already won
    expect(deriveLeadStatusFromOutcome("contacted", "not_interested")).toBe(
      "lost",
    );
    expect(deriveLeadStatusFromOutcome("won", "not_interested")).toBe("won");
    // Re-engages lost lead if they reply or book a meeting
    expect(deriveLeadStatusFromOutcome("lost", "replied")).toBe("replied");
  });
});

describe("Lead Outbound Tracker - Row Mapping", () => {
  it("maps raw D1 lead and log rows accurately", () => {
    const lead = mapLeadRow({
      id: "lead_1",
      project_slug: "lawa",
      name: "Dr. Carlos Mendes",
      role: "Senior Partner",
      email: "carlos@mendeslaw.com.br",
      phone: "+55 11 98888-7777",
      company: "Mendes Advocacia",
      website: "https://mendeslaw.com.br",
      linkedin_url: "https://linkedin.com/in/carlosmendes",
      source: "LinkedIn",
      status: "contacted",
      notes: "Focuses on corporate litigation",
      last_contacted_at: 1700005000000,
      next_follow_up_at: 1700100000000,
      created_by: "user_1",
      created_at: 1700000000000,
      updated_at: 1700005000000,
      outreach_count: 2,
      last_channel: "linkedin",
      last_outcome: "sent",
      last_log_message: "Sent connection note",
    });

    expect(lead.projectSlug).toBe("lawa");
    expect(lead.outreachCount).toBe(2);
    expect(lead.lastChannel).toBe("linkedin");
    expect(lead.status).toBe("contacted");

    const log = mapLogRow({
      id: "log_1",
      lead_id: "lead_1",
      channel: "linkedin",
      direction: "outbound",
      outcome: "replied",
      subject: "Lawa Case Automation",
      message: "Replied asking for pricing details",
      approached_at: 1700005000000,
      created_by: "user_1",
      created_at: 1700005000000,
    });

    expect(log.leadId).toBe("lead_1");
    expect(log.channel).toBe("linkedin");
    expect(log.outcome).toBe("replied");
  });
});

describe("Lead Outbound Tracker - Report Aggregation", () => {
  const now = 1700050000000;

  const sampleLeads: LeadWithStats[] = [
    {
      id: "l1",
      projectSlug: "lawa",
      name: "Marina Costa",
      role: "Partner",
      email: "marina@costa.com",
      phone: null,
      company: "Costa Law",
      website: "https://costa.com",
      linkedinUrl: null,
      source: "LinkedIn",
      status: "replied",
      notes: null,
      lastContactedAt: now - 10_000,
      nextFollowUpAt: now - 5_000, // Overdue
      createdBy: null,
      createdAt: now - 50_000,
      updatedAt: now - 10_000,
      outreachCount: 2,
      lastChannel: "email",
      lastOutcome: "replied",
      lastLogMessage: "Interested in demo",
    },
    {
      id: "l2",
      projectSlug: "lawa",
      name: "Roberto Silva",
      role: "Founder",
      email: "roberto@silva.com",
      phone: null,
      company: "Silva Advogados",
      website: null,
      linkedinUrl: null,
      source: "Google",
      status: "won",
      notes: null,
      lastContactedAt: now - 20_000,
      nextFollowUpAt: now - 5_000, // Ignored for overdue because status is won
      createdBy: null,
      createdAt: now - 60_000,
      updatedAt: now - 20_000,
      outreachCount: 3,
      lastChannel: "cold_call",
      lastOutcome: "meeting_booked",
      lastLogMessage: "Signed annual plan",
    },
    {
      id: "l3",
      projectSlug: "lawa",
      name: "Fernanda Lima",
      role: "Director",
      email: "fernanda@lima.com",
      phone: null,
      company: "Lima Legal",
      website: null,
      linkedinUrl: null,
      source: "Referral",
      status: "new",
      notes: null,
      lastContactedAt: null,
      nextFollowUpAt: now + 3600_000, // Upcoming within 72h
      createdBy: null,
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
      outreachCount: 0,
      lastChannel: null,
      lastOutcome: null,
      lastLogMessage: null,
    },
  ];

  const sampleLogs: LeadOutreachLog[] = [
    {
      id: "lg1",
      leadId: "l1",
      channel: "email",
      direction: "outbound",
      outcome: "sent",
      subject: "Intro",
      message: "First email",
      approachedAt: now - 30_000,
      createdBy: null,
      createdAt: now - 30_000,
    },
    {
      id: "lg2",
      leadId: "l1",
      channel: "email",
      direction: "inbound",
      outcome: "replied",
      subject: "Re: Intro",
      message: "Let us talk",
      approachedAt: now - 10_000,
      createdBy: null,
      createdAt: now - 10_000,
    },
    {
      id: "lg3",
      leadId: "l2",
      channel: "cold_call",
      direction: "outbound",
      outcome: "meeting_booked",
      subject: "Discovery Call",
      message: "Booked demo",
      approachedAt: now - 20_000,
      createdBy: null,
      createdAt: now - 20_000,
    },
  ];

  it("computes totals, rates, follow-up queues, and project/channel breakdowns", () => {
    const report = computeLeadsReport(sampleLeads, sampleLogs, now);

    expect(report.totalLeads).toBe(3);
    expect(report.contactedLeads).toBe(2);
    expect(report.uncontactedLeads).toBe(1);
    expect(report.engagedLeads).toBe(2); // l1 (replied) + l2 (won)
    expect(report.meetingsBooked).toBe(1); // l2 (won counts as meeting/won)
    expect(report.wonLeads).toBe(1);
    expect(report.overdueFollowUps).toBe(1); // only l1
    expect(report.dueTodayOrSoonFollowUps).toBe(1); // l3
    expect(report.replyRatePercent).toBe(100); // 2 engaged out of 2 contacted
    expect(report.byProject).toHaveLength(1);
    expect(report.byProject[0]?.projectSlug).toBe("lawa");
    expect(report.byChannel).toHaveLength(2); // email and cold_call
  });
});

describe("Migration 0005_leads_outbound.sql", () => {
  it("contains valid SQL statements for leads and lead_outreach_logs", async () => {
    const raw = await readFile(
      resolve(process.cwd(), "migrations/0005_leads_outbound.sql"),
      "utf8",
    );
    const statements = splitSql(raw);
    expect(statements.length).toBeGreaterThanOrEqual(8);
    expect(statements[0]).toMatch(/CREATE TABLE IF NOT EXISTS leads/i);
    expect(statements[1]).toMatch(
      /CREATE TABLE IF NOT EXISTS lead_outreach_logs/i,
    );
  });
});
