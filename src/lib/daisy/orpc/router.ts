import { os, ORPCError } from "@orpc/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { isDaisyOwnerEmail } from "@/lib/daisy/owner";
import { daisyRateLimit } from "@/lib/daisy/ratelimit";
import {
  listProjects,
  getProject,
  listThread,
  getOpenGate,
  addMessage,
  chooseSketch,
  getSketch,
  addComment,
  getGate,
  resolveGate,
} from "@/lib/daisy/repo";
import { emitOutbound } from "@/lib/daisy/outbound";
import { presignDaisyReference } from "@/lib/daisy/r2";
import type { DaisyReference } from "@/lib/daisy/types";

export type DaisyORPCContext = {
  headers: Headers;
};

const base = os.$context<DaisyORPCContext>();

const authed = base.use(async ({ context, next }) => {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: context.headers });
  } catch {
    throw new ORPCError("UNAUTHORIZED", { message: "Failed to read session" });
  }

  if (!session || !session.user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized: Sign in required" });
  }

  if (!isDaisyOwnerEmail(session.user.email)) {
    throw new ORPCError("FORBIDDEN", { message: "Forbidden: Not the Daisy owner" });
  }

  const rate = await daisyRateLimit(session.user.id, "ui");
  if (!rate.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Rate limit exceeded. Please wait before retrying.",
      data: { retryAfter: rate.retryAfter },
    });
  }

  return next({
    context: {
      ...context,
      session,
      user: session.user,
    },
  });
});

const daisyReferenceSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
});

export const appRouter = {
  daisy: {
    listProjects: authed.handler(async () => {
      return await listProjects();
    }),

    getProject: authed
      .input(
        z.object({
          projectId: z.string().min(1),
        })
      )
      .handler(async ({ input }) => {
        const project = await getProject(input.projectId);
        if (!project) {
          throw new ORPCError("NOT_FOUND", { message: "Project not found" });
        }
        const [thread, openGate] = await Promise.all([
          listThread(input.projectId),
          getOpenGate(input.projectId),
        ]);
        return { project, thread, openGate };
      }),

    sendMessage: authed
      .input(
        z.object({
          projectId: z.string().min(1),
          body: z.string().min(1).max(20000),
        })
      )
      .handler(async ({ input }) => {
        const message = await addMessage({
          projectId: input.projectId,
          author: "owner",
          body: input.body,
        });

        await emitOutbound("owner.message", {
          projectId: input.projectId,
          messageId: message.id,
          body: message.body,
        });

        return message;
      }),

    chooseSketch: authed
      .input(
        z.object({
          sketchId: z.string().min(1),
        })
      )
      .handler(async ({ input }) => {
        const { sketch, rejectedSketchIds } = await chooseSketch(input.sketchId);

        await emitOutbound("owner.sketch_chosen", {
          projectId: sketch.projectId,
          sketchId: sketch.id,
          groupId: sketch.groupId,
          rejectedSketchIds,
        });

        return { sketch, rejectedSketchIds };
      }),

    addComment: authed
      .input(
        z.object({
          sketchId: z.string().min(1),
          body: z.string().min(1).max(2000),
          x: z.number().min(0).max(1).nullish(),
          y: z.number().min(0).max(1).nullish(),
        })
      )
      .handler(async ({ input }) => {
        const sketch = await getSketch(input.sketchId);
        if (!sketch) {
          throw new ORPCError("NOT_FOUND", { message: "Sketch not found" });
        }

        const comment = await addComment({
          projectId: sketch.projectId,
          sketchId: input.sketchId,
          body: input.body,
          x: input.x ?? null,
          y: input.y ?? null,
        });

        await emitOutbound("owner.comment", {
          projectId: sketch.projectId,
          sketchId: input.sketchId,
          commentId: comment.id,
          body: comment.body,
          x: comment.x,
          y: comment.y,
        });

        return comment;
      }),

    resolveGate: authed
      .input(
        z.object({
          gateId: z.string().min(1),
          action: z.enum(["continue", "submit"]),
          notes: z.string().max(2000).nullish(),
          references: z.array(daisyReferenceSchema).optional(),
        })
      )
      .handler(async ({ input }) => {
        const gate = await getGate(input.gateId);
        if (!gate) {
          throw new ORPCError("NOT_FOUND", { message: "Gate not found" });
        }
        if (gate.status !== "open") {
          throw new ORPCError("BAD_REQUEST", { message: "Gate is already resolved" });
        }

        if (input.action === "continue") {
          const resolved = await resolveGate({
            gateId: gate.id,
            status: "continued",
          });

          await emitOutbound("owner.gate_continued", {
            projectId: gate.projectId,
            gateId: gate.id,
            section: gate.section,
          });

          await addMessage({
            projectId: gate.projectId,
            author: "system",
            body: `Section "${gate.section}" gate passed (continued without extra references).`,
          });

          return resolved;
        }

        // action === "submit"
        const hasNotes = Boolean(input.notes && input.notes.trim().length > 0);
        const hasRefs = Boolean(input.references && input.references.length > 0);
        if (!hasNotes && !hasRefs) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Submitting gate requires notes or references",
          });
        }

        const refPrefix = `potencia-dashboard/daisy/${gate.projectId}/${gate.id}/`;
        const refs: DaisyReference[] = input.references ?? [];
        if (refs.some((r) => !r.key.startsWith(refPrefix) || r.key.includes(".."))) {
          throw new ORPCError("BAD_REQUEST", { message: "Reference does not belong to this gate" });
        }
        const presignedReferences = await Promise.all(
          refs.map(async (ref) => {
            let url: string | null = null;
            try {
              url = await presignDaisyReference(ref.key);
            } catch {
              url = null;
            }
            return {
              ...ref,
              url,
            };
          })
        );

        const resolved = await resolveGate({
          gateId: gate.id,
          status: "submitted",
          notes: input.notes?.trim() ?? null,
          references: refs,
        });

        await emitOutbound("owner.gate_submitted", {
          projectId: gate.projectId,
          gateId: gate.id,
          section: gate.section,
          notes: input.notes?.trim() ?? null,
          references: presignedReferences,
        });

        const details: string[] = [];
        if (refs.length > 0) {
          details.push(`${refs.length} reference image${refs.length === 1 ? "" : "s"}`);
        }
        if (hasNotes) {
          details.push(`notes: "${input.notes!.trim()}"`);
        }
        await addMessage({
          projectId: gate.projectId,
          author: "system",
          body: `Section "${gate.section}" gate submitted with ${details.join(", ") || "references"}.`,
        });

        return resolved;
      }),
  },
};

export type AppRouter = typeof appRouter;
