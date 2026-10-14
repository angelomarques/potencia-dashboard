import React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-b from-background via-muted/20 to-background overflow-hidden">
      {/* Subtle background glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-primary/10 blur-[100px] rounded-full"
        aria-hidden="true"
      />

      <div className="w-full max-w-md flex flex-col items-center mb-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 transition-transform hover:scale-105 mb-2"
        >
          <Logo
            variant="badge"
            size="lg"
            className="rounded-xl shadow-md shadow-black/5 group-hover:shadow-primary/20 transition-all"
          />
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg tracking-tight">Potencia</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary">
                Lawa
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground -mt-0.5">Kanban Workspace</span>
          </div>
        </Link>
      </div>

      <div className="relative w-full max-w-md z-10">{children}</div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Potencia Dashboard &middot; Lawa Product Engine
      </p>
    </div>
  );
}
