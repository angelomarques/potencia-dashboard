import React from "react";
import { fetchHelpCenterMessages } from "@/lib/posthog/help-center";
import { RefreshButton } from "@/components/help-center/refresh-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Fingerprint,
  FolderGit2,
  HelpCircle,
  Inbox,
  Mail,
  User,
} from "lucide-react";

export const dynamic = "force-dynamic";

function formatTimestamp(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return timestamp;
    return d.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return timestamp;
  }
}

export default async function HelpCenterPage() {
  const result = await fetchHelpCenterMessages();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
              <HelpCircle className="h-7 w-7 text-blue-500" />
              Help Center Inbox
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Read help-center messages captured in PostHog, grouped by project.
            </p>
          </div>
          <RefreshButton />
        </div>

        {/* Missing Credentials State */}
        {result.status === "missing_credentials" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">
                  Missing PostHog Credentials
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Help-center inquiries are queried from PostHog via HogQL. To enable querying, configure the following server environment variable(s):
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {result.missingEnvVars.map((envName) => (
                    <code
                      key={envName}
                      className="rounded bg-background/80 px-2 py-1 text-xs font-mono font-semibold text-foreground border border-border"
                    >
                      {envName}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Query host can also be customized via{" "}
                  <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[11px]">
                    NEXT_PUBLIC_POSTHOG_UI_HOST
                  </code>{" "}
                  or{" "}
                  <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[11px]">
                    NEXT_PUBLIC_POSTHOG_HOST
                  </code>
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {result.status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">
                  Failed to Load PostHog Messages
                </h2>
                <p className="text-xs leading-relaxed">{result.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Grouped Layout */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                Messages by Project
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {result.groups.length}{" "}
                {result.groups.length === 1 ? "project" : "projects"}
              </Badge>
              {result.status === "success" && (
                <Badge variant="secondary" className="text-xs">
                  {result.totalCount}{" "}
                  {result.totalCount === 1 ? "message" : "messages"}
                </Badge>
              )}
            </div>
          </div>

          {/* Empty Grouped Layout (when no messages or missing credentials or error) */}
          {result.groups.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 mb-3 text-muted-foreground">
                  <Inbox className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold">
                  {result.status === "missing_credentials"
                    ? "Awaiting PostHog credentials"
                    : result.status === "error"
                    ? "No messages available"
                    : "No help-center messages found"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                  {result.status === "missing_credentials"
                    ? "Once credentials are configured in .env, help-center events ending with _help_center_submitted will be displayed here grouped by project prefix (e.g. lw, pf, app)."
                    : result.status === "error"
                    ? "Resolve the error above and click refresh to retry the query."
                    : "No events ending with _help_center_submitted were returned by the PostHog query."}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Groups with Messages */}
          {result.groups.length > 0 && (
            <div className="space-y-8">
              {result.groups.map((group) => (
                <section
                  key={group.project}
                  className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4 shadow-sm"
                >
                  {/* Group Header: Project Prefix and count */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2.5">
                      <Badge
                        variant="default"
                        className="font-mono text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider"
                      >
                        {group.project || "(default)"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {group.messages.length}{" "}
                        {group.messages.length === 1 ? "message" : "messages"}
                      </span>
                    </div>
                  </div>

                  {/* Messages inside group (sorted newest first) */}
                  <div className="grid gap-3">
                    {group.messages.map((msg, idx) => (
                      <Card
                        key={`${msg.distinctId}-${msg.timestamp}-${idx}`}
                        className="transition-colors hover:border-primary/40 bg-card"
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Message metadata row: Timestamp, Distinct ID, Event name */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span title={msg.timestamp} className="font-medium text-foreground">
                                {formatTimestamp(msg.timestamp)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div
                                className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50"
                                title={`distinct_id: ${msg.distinctId}`}
                              >
                                <Fingerprint className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                                <span className="text-[10px] uppercase text-muted-foreground/60 mr-0.5">
                                  id:
                                </span>
                                <span className="max-w-[180px] sm:max-w-[280px] truncate">
                                  {msg.distinctId || "—"}
                                </span>
                              </div>

                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] text-muted-foreground bg-muted/30"
                              >
                                {msg.event}
                              </Badge>
                            </div>
                          </div>

                          {/* Email & Account Email row */}
                          <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-border/40 text-xs">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">Email:</span>
                              <span className="font-medium text-foreground truncate">
                                {msg.email || <span className="text-muted-foreground/60">—</span>}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">Account email:</span>
                              <span className="font-medium text-foreground truncate">
                                {msg.accountEmail || <span className="text-muted-foreground/60">—</span>}
                              </span>
                            </div>
                          </div>

                          {/* Message Body */}
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Message:
                            </span>
                            <div className="rounded-md bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed border border-border/50 font-sans">
                              {msg.message ? (
                                msg.message
                              ) : (
                                <span className="italic text-muted-foreground">
                                  (No message content)
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
