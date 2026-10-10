import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export function StorageNotConfiguredCard() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
          <AlertCircle className="h-5 w-5" />
          <CardTitle>Daisy Storage Not Configured</CardTitle>
        </div>
        <CardDescription>
          The Daisy Studio database tables have not been initialized or Cloudflare D1 environment variables are missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          Daisy Studio requires Cloudflare D1 database credentials (<code>CLOUDFLARE_ACCOUNT_ID</code>, <code>D1_DATABASE_ID</code>, <code>CLOUDFLARE_API_TOKEN</code>) to store projects, messages, sketches, and events.
        </p>
        <p>
          Once configured and migrations applied, projects will appear here automatically.
        </p>
      </CardContent>
    </Card>
  );
}
