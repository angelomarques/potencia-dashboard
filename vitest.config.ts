import { defineConfig } from "vitest/config";
import path from "node:path";
import fs from "node:fs";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: "server-only",
        replacement: path.resolve(
          __dirname,
          "./node_modules/server-only/empty.js"
        ),
      },
    ],
  },
  plugins: [
    {
      name: "stub-missing-daisy-modules",
      resolveId(id) {
        if (id === "@/lib/daisy/repo" || id.endsWith("/lib/daisy/repo")) {
          const filePath = path.resolve(__dirname, "src/lib/daisy/repo.ts");
          if (!fs.existsSync(filePath)) {
            return "\0virtual:daisy-repo-stub";
          }
        }
        if (
          id === "@/lib/daisy/preview-allowlist" ||
          id.endsWith("/lib/daisy/preview-allowlist")
        ) {
          const filePath = path.resolve(
            __dirname,
            "src/lib/daisy/preview-allowlist.ts"
          );
          if (!fs.existsSync(filePath)) {
            return "\0virtual:daisy-preview-allowlist-stub";
          }
        }
        return null;
      },
      load(id) {
        if (id === "\0virtual:daisy-repo-stub") {
          return `
            export async function listProjects() { return []; }
            export async function getProject() { return null; }
            export async function upsertProject(input) { return input; }
            export async function setPreviewUrl() {}
            export async function addMessage(input) { return input; }
            export async function addSketch(input) { return input; }
            export async function getSketch() { return null; }
            export async function chooseSketch() { return { sketch: null, rejectedSketchIds: [] }; }
            export async function addComment(input) { return input; }
            export async function listThread() { return []; }
            export async function openGate(input) { return input; }
            export async function getGate() { return null; }
            export async function getOpenGate() { return null; }
            export async function resolveGate(input) { return input; }
            export async function recordInboundEventOnce() { return true; }
            export async function insertOutboundEvent(input) { return input; }
            export async function listOutboundAfter() { return []; }
            export async function listDueOutbound() { return []; }
            export async function markOutboundDelivered() {}
            export async function markOutboundAttempt() {}
            export async function ackOutboundUpTo() { return 0; }
            export function daisyStorageConfigured() { return false; }
          `;
        }
        if (id === "\0virtual:daisy-preview-allowlist-stub") {
          return `
            export function isAllowedPreviewUrl(url) {
              if (!url) return false;
              try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:") return false;
                if (parsed.username || parsed.password) return false;
                const host = parsed.hostname;
                if (host.endsWith(".vercel.app") || host === "potenciaapps.com.br" || host.endsWith(".potenciaapps.com.br")) return true;
                return false;
              } catch {
                return false;
              }
            }
          `;
        }
        return null;
      },
    },
  ],
  test: {
    environment: "node",
  },
});
