"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Upload,
  Send,
  RefreshCw,
  Film,
  Play,
  X,
} from "lucide-react";

type Channel = {
  id: string;
  name: string;
  handle: string | null;
  token_status: string;
  notes: string | null;
};

type Video = {
  id: string;
  title: string;
  episode: string | null;
  status: string;
  privacy_status: string;
  r2_key: string | null;
  r2_size_bytes: number | null;
  youtube_video_id: string | null;
  publish_error: string | null;
  created_at: number;
};

function formatBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function YoutubeChannelDetailPage() {
  const params = useParams();
  const channelId = String(params.channelId || "");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/channels/${channelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setChannel(data.channel);
      setVideos(data.videos || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId) void load();
  }, [channelId, load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a video file");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("channelId", channelId);
      fd.set("file", file);
      if (title.trim()) fd.set("title", title.trim());
      fd.set("privacyStatus", "private");
      const res = await fetch("/api/youtube/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success("Uploaded to R2 + queued as pending");
      setFile(null);
      setTitle("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const publish = async (videoId: string, dryRun = false) => {
    setPublishingId(videoId);
    try {
      const res = await fetch(`/api/youtube/videos/${videoId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      if (data.mode === "dry_run") {
        toast.message("Dry-run OK", { description: data.message });
      } else {
        toast.success(data.message);
      }
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishingId(null);
    }
  };

  const closePreview = () => {
    setPreviewId(null);
    setPreviewUrl(null);
  };

  const openPreview = async (videoId: string) => {
    if (previewId === videoId) {
      closePreview();
      return;
    }
    setPreviewLoading(true);
    setPreviewId(videoId);
    setPreviewUrl(null);
    try {
      const res = await fetch(`/api/youtube/videos/${videoId}/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreviewUrl(data.url as string);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      closePreview();
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/youtube">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Channels
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading && !channel && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {channel && (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{channel.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {channel.handle && <span>{channel.handle}</span>}
              <Badge variant="outline">OAuth: {channel.token_status}</Badge>
              <span className="font-mono text-xs">{channel.id}</span>
            </div>
            {channel.notes && (
              <p className="mt-2 text-sm text-muted-foreground">{channel.notes}</p>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload to R2 + pending queue
              </CardTitle>
              <CardDescription>
                Files go to Cloudflare R2, then appear below as pending. Publish uses
                YouTube Data API when OAuth is ready; otherwise dry-run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={upload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium">Title (optional)</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to filename"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium">Video file</label>
                  <Input
                    type="file"
                    accept="video/mp4,video/*,.mp4"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button type="submit" disabled={uploading || !file}>
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Film className="h-4 w-4" />
                Videos / pending queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {videos.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No videos yet. Upload above or run{" "}
                  <code className="text-xs">scripts/import-eo-handoffs.mjs</code>.
                </p>
              )}
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{v.status}</Badge>
                        <Badge variant="outline">{v.privacy_status}</Badge>
                        {v.episode && <span>{v.episode}</span>}
                        <span>{formatBytes(v.r2_size_bytes)}</span>
                        {v.youtube_video_id && (
                          <span className="font-mono">yt:{v.youtube_video_id}</span>
                        )}
                      </div>
                      {v.r2_key && (
                        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {v.r2_key}
                        </div>
                      )}
                      {v.publish_error && (
                        <div className="mt-1 text-xs text-destructive">
                          {v.publish_error}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={previewId === v.id ? "secondary" : "outline"}
                        disabled={!v.r2_key || (previewLoading && previewId === v.id && !previewUrl)}
                        onClick={() => void openPreview(v.id)}
                        data-feature="yt-preview-video"
                      >
                        {previewLoading && previewId === v.id && !previewUrl ? (
                          "Loading…"
                        ) : previewId === v.id ? (
                          <>
                            <X className="mr-1 h-3.5 w-3.5" />
                            Close
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3.5 w-3.5" />
                            Preview
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={publishingId === v.id || !v.r2_key}
                        onClick={() => void publish(v.id, true)}
                      >
                        Dry-run
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          publishingId === v.id ||
                          !v.r2_key ||
                          v.status === "published"
                        }
                        onClick={() => void publish(v.id, false)}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" />
                        {publishingId === v.id ? "…" : "Publish"}
                      </Button>
                    </div>
                  </div>
                  {previewId === v.id && (
                    <div className="overflow-hidden rounded-md border border-border/60 bg-black">
                      {previewLoading && !previewUrl && (
                        <p className="p-4 text-sm text-muted-foreground">
                          Loading signed preview…
                        </p>
                      )}
                      {previewUrl && (
                        <video
                          key={previewUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-96 w-full"
                          src={previewUrl}
                        >
                          Your browser does not support video playback.
                        </video>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
