"use client";

import React, { useCallback, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KanbanMcpTokenRecord } from "@/lib/kanban/mcp/tokens";

function formatDate(ts: number | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KanbanMcpDialog() {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<KanbanMcpTokenRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const endpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/kanban/mcp`
      : "https://dashboard.potenciaapps.com.br/api/kanban/mcp";

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kanban/mcp/tokens", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load MCP tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch {
      toast.error("Could not load MCP tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadTokens();
    } else {
      setNewlyCreatedToken(null);
      setCopiedKey(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;

    setCreating(true);
    try {
      const res = await fetch("/api/kanban/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create token");
      }
      setNewlyCreatedToken(data.token);
      setTokens((prev) => [data.record, ...prev]);
      setName("");
      toast.success("MCP token created. Copy it now — it won't be shown again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/kanban/mcp/tokens/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke token");
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, revokedAt: Date.now() } : t)),
      );
      toast.success("Token revoked");
    } catch {
      toast.error("Could not revoke token");
    } finally {
      setRevokingId(null);
    }
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const tokenPlaceholder = newlyCreatedToken ?? "<YOUR_KANBAN_MCP_TOKEN>";
  const antigravityConfig = JSON.stringify(
    {
      mcpServers: {
        "potencia-kanban": {
          serverUrl: endpointUrl,
          headers: {
            Authorization: `Bearer ${tokenPlaceholder}`,
          },
        },
      },
    },
    null,
    2,
  );
  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        "potencia-kanban": {
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${tokenPlaceholder}`,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          data-testid="kanban-mcp-button"
        >
          <Bot className="h-3.5 w-3.5 text-primary" />
          MCP Access
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Kanban MCP Access
          </DialogTitle>
          <DialogDescription>
            Create a personal bearer token so your AI agents (Antigravity, Cursor,
            Claude Code) can list tasks, create cards, and change task statuses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex items-end gap-2 pt-1">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mcp-token-name" className="text-xs">
              New token label
            </Label>
            <Input
              id="mcp-token-name"
              placeholder="e.g. Antigravity, Cursor Work"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={creating}
              className="h-9 text-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={creating || !name.trim()}
            className="h-9 gap-1.5 text-xs"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Generate Token
          </Button>
        </form>

        {newlyCreatedToken && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                Copy your new token now (shown once)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => copyText("token", newlyCreatedToken)}
              >
                {copiedKey === "token" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy token
              </Button>
            </div>
            <code className="block break-all rounded bg-background px-2.5 py-1.5 text-[11px] font-mono border border-border/60">
              {newlyCreatedToken}
            </code>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              Your Tokens
            </span>
            <span className="text-[11px] text-muted-foreground">
              Endpoint: <code>/api/kanban/mcp</code>
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading tokens...
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/80 px-4 py-5 text-center text-xs text-muted-foreground">
              No tokens yet. Generate one above to connect an agent.
            </div>
          ) : (
            <ul className="space-y-2 list-none p-0 m-0">
              {tokens.map((t) => {
                const revoked = t.revokedAt !== null;
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.name}</span>
                        <code className="text-[11px] text-muted-foreground">
                          {t.tokenPrefix}…
                        </code>
                        {revoked ? (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            Revoked
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          >
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Created {formatDate(t.createdAt)} · Last used{" "}
                        {formatDate(t.lastUsedAt)}
                      </p>
                    </div>
                    {!revoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={revokingId === t.id}
                        onClick={() => handleRevoke(t.id)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        {revokingId === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">Revoke</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t border-border/60">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                Antigravity (<code>mcp_config.json</code>)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => copyText("antigravity", antigravityConfig)}
              >
                {copiedKey === "antigravity" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed border border-border/60">
              {antigravityConfig}
            </pre>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                Cursor / Streamable HTTP (<code>mcp.json</code>)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => copyText("cursor", cursorConfig)}
              >
                {copiedKey === "cursor" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed border border-border/60">
              {cursorConfig}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
