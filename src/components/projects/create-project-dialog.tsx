"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getProjectSlugError,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
  PROJECT_TAGLINE_MAX_LENGTH,
  slugifyProjectName,
} from "@/lib/projects/slug";

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setTagline("");
    setSubmitError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = e.target.value;
    setName(nextName);
    setSubmitError(null);
    if (!slugTouched) {
      setSlug(slugifyProjectName(nextName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextSlug = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setSlugTouched(true);
    setSlug(nextSlug);
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setSubmitError("Project name is required.");
      return;
    }

    const cleanSlug = (slug.trim() || slugifyProjectName(cleanName)).toLowerCase();
    const slugError = getProjectSlugError(cleanSlug);
    if (slugError) {
      setSubmitError(slugError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          slug: cleanSlug,
          tagline: tagline.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: { name: string; slug: string };
      };
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create project");
      }

      toast.success(`Project "${data.project?.name ?? cleanName}" created`);
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create project";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveSlug = slug || slugifyProjectName(name);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          data-testid="create-project-button"
        >
          <Plus className="h-3.5 w-3.5" />
          New Project
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" />
            Create Project
          </DialogTitle>
          <DialogDescription>
            Create a new workspace with its own kanban board.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs">
              Project name
            </Label>
            <Input
              id="project-name"
              data-testid="project-name-input"
              placeholder="e.g. Acme Studio"
              value={name}
              onChange={handleNameChange}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              required
              autoFocus
              disabled={isSubmitting}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-slug" className="text-xs">
              Slug
            </Label>
            <Input
              id="project-slug"
              data-testid="project-slug-input"
              placeholder="e.g. acme-studio"
              value={slug}
              onChange={handleSlugChange}
              maxLength={PROJECT_SLUG_MAX_LENGTH}
              required
              disabled={isSubmitting}
              className="h-9 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Board URL:{" "}
              <code className="text-foreground">
                /projects/{effectiveSlug || "..."}
              </code>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-tagline" className="text-xs">
              Tagline <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="project-tagline"
              data-testid="project-tagline-input"
              placeholder="Short description of this workspace"
              value={tagline}
              onChange={(e) => {
                setTagline(e.target.value);
                setSubmitError(null);
              }}
              maxLength={PROJECT_TAGLINE_MAX_LENGTH}
              disabled={isSubmitting}
              className="h-9 text-xs"
            />
          </div>

          {submitError && (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
              data-testid="create-project-error"
            >
              {submitError}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim() || !effectiveSlug}
              data-testid="create-project-submit"
              className="h-8 gap-1.5 text-xs"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
