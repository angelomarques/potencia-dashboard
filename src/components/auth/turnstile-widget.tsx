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
  theme?: "light" | "dark" | "auto";
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: (error?: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
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
      theme = "auto",
      className,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Keep latest parent callbacks in refs so the render effect does not
    // depend on them (inline arrows from sign-up would remount the widget).
    const onVerifyRef = useRef(onVerify);
    const onErrorRef = useRef(onError);
    const onExpireRef = useRef(onExpire);
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;

    const resetWidget = () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    };

    useImperativeHandle(ref, () => ({
      reset: resetWidget,
    }));

    useEffect(() => {
      let isMounted = true;
      let checkInterval: ReturnType<typeof setInterval> | undefined;

      const renderTurnstile = () => {
        if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: (token: string) => {
              if (isMounted) {
                setIsLoading(false);
                onVerifyRef.current(token);
              }
            },
            "error-callback": (err?: string) => {
              if (isMounted) {
                setIsLoading(false);
                onErrorRef.current?.(err);
              }
            },
            "expired-callback": () => {
              if (isMounted) {
                onExpireRef.current?.();
              }
            },
          });
          widgetIdRef.current = id;
          setIsLoading(false);
        } catch (e: unknown) {
          if (isMounted) {
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

          checkInterval = setInterval(() => {
            if (window.turnstile) {
              if (checkInterval) clearInterval(checkInterval);
              renderTurnstile();
            }
          }, 100);
        }
      }

      return () => {
        isMounted = false;
        if (checkInterval) clearInterval(checkInterval);
        // Only tear down on real unmount / siteKey|theme change — not on
        // parent callback identity changes after a successful verify.
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, theme]);

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
