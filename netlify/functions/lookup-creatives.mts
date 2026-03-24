import type { Context } from "@netlify/functions";

const CLICKUP_API = "https://api.clickup.com/api/v2";
const LIST_ID = "901613760525";

export default async (req: Request, context: Context) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  try {
    const { names } = await req.json() as { names: string[] };
    if (!names?.length) {
      return new Response(JSON.stringify({ error: "No names provided" }), { status: 400, headers });
    }

    const apiKey = Netlify.env.get("CLICKUP_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "CLICKUP_API_KEY not set" }), { status: 500, headers });
    }

    // Fetch tasks from the list (parent tasks only — subtasks=false to avoid "3 Day Results" etc.)
    const url = `${CLICKUP_API}/list/${LIST_ID}/task?subtasks=false&include_closed=true&page=0`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `ClickUp API error: ${res.status}`, detail: err }), { status: 502, headers });
    }

    const data = await res.json() as { tasks: Array<{ id: string; name: string; url: string }> };

    // Build a name → {id, url} map (case-insensitive)
    const taskMap = new Map<string, { id: string; url: string }>();
    for (const task of data.tasks) {
      taskMap.set(task.name.toLowerCase().trim(), { id: task.id, url: task.url });
    }

    // Match requested names
    const results: Record<string, { clickupId: string; clickupUrl: string } | null> = {};
    for (const name of names) {
      const match = taskMap.get(name.toLowerCase().trim());
      results[name] = match ? { clickupId: match.id, clickupUrl: `clickup://t/${match.id}` } : null;
    }

    return new Response(JSON.stringify(results), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
  }
};

export const config = { path: "/api/lookup-creatives" };
