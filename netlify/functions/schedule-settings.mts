import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export type ScheduleSettings = {
  enabled: boolean;
  frequencyDays: number; // 1, 3, 7, 14
  timeHourAEST: number;  // 0-23
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const DEFAULTS: ScheduleSettings = {
  enabled: true,
  frequencyDays: 7,
  timeHourAEST: 9,
  lastRunAt: null,
  nextRunAt: null,
};

export default async (req: Request, context: Context) => {
  const store = getStore("dashboard-data");

  if (req.method === "GET") {
    try {
      const settings = await store.get("schedule-settings", { type: "json" }) as ScheduleSettings | null;
      return new Response(JSON.stringify(settings || DEFAULTS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify(DEFAULTS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json() as Partial<ScheduleSettings>;
      const current = await store.get("schedule-settings", { type: "json" }) as ScheduleSettings | null || DEFAULTS;
      const updated: ScheduleSettings = { ...current, ...body };
      await store.setJSON("schedule-settings", updated);
      return new Response(JSON.stringify({ success: true, settings: updated }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/schedule-settings",
};
