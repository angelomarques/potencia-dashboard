import { describe, expect, it } from "vitest";
import { getTrustedOrigins } from "./trusted-origins";

describe("getTrustedOrigins", () => {
  it("includes custom domain", () => {
    const origins = getTrustedOrigins({
      BETTER_AUTH_URL: "https://auth.custom-domain.com",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://dashboard.custom-domain.com",
    });

    expect(origins).toContain("https://auth.custom-domain.com");
    expect(origins).toContain("https://dashboard.custom-domain.com");
  });

  it("excludes evil.example.com", () => {
    const origins = getTrustedOrigins({
      BETTER_AUTH_URL: "https://dashboard.potenciaapps.com.br",
    });

    expect(origins).not.toContain("https://evil.example.com");
    expect(origins).not.toContain("evil.example.com");

    const originsWithEvilAttempt = getTrustedOrigins({
      BETTER_AUTH_TRUSTED_ORIGINS: "evil.example.com",
    });
    expect(originsWithEvilAttempt).not.toContain("https://evil.example.com");
    expect(originsWithEvilAttempt).not.toContain("evil.example.com");
  });

  it("includes VERCEL_URL", () => {
    const origins = getTrustedOrigins({
      VERCEL_URL: "potencia-preview-123.vercel.app",
      VERCEL_BRANCH_URL: "potencia-feat-branch.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "potencia-prod.vercel.app",
    });

    expect(origins).toContain("https://potencia-preview-123.vercel.app");
    expect(origins).toContain("https://potencia-feat-branch.vercel.app");
    expect(origins).toContain("https://potencia-prod.vercel.app");
  });

  it("parses and trims comma list", () => {
    const origins = getTrustedOrigins({
      BETTER_AUTH_TRUSTED_ORIGINS:
        " https://first.example.com , https://second.example.com/some/path ,  https://third.example.com/ ",
    });

    expect(origins).toContain("https://first.example.com");
    expect(origins).toContain("https://second.example.com");
    expect(origins).toContain("https://third.example.com");
  });

  it("ignores invalid entries", () => {
    const origins = getTrustedOrigins({
      BETTER_AUTH_TRUSTED_ORIGINS:
        "not-a-valid-url, https://valid.example.com, ://bad-url, https://*.wildcard.com, *, ftp://invalidscheme.com",
    });

    expect(origins).toContain("https://valid.example.com");
    expect(origins).not.toContain("not-a-valid-url");
    expect(origins).not.toContain("://bad-url");
    expect(origins).not.toContain("https://*.wildcard.com");
    expect(origins).not.toContain("*");
    expect(origins).not.toContain("ftp://invalidscheme.com");
  });

  it("excludes localhost in production", () => {
    const origins = getTrustedOrigins({
      NODE_ENV: "production",
    });

    expect(origins).not.toContain("http://localhost:3000");
  });

  it("includes localhost when not in production", () => {
    const originsDev = getTrustedOrigins({
      NODE_ENV: "development",
    });
    expect(originsDev).toContain("http://localhost:3000");

    const originsEmpty = getTrustedOrigins({});
    expect(originsEmpty).toContain("http://localhost:3000");
  });

  it("dedupes list and includes default origins", () => {
    const origins = getTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://dashboard.potenciaapps.com.br/",
      BETTER_AUTH_TRUSTED_ORIGINS:
        "https://potencia-dashboard.vercel.app,https://dashboard.potenciaapps.com.br",
    });

    expect(origins).toEqual([
      "https://dashboard.potenciaapps.com.br",
      "https://potencia-dashboard.vercel.app",
      "https://potencia-dashboard-nu.vercel.app",
    ]);
  });
});
