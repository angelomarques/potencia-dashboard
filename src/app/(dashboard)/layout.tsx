import React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <DashboardHeader user={session.user} />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
