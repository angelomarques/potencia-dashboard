"use client";

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: (err?: string) => void;
  onExpire?: () => void;
  siteKey?: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  execution?: "render" | "execute";
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          "error-callback"?: (error?: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          retry?: "auto" | "never";
          "refresh-expired"?: "auto" | "manual" | "never";
          execution?: "render" | "execute";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  (
    {
      onVerify,
      onError,
      onExpire,
      siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
      action,
      theme = "auto",
      execution = "render",
      className,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Keep latest parent callbacks in refs so the render effect does not
    // depend on them (prevents remount loops from callback recreation).
    const onVerifyRef = useRef(onVerify);
    const onErrorRef = useRef(onError);
    const onExpireRef = useRef(onExpire);
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;

    const resetWidget = () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          // ignore reset errors
        }
      }
    };

    useImperativeHandle(ref, () => ({
      reset: resetWidget,
    }));

    useEffect(() => {
      let cancelled = false;
      let checkInterval: ReturnType<typeof setInterval> | undefined;
      let scriptElement: HTMLScriptElement | null = null;
      let onScriptLoad: (() => void) | undefined;
      const container = containerRef.current;

      const renderTurnstile = () => {
        if (cancelled) return;
        if (!container || !window.turnstile || widgetIdRef.current) return;

        // Clear container innerHTML before render to avoid stale iframe DOM
        container.innerHTML = "";

        try {
          const id = window.turnstile.render(container, {
            sitekey: siteKey,
            ...(action ? { action } : {}),
            theme,
            retry: "auto",
            "refresh-expired": "auto",
            execution,
            callback: (token: string) => {
              if (!cancelled) {
                onVerifyRef.current(token);
              }
            },
            "error-callback": (err?: string) => {
              if (!cancelled) {
                onErrorRef.current?.(err);
              }
            },
            "expired-callback": () => {
              if (!cancelled) {
                onExpireRef.current?.();
              }
            },
          });

          if (!cancelled && id) {
            widgetIdRef.current = id;
            setIsLoading(false);
          } else if (id && window.turnstile) {
            try {
              window.turnstile.remove(id);
            } catch {
              // ignore
            }
          }
        } catch (e: unknown) {
          if (!cancelled) {
            setIsLoading(false);
            const msg = e instanceof Error ? e.message : "Turnstile error";
            onErrorRef.current?.(msg);
          }
        }
      };

      if (typeof window !== "undefined") {
        if (window.turnstile) {
          renderTurnstile();
        } else {
          const scriptId = "cf-turnstile-script";
          let script = document.getElementById(scriptId) as HTMLScriptElement | null;
          if (!script) {
            script = document.createElement("script");
            script.id = scriptId;
            script.src =
              "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
          }
          scriptElement = script;

          onScriptLoad = () => {
            if (window.turnstile) {
              if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = undefined;
              }
              renderTurnstile();
            }
          };
          scriptElement.addEventListener("load", onScriptLoad);

          checkInterval = setInterval(() => {
            if (cancelled) {
              if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = undefined;
              }
              return;
            }
            if (window.turnstile) {
              if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = undefined;
              }
              renderTurnstile();
            }
          }, 100);
        }
      }

      return () => {
        cancelled = true;
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = undefined;
        }
        if (scriptElement && onScriptLoad) {
          scriptElement.removeEventListener("load", onScriptLoad);
        }
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore
          }
          widgetIdRef.current = null;
        }
        if (container) {
          container.innerHTML = "";
        }
      };
    }, [siteKey, theme, action, execution]);

    return (
      <div
        className={`flex flex-col items-center justify-center my-2 min-h-[65px] ${className ?? ""}`}
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse py-3">
            <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Loading Cloudflare verification...
          </div>
        )}
        <div ref={containerRef} />
      </div>
    );
  },
);

TurnstileWidget.displayName = "TurnstileWidget";
