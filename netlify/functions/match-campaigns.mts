import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
  const CLICKUP_FOLDER_ID = process.env.CLICKUP_FOLDER_ID;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

  if (!CLICKUP_API_KEY || !CLICKUP_FOLDER_ID || !META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  // Get optional index param — returns single match at that index
  // e.g. /api/match-campaigns?index=0 returns first match
  const url = new URL(req.url);
  const index = parseInt(url.searchParams.get("index") || "-1");

  try {
    const listsRes = await fetch(
      `https://api.clickup.com/api/v2/folder/${CLICKUP_FOLDER_ID}/list?archived=false`,
      { headers: { Authorization: CLICKUP_API_KEY } }
    );
    const listsData = await listsRes.json() as { lists: Array<{ id: string; name: string }> };
    const lists = listsData.lists || [];

    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${META_AD_ACCOUNT_ID}/campaigns?` +
      `access_token=${META_ACCESS_TOKEN}&` +
      `effective_status=["ACTIVE"]&` +
      `fields=id,name,status,effective_status&limit=100`
    );
    const metaData = await metaRes.json() as { data: Array<{ id: string; name: string; effective_status: string }> };
    const activeCampaigns = metaData.data || [];

    const matches = lists
      .map(list => {
        const campaign = activeCampaigns.find(c => c.name === list.name);
        return campaign ? {
          list_id: list.id,
          list_name: list.name,
          campaign_id: campaign.id,
          campaign_status: campaign.effective_status
        } : null;
      })
      .filter(Boolean);

    // If index specified, return single match — no iterator needed in Make
    if (index >= 0) {
      const match = matches[index] || null;
      return new Response(JSON.stringify({ 
        match, 
        found: !!match,
        total: matches.length,
        index
      }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // Default: return all matches
    return new Response(JSON.stringify({ matches, total: matches.length }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = { path: "/api/match-campaigns" };
