import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Kanban,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    redirect("/board");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto max-w-6xl flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/25">
              <Layers className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight">Potencia</span>
              <Badge variant="secondary" className="font-medium text-xs bg-primary/10 text-primary border-primary/20">
                Lawa
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
          {/* Subtle green ambient glow */}
          <div
            className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-primary/10 blur-[130px] rounded-full"
            aria-hidden="true"
          />

          <div className="container mx-auto max-w-6xl px-4 sm:px-6 text-center relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1 text-xs font-medium text-primary mb-6 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Next-Gen Product Workspace &middot; Built for Lawa</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.12]">
              High-Velocity Kanban for{" "}
              <span className="bg-gradient-to-r from-primary via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                Lawa
              </span>{" "}
              Product Teams
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Organize priorities, manage sprint columns, and collaborate with ClickUp &amp; Trello ease. Powered by Cloudflare D1 and secure Turnstile auth.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto h-12 px-7 text-base shadow-lg shadow-primary/20" asChild>
                <Link href="/sign-up">
                  Enter Lawa Board
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-7 text-base" asChild>
                <Link href="/sign-in">Sign In to Existing Account</Link>
              </Button>
            </div>

            {/* Kanban Board Visual Preview */}
            <div className="mt-16 rounded-xl border border-border/70 bg-card/60 p-4 md:p-6 shadow-2xl backdrop-blur-sm text-left">
              <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground ml-2">Lawa Workspace &middot; Main Kanban</span>
                </div>
                <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                  Live Preview
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Column 1: Backlog */}
                <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      Backlog
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">2</Badge>
                  </div>
                  <div className="space-y-2">
                    <Card className="p-3 bg-card border-border/70 shadow-sm hover:border-primary/50 transition-colors">
                      <div className="text-xs font-semibold">Welcome to Potencia Dashboard</div>
                      <p className="text-[11px] text-muted-foreground mt-1">Drag cards between columns, create new ones, and track Lawa work.</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-blue-600 bg-blue-500/10 border-blue-500/20">medium</Badge>
                        <span className="text-[10px] text-muted-foreground">#card-1</span>
                      </div>
                    </Card>
                    <Card className="p-3 bg-card border-border/70 shadow-sm hover:border-primary/50 transition-colors">
                      <div className="text-xs font-semibold">Integrate webhook notifications</div>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-slate-600 bg-slate-500/10 border-slate-500/20">low</Badge>
                        <span className="text-[10px] text-muted-foreground">#card-2</span>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* Column 2: To do */}
                <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      To do
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">1</Badge>
                  </div>
                  <div className="space-y-2">
                    <Card className="p-3 bg-card border-border/70 shadow-sm hover:border-primary/50 transition-colors">
                      <div className="text-xs font-semibold">Sprint task prioritization</div>
                      <p className="text-[11px] text-muted-foreground mt-1">Ready for current sprint execution and team assignment.</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-indigo-600 bg-indigo-500/10 border-indigo-500/20">medium</Badge>
                        <span className="text-[10px] text-muted-foreground">#card-3</span>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* Column 3: In Progress */}
                <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      In Progress
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">1</Badge>
                  </div>
                  <div className="space-y-2">
                    <Card className="p-3 bg-card border-border/70 shadow-sm hover:border-primary/50 transition-colors border-l-2 border-l-blue-500">
                      <div className="text-xs font-semibold">Real-time dnd-kit interaction</div>
                      <p className="text-[11px] text-muted-foreground mt-1">Optimistic card reordering with smooth animations.</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-amber-600 bg-amber-500/10 border-amber-500/20">high</Badge>
                        <span className="text-[10px] text-muted-foreground">#card-4</span>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* Column 4: Review */}
                <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Review
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">1</Badge>
                  </div>
                  <div className="space-y-2">
                    <Card className="p-3 bg-card border-border/70 shadow-sm hover:border-primary/50 transition-colors">
                      <div className="text-xs font-semibold">D1 Database HTTP sync</div>
                      <p className="text-[11px] text-muted-foreground mt-1">Zero latency cloud storage for board data.</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-red-600 bg-red-500/10 border-red-500/20">urgent</Badge>
                        <span className="text-[10px] text-muted-foreground">#card-5</span>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* Column 5: Done */}
                <div className="bg-muted/40 rounded-lg p-3 border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Done
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">1</Badge>
                  </div>
                  <div className="space-y-2">
                    <Card className="p-3 bg-card border-border/70 shadow-sm opacity-85">
                      <div className="text-xs font-semibold line-through text-muted-foreground">Auth + Turnstile live</div>
                      <p className="text-[11px] text-muted-foreground mt-1">Sign-up is protected by Cloudflare Turnstile.</p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] h-4 text-emerald-600 bg-emerald-500/10 border-emerald-500/20">completed</Badge>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="py-16 border-t border-border/50 bg-muted/20">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Engineered for Speed, Reliability &amp; Clarity
              </h2>
              <p className="text-muted-foreground text-sm mt-2">
                All the features required for Lawa execution without the enterprise bloat.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border-border/60 bg-card/80">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Kanban className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">ClickUp &amp; Trello Style Fluidity</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Smooth card dragging across columns with optimistic UI updates. Fast responsive reordering that saves instantly.
                </p>
              </Card>

              <Card className="p-6 border-border/60 bg-card/80">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">Cloudflare D1 REST Engine</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  High performance global SQLite database powered by Cloudflare D1 with instant queries and zero cold start penalty.
                </p>
              </Card>

              <Card className="p-6 border-border/60 bg-card/80">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">Turnstile Bot Defense</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Enterprise-grade bot protection powered by Cloudflare Turnstile. Frictionless verification without annoying CAPTCHAs.
                </p>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 text-center text-xs text-muted-foreground">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Potencia Dashboard</span>
            <span>&middot; Lawa Workspace</span>
          </div>
          <div>
            &copy; {new Date().getFullYear()} Potencia Dashboard. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
