import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "./router";

const getRpcUrl = () => {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/rpc`;
};

export const rpcLink = new RPCLink({
  url: getRpcUrl,
});

export const orpc = createORPCClient<RouterClient<AppRouter>>(rpcLink);
