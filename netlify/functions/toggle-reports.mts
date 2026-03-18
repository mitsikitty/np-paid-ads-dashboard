import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const store = getStore("config");

  // GET — return current state
  if (req.method === "GET") {
    try {
      const state = await store.get("reports-enabled", { type: "json" });
      const enabled = state === null ? true : state; // default ON
      return new Response(JSON.stringify({ enabled, nextRun: "Monday 9:00 AM AEST" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch {
      return new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // POST — toggle or set state
  if (req.method === "POST") {
    const body = await req.json() as { enabled: boolean };
    await store.setJSON("reports-enabled", body.enabled);
    return new Response(JSON.stringify({ enabled: body.enabled, updated: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/toggle-reports"
};
