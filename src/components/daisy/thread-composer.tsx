"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { orpc } from "@/lib/daisy/orpc/client";

interface ThreadComposerProps {
  projectId: string;
}

export function ThreadComposer({ projectId }: ThreadComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = body.trim();
    if (!text || isSending) return;

    try {
      setIsSending(true);
      await orpc.daisy.sendMessage({
        projectId,
        body: text,
      });
      setBody("");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="sticky bottom-0 z-10 border-t border-border/80 bg-background/95 p-3 backdrop-blur-sm">
      <form onSubmit={handleSend} className="flex items-end gap-2">
        <Textarea
          data-testid="message-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Daisy... (Press Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={isSending}
          className="min-h-[50px] max-h-36 resize-y text-xs leading-relaxed"
        />
        <Button
          data-testid="message-send"
          type="submit"
          size="sm"
          disabled={isSending || !body.trim()}
          className="h-10 px-3.5 bg-pink-600 hover:bg-pink-700 text-white font-medium shrink-0"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
