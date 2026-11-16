-- Lead Outbound Tracker & Reporting schema

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  project_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  website TEXT,
  linkedin_url TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  last_contacted_at INTEGER,
  next_follow_up_at INTEGER,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS lead_outreach_logs (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  direction TEXT NOT NULL DEFAULT 'outbound',
  outcome TEXT NOT NULL DEFAULT 'sent',
  subject TEXT,
  message TEXT,
  approached_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_leads_project_slug ON leads(project_slug);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at ASC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_logs_lead_id ON lead_outreach_logs(lead_id, approached_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_logs_approached_at ON lead_outreach_logs(approached_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_logs_channel ON lead_outreach_logs(channel);
