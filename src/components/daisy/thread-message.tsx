import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Palette, User, Info } from "lucide-react";
import type { DaisyMessage } from "@/lib/daisy/types";

interface ThreadMessageProps {
  message: DaisyMessage;
}

export function ThreadMessage({ message }: ThreadMessageProps) {
  const timeAgo = message.createdAt
    ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
    : "";

  if (message.author === "system") {
    return (
      <div
        data-testid="thread-message"
        className="my-3 flex flex-col items-center justify-center text-center px-4"
      >
        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-3 py-1 text-[11px] text-muted-foreground border border-border/50 max-w-lg">
          <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span>{message.body}</span>
          {timeAgo && <span className="opacity-70">· {timeAgo}</span>}
        </div>
      </div>
    );
  }

  if (message.author === "owner") {
    return (
      <div
        data-testid="thread-message"
        className="my-2.5 flex justify-end gap-2.5 pl-10"
      >
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
          <div className="flex items-center gap-1.5 mb-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">You</span>
            {timeAgo && <span>· {timeAgo}</span>}
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm whitespace-pre-wrap leading-relaxed break-words">
            {message.body}
          </div>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30 mt-1">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  // daisy (author === "daisy")
  return (
    <div
      data-testid="thread-message"
      className="my-2.5 flex justify-start gap-2.5 pr-10"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/30 mt-1">
        <Palette className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col items-start max-w-[85%] sm:max-w-[75%]">
        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-muted-foreground">
          <span className="font-semibold text-pink-600 dark:text-pink-400">Daisy</span>
          {timeAgo && <span>· {timeAgo}</span>}
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted/90 dark:bg-muted/70 px-4 py-2.5 text-sm text-foreground shadow-sm border border-border/60 whitespace-pre-wrap leading-relaxed break-words">
          {message.body}
        </div>
      </div>
    </div>
  );
}
