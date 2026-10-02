"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Video, RefreshCw, ChevronRight } from "lucide-react";

type Channel = {
  id: string;
  name: string;
  handle: string | null;
  youtube_channel_id: string | null;
  token_status: string;
  notes: string | null;
  has_refresh_token?: number;
};

export default function VideoChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/channels");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setChannels(data.channels || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/youtube/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          handle: handle.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success(`Channel “${data.channel.name}” created`);
      setName("");
      setHandle("");
      setNotes("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Video className="h-7 w-7 text-red-500" />
            YouTube Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-channel queue: media on R2 → pending → publish (YouTube Data API).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add channel</CardTitle>
          <CardDescription>
            Register any YouTube channel. OAuth refresh tokens can be attached later
            (never commit secrets).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Empire Oddities"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Handle</label>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@empire.oddities"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Add channel"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading channels…</p>
        )}
        {!loading && channels.length === 0 && (
          <p className="text-sm text-muted-foreground">No channels yet.</p>
        )}
        {channels.map((ch) => (
          <Link key={ch.id} href={`/youtube/${ch.id}`}>
            <Card className="transition-colors hover:border-primary/40 hover:bg-muted/30">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{ch.name}</span>
                    {ch.handle && (
                      <span className="text-sm text-muted-foreground">
                        {ch.handle}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        ch.token_status === "ready" ? "default" : "outline"
                      }
                    >
                      OAuth: {ch.token_status}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {ch.id}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
