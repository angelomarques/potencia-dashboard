import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe, ShieldAlert, Monitor } from "lucide-react";
import { isAllowedPreviewUrl } from "@/lib/daisy/preview-allowlist";

interface PreviewPanelProps {
  previewUrl: string | null;
  isAllowed?: boolean;
}

export function PreviewPanel({ previewUrl, isAllowed }: PreviewPanelProps) {
  const allowed =
    isAllowed !== undefined
      ? isAllowed
      : isAllowedPreviewUrl(previewUrl);

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-pink-500" />
          <h2 className="text-sm font-semibold text-foreground">Live Preview</h2>
        </div>
        {previewUrl && allowed && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              <span>Open in new tab</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>

      {/* Main Preview Container */}
      {!previewUrl ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center h-[70vh] border-dashed bg-muted/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <Globe className="h-6 w-6 opacity-60" />
          </div>
          <CardTitle className="text-base">No Preview</CardTitle>
          <CardDescription className="max-w-xs text-xs mt-1">
            Daisy has not deployed a preview for this project yet. Once a preview URL is sent, it will appear here live.
          </CardDescription>
        </Card>
      ) : !allowed ? (
        <Card
          data-testid="preview-blocked"
          className="flex flex-col items-center justify-center p-8 text-center h-[70vh] border-destructive/40 bg-destructive/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-base text-destructive">
            Preview blocked: origin not allowed
          </CardTitle>
          <CardDescription className="max-w-md text-xs mt-2 text-muted-foreground space-y-1">
            <p>
              The preview URL <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">{previewUrl}</code> is not in the allowlist.
            </p>
            <p>
              Only HTTPS URLs from authorized domains (*.vercel.app, *.potenciaapps.com.br, or configured in DAISY_PREVIEW_ALLOWED_ORIGINS) can be embedded.
            </p>
          </CardDescription>
        </Card>
      ) : (
        <div className="relative flex-1">
          <iframe
            data-testid="preview-iframe"
            src={previewUrl}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-[70vh] rounded border bg-background shadow-xs"
            title="Live preview"
          />
        </div>
      )}
    </div>
  );
}
