import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const listId = url.searchParams.get("list_id") || "latest";

  try {
    const store = getStore("dashboard-data");
    const key = listId === "latest" ? "latest" : `campaign-${listId}`;
    const data = await store.get(key, { type: "json" });

    if (!data) {
      return new Response(JSON.stringify({ error: "No data found", key }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/dashboard-data",
};
