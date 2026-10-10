"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck,
  FileUp,
  Image as ImageIcon,
  Loader2,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { orpc } from "@/lib/daisy/orpc/client";
import type { DaisyGate, DaisyReference } from "@/lib/daisy/types";

interface GateBoxProps {
  gate: DaisyGate;
  projectId: string;
}

export function GateBox({ gate, projectId }: GateBoxProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(gate.notes || "");
  const [uploadedReferences, setUploadedReferences] = useState<DaisyReference[]>(
    gate.references || []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  // If gate is resolved (continued or submitted), render compact summary
  if (gate.status !== "open") {
    const isSubmitted = gate.status === "submitted";
    const resolvedAgo = gate.resolvedAt
      ? formatDistanceToNow(new Date(gate.resolvedAt), { addSuffix: true })
      : "";

    return (
      <Card
        data-testid="gate-box"
        className="my-3 border-border/70 bg-muted/30 p-3.5 transition-all text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-foreground">
              Section Gate: {gate.section}
            </span>
            <Badge
              variant="outline"
              className={
                isSubmitted
                  ? "bg-primary/10 text-primary border-primary/20 text-[10px]"
                  : "bg-muted text-muted-foreground text-[10px]"
              }
            >
              {gate.status}
            </Badge>
          </div>
          {resolvedAgo && (
            <span className="text-[11px] text-muted-foreground">
              Resolved {resolvedAgo}
            </span>
          )}
        </div>

        {isSubmitted ? (
          <div className="mt-2 space-y-1.5 pl-8 text-muted-foreground">
            {gate.notes && (
              <p className="italic text-foreground">&ldquo;{gate.notes}&rdquo;</p>
            )}
            {gate.references && gate.references.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <FileCheck className="h-3 w-3 text-emerald-600" />
                <span>
                  {gate.references.length} reference file(s) attached
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-1 pl-8 text-[11px] text-muted-foreground">
            Gate passed without extra references.
          </p>
        )}
      </Card>
    );
  }

  // Gate is open
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const newRefs: DaisyReference[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `/api/daisy/references?projectId=${encodeURIComponent(
            projectId
          )}&gateId=${encodeURIComponent(gate.id)}`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to upload ${file.name}`);
        }

        const ref: DaisyReference = await res.json();
        newRefs.push(ref);
      }

      setUploadedReferences((prev) => [...prev, ...newRefs]);
      toast.success(
        `Uploaded ${newRefs.length} reference image${newRefs.length === 1 ? "" : "s"}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleRemoveRef = (key: string) => {
    setUploadedReferences((prev) => prev.filter((r) => r.key !== key));
  };

  const handleSubmit = async () => {
    const trimmedNotes = notes.trim();
    if (!trimmedNotes && uploadedReferences.length === 0) {
      toast.error("Please add notes or upload reference images before submitting.");
      return;
    }

    try {
      setIsSubmitting(true);
      await orpc.daisy.resolveGate({
        gateId: gate.id,
        action: "submit",
        notes: trimmedNotes || null,
        references: uploadedReferences,
      });
      toast.success("Gate submitted with feedback!");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit gate";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    try {
      setIsContinuing(true);
      await orpc.daisy.resolveGate({
        gateId: gate.id,
        action: "continue",
      });
      toast.success("Gate continued to next step.");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to continue";
      toast.error(message);
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <Card
      data-testid="gate-box"
      className="my-4 border-amber-500/40 bg-amber-500/[0.03] shadow-sm transition-all"
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                Section Handoff Gate: {gate.section}
              </CardTitle>
              <CardDescription className="text-xs">
                Daisy needs your approval or reference input to continue.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs"
          >
            Gate Open
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3.5">
        {gate.prompt && (
          <div className="rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200 border border-amber-500/20">
            <span className="font-semibold">Daisy&apos;s request: </span>
            {gate.prompt}
          </div>
        )}

        {/* File upload input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground flex items-center justify-between">
            <span>Reference Images</span>
            <span className="text-[11px] text-muted-foreground">
              PNG, JPG, WebP, GIF ≤ 10MB
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              data-testid="gate-file-input"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileUpload}
              disabled={isUploading || isSubmitting || isContinuing}
              className="block w-full text-xs text-muted-foreground file:mr-2 file:h-8 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer border rounded-md p-1 bg-background"
            />
            {isUploading && (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
            )}
          </div>
        </div>

        {/* Uploaded references list */}
        {uploadedReferences.length > 0 && (
          <div className="space-y-1 rounded-md border border-border/70 bg-background/50 p-2">
            <span className="text-[11px] font-medium text-muted-foreground block mb-1">
              Attached References ({uploadedReferences.length})
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {uploadedReferences.map((ref) => (
                <div
                  key={ref.key}
                  className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{ref.filename}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ({Math.round(ref.sizeBytes / 1024)} KB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRef(ref.key)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Notes & Feedback (optional if images attached)
          </label>
          <Textarea
            data-testid="gate-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add specific instructions, changes or feedback for Daisy..."
            className="min-h-[70px] text-xs resize-y"
            disabled={isSubmitting || isContinuing}
          />
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-wrap items-center justify-end gap-2 border-t border-amber-500/20 pt-3">
        <Button
          data-testid="gate-continue"
          variant="outline"
          size="sm"
          onClick={handleContinue}
          disabled={isContinuing || isSubmitting || isUploading}
          className="text-xs h-8"
        >
          {isContinuing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 mr-1" />
          )}
          Continue
        </Button>
        <Button
          data-testid="gate-submit"
          size="sm"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            isContinuing ||
            isUploading ||
            (!notes.trim() && uploadedReferences.length === 0)
          }
          className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-medium"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5 mr-1" />
          )}
          Submit references
        </Button>
      </CardFooter>
    </Card>
  );
}
