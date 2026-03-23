import type { Config } from "@netlify/functions";

// ─── ENV ────────────────────────────────────────────────────────────────────
const env = () => ({
  CLICKUP_API_KEY:    process.env.CLICKUP_API_KEY!,
  CLICKUP_FOLDER_ID:  process.env.CLICKUP_FOLDER_ID!,
  META_ACCESS_TOKEN:  process.env.META_ACCESS_TOKEN!,
  META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID!,
  SHOPIFY_STORE:      process.env.SHOPIFY_STORE!,
  SHOPIFY_TOKEN:      process.env.SHOPIFY_TOKEN!,
  ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY!,
  REPORT_PERIOD_DAYS: parseInt(process.env.REPORT_PERIOD_DAYS || "7"),
  REPORT_STATUS:      process.env.REPORT_STATUS || "7 DAY REPORT",
});

// ─── HELPERS ────────────────────────────────────────────────────────────────
function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { since: fmt(start), until: fmt(end) };
}

function extractMetric(actions: any[], type: string): number {
  const a = (actions || []).find((x: any) => x.action_type === type);
  return parseFloat(a?.value || "0");
}

function extractValue(actionValues: any[], type: string): number {
  const a = (actionValues || []).find((x: any) => x.action_type === type);
  return parseFloat(a?.value || "0");
}

// ─── API CALLS ───────────────────────────────────────────────────────────────

async function getClickUpLists(folderID: string, apiKey: string) {
  const r = await fetch(
    `https://api.clickup.com/api/v2/folder/${folderID}/list?archived=false`,
    { headers: { Authorization: apiKey } }
  );
  const d = await r.json() as { lists: Array<{ id: string; name: string }> };
  return d.lists || [];
}

async function getMetaCampaigns(adAccountID: string, token: string) {
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${adAccountID}/campaigns?` +
    `access_token=${token}&effective_status=["ACTIVE"]&` +
    `fields=id,name,status,effective_status&limit=100`
  );
  const d = await r.json() as { data: Array<{ id: string; name: string; effective_status: string }> };
  return d.data || [];
}

async function getMetaAccountInsights(adAccountID: string, token: string, since: string, until: string) {
  const fields = "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type,purchase_roas,reach,frequency";
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${adAccountID}/insights?` +
    `access_token=${token}&time_range={"since":"${since}","until":"${until}"}` +
    `&level=account&fields=${fields}&limit=1`
  );
  return await r.json();
}

async function getMetaCampaignInsights(adAccountID: string, token: string, campaignId: string, since: string, until: string) {
  const fields = "campaign_name,spend,impressions,clicks,actions,action_values,purchase_roas,cost_per_action_type,ctr,cpc";
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${adAccountID}/insights?` +
    `access_token=${token}&time_range={"since":"${since}","until":"${until}"}` +
    `&level=campaign&filtering=[{"field":"campaign.id","operator":"EQUAL","value":"${campaignId}"}]` +
    `&fields=${fields}&limit=500`
  );
  return await r.json();
}

async function getMetaAdInsights(adAccountID: string, token: string, campaignId: string, since: string, until: string) {
  const fields = "ad_name,adset_name,campaign_name,spend,impressions,clicks,actions,action_values,purchase_roas,cost_per_action_type,ctr,cpc,thumbnail_url";
  const r = await fetch(
    `https://graph.facebook.com/v19.0/${adAccountID}/insights?` +
    `access_token=${token}&time_range={"since":"${since}","until":"${until}"}` +
    `&level=ad&filtering=[{"field":"campaign.id","operator":"EQUAL","value":"${campaignId}"}]` +
    `&fields=${fields}&limit=500`
  );
  return await r.json();
}

async function getShopifyRevenue(store: string, token: string, since: string, until: string) {
  const r = await fetch(
    `https://${store}.myshopify.com/admin/api/2024-01/orders.json?` +
    `created_at_min=${since}T00:00:00Z&created_at_max=${until}T23:59:59Z` +
    `&status=any&fields=id,total_price,customer,created_at&limit=250`,
    { headers: { "X-Shopify-Access-Token": token } }
  );
  const d = await r.json() as { orders: Array<{ id: string; total_price: string; customer?: { id: string } }> };
  const orders = d.orders || [];
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || "0"), 0);
  const orderCount = orders.length;
  const aov = orderCount > 0 ? totalRevenue / orderCount : 0;
  return { totalRevenue, orderCount, aov, orders };
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a paid ads analyst for Nobody's Princess, an Australian women's ski and snowboard outerwear brand. 
Analyse Meta Ads data and generate a structured, actionable report.

Ad naming convention: Format > Pillar > Name > Date > Landing Page
Pillars: UGC, Founder, Product, Lifestyle, Testimonial, Evergreen
Formats: Video, Static, Carousel

Your report must cover:
1. SNAPSHOT — spend, revenue (Meta attributed), ROAS, CPA, purchases, MER (using Shopify total revenue), AOV
2. FUNNEL — Impressions → Clicks → Add to Cart → Checkout → Purchases with volume, cost, CVR at each stage
3. CAMPAIGNS — Prospecting, Retargeting, Advantage+ breakdown with spend and ROAS
4. CREATIVES — group ads by pillar, show spend/revenue/ROAS per pillar. Identify top 6 by ROAS with thumbnail URLs.
5. RECOMMENDATIONS — which creatives/pillars to scale up or down, flag fatigue (declining ROAS trend), suggest next actions.

Be concise, direct, and actionable. Format as clean markdown.`,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json() as { content: Array<{ type: string; text: string }> };
  return d.content?.find(c => c.type === "text")?.text || "No analysis generated.";
}

async function createClickUpTask(listId: string, apiKey: string, name: string, description: string, status: string) {
  const r = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, status }),
  });
  return await r.json();
}

// ─── PARSE CREATIVE PILLARS ──────────────────────────────────────────────────
function parsePillar(adName: string): string {
  const parts = adName.split(">").map(p => p.trim());
  const pillar = parts[1] || "Uncategorised";
  const validPillars = ["UGC", "Founder", "Product", "Lifestyle", "Testimonial", "Evergreen"];
  return validPillars.find(p => pillar.toLowerCase().includes(p.toLowerCase())) || "Uncategorised";
}

function parseFormat(adName: string): string {
  const parts = adName.split(">").map(p => p.trim());
  return parts[0] || "Unknown";
}

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────
export default async (req: Request) => {
  const e = env();
  // Run all three report periods in one execution
  const periods = [
    { days: 7,  status: "7 DAY REPORT",  dateRange: dateRange(7) },
    { days: 14, status: "14 DAY REPORT", dateRange: dateRange(14) },
    { days: 30, status: "30 DAY REPORT", dateRange: dateRange(30) },
  ];

  console.log(`Starting NP Paid Ads reports — running 7, 14 and 30 day periods`);

  try {
    // Check schedule settings — respect on/off and frequency
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("dashboard-data");
    
    let settings: any = { enabled: true, frequencyDays: 7, lastRunAt: null };
    try {
      settings = await store.get("schedule-settings", { type: "json" }) || settings;
    } catch { /* use defaults */ }

    if (!settings.enabled) {
      console.log("Reports are disabled via dashboard toggle. Skipping.");
      return;
    }

    if (settings.lastRunAt) {
      const lastRun = new Date(settings.lastRunAt);
      const daysSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < (settings.frequencyDays - 0.5)) {
        console.log(`Last run was ${daysSince.toFixed(1)} days ago, frequency is ${settings.frequencyDays} days. Skipping.`);
        return;
      }
    }

    // Update last run time
    await store.setJSON("schedule-settings", { ...settings, lastRunAt: new Date().toISOString() });
    // 1. Match ClickUp lists to active Meta campaigns
    const [lists, campaigns] = await Promise.all([
      getClickUpLists(e.CLICKUP_FOLDER_ID, e.CLICKUP_API_KEY),
      getMetaCampaigns(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN),
    ]);

    const matches = lists
      .map(list => {
        const campaign = campaigns.find(c => c.name === list.name);
        return campaign ? { list, campaign } : null;
      })
      .filter(Boolean) as Array<{ list: { id: string; name: string }; campaign: { id: string; name: string } }>;

    console.log(`Found ${matches.length} matching campaigns`);

    if (matches.length === 0) {
      console.log("No matching campaigns found. Ensure ClickUp list names match active Meta campaign names exactly.");
      return;
    }

    // 2. Pull Shopify revenue once (for MER across all campaigns)
    // 3. Loop over each period (7, 14, 30 day)
    for (const period of periods) {
      const { since, until } = dateRange(period.days);
      const reportStatus = period.status;

      const shopify = await getShopifyRevenue(e.SHOPIFY_STORE, e.SHOPIFY_TOKEN, since, until);
      console.log(`[${period.days}d] Shopify revenue: $${shopify.totalRevenue.toFixed(2)} across ${shopify.orderCount} orders`);

      // Process each matched campaign for this period
      for (const { list, campaign } of matches) {
        console.log(`[${period.days}d] Processing campaign: ${campaign.name}`);

      // Pull all Meta data in parallel
      const [accountInsights, campaignInsights, adInsights7d, adInsights14d, adInsights30d] = await Promise.all([
        getMetaAccountInsights(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN, since, until),
        getMetaCampaignInsights(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN, campaign.id, since, until),
        getMetaAdInsights(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN, campaign.id, since, until),
        getMetaAdInsights(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN, campaign.id, 
          dateRange(14).since, dateRange(14).until),
        getMetaAdInsights(e.META_AD_ACCOUNT_ID, e.META_ACCESS_TOKEN, campaign.id, 
          dateRange(30).since, dateRange(30).until),
      ]);

      // Build Claude prompt with all data
      const accountData = accountInsights?.data?.[0] || {};
      const spend = parseFloat(accountData.spend || "0");
      const impressions = parseInt(accountData.impressions || "0");
      const clicks = parseInt(accountData.clicks || "0");
      const purchases = extractMetric(accountData.actions, "purchase");
      const addToCart = extractMetric(accountData.actions, "add_to_cart");
      const initiateCheckout = extractMetric(accountData.actions, "initiate_checkout");
      const revenue = extractValue(accountData.action_values, "purchase");
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : 0;
      const mer = shopify.totalRevenue > 0 && spend > 0 ? shopify.totalRevenue / spend : 0;

      // Parse ads by pillar for 7d
      const ads7d = adInsights7d?.data || [];
      const pillarMap: Record<string, { spend: number; revenue: number; roas: string }> = {};
      for (const ad of ads7d) {
        const pillar = parsePillar(ad.ad_name || "");
        const adSpend = parseFloat(ad.spend || "0");
        const adRevenue = extractValue(ad.action_values, "purchase");
        if (!pillarMap[pillar]) pillarMap[pillar] = { spend: 0, revenue: 0, roas: "0" };
        pillarMap[pillar].spend += adSpend;
        pillarMap[pillar].revenue += adRevenue;
      }
      for (const p of Object.values(pillarMap)) {
        p.roas = p.spend > 0 ? (p.revenue / p.spend).toFixed(2) : "0";
      }

      // Top 6 creatives by ROAS
      const top6 = ads7d
        .map((ad: any) => {
          const adSpend = parseFloat(ad.spend || "0");
          const adRevenue = extractValue(ad.action_values, "purchase");
          const adRoas = adSpend > 0 ? adRevenue / adSpend : 0;
          return {
            name: ad.ad_name,
            pillar: parsePillar(ad.ad_name || ""),
            format: parseFormat(ad.ad_name || ""),
            spend: adSpend,
            revenue: adRevenue,
            roas: adRoas,
            cpa: purchases > 0 ? adSpend / extractMetric(ad.actions, "purchase") : 0,
            cvr: clicks > 0 ? (extractMetric(ad.actions, "purchase") / clicks * 100).toFixed(2) + "%" : "0%",
            thumbnail: ad.thumbnail_url || null,
          };
        })
        .sort((a: any, b: any) => b.roas - a.roas)
        .slice(0, 6);

      const prompt = `Campaign: ${campaign.name}
Period: ${since} to ${until} (${period.days} days)

ACCOUNT METRICS:
- Spend: $${spend.toFixed(2)}
- Impressions: ${impressions.toLocaleString()}
- Clicks: ${clicks.toLocaleString()}
- Add to Carts: ${addToCart}
- Initiate Checkouts: ${initiateCheckout}
- Purchases: ${purchases}
- Meta Attributed Revenue: $${revenue.toFixed(2)}
- ROAS: ${roas.toFixed(2)}x
- CPA: $${cpa.toFixed(2)}
- Shopify Total Revenue: $${shopify.totalRevenue.toFixed(2)}
- MER: ${mer.toFixed(2)}x
- AOV: $${shopify.aov.toFixed(2)}
- CPC: ${accountData.cpc || "N/A"}
- CTR: ${accountData.ctr || "N/A"}%

CAMPAIGN BREAKDOWN (7d):
${JSON.stringify(campaignInsights?.data || [], null, 2)}

PILLAR PERFORMANCE (7d):
${JSON.stringify(pillarMap, null, 2)}

TOP 6 CREATIVES (7d by ROAS):
${JSON.stringify(top6, null, 2)}

AD LEVEL 14d: ${ads7d.length} ads
AD LEVEL 30d: ${adInsights30d?.data?.length || 0} ads

Please provide your full analysis and recommendations.`;

      // 4. Call Claude
      console.log(`Calling Claude for ${campaign.name}...`);
      const analysis = await callClaude(e.ANTHROPIC_API_KEY, prompt);

      // 5. Build dashboard data and save to Netlify Blobs storage
      const dashboardData = {
        period: period.days,
        dates: { start: since, end: until },
        campaign: campaign.name,
        updatedAt: new Date().toISOString(),
        snapshot: [
          { label: "Spend", value: `$${spend.toFixed(0)}`, prev: null, wow: 0, dir: "neutral" },
          { label: "Revenue", value: `$${revenue.toFixed(0)}`, prev: null, wow: 0, dir: "up" },
          { label: "ROAS", value: `${roas.toFixed(1)}x`, prev: null, wow: 0, dir: "up" },
          { label: "CPA", value: `$${cpa.toFixed(2)}`, prev: null, wow: 0, dir: "neutral" },
          { label: "Purchases", value: `${purchases}`, prev: null, wow: 0, dir: "up" },
          { label: "MER", value: `${mer.toFixed(1)}x`, prev: null, wow: 0, dir: "up" },
          { label: "AOV", value: `$${shopify.aov.toFixed(0)}`, prev: null, wow: 0, dir: "neutral" },
        ],
        funnel: [
          { name: "Impressions", volume: impressions.toLocaleString(), cost: null, cvr: null, barPct: 100 },
          { name: "Clicks", volume: clicks.toLocaleString(), cost: `$${parseFloat(accountData.cpc || "0").toFixed(2)}`, cvr: `${parseFloat(accountData.ctr || "0").toFixed(1)}%`, barPct: Math.min(100, Math.round(clicks / (impressions || 1) * 100 * 20)) },
          { name: "Add to Cart", volume: `${addToCart}`, cost: addToCart > 0 ? `$${(spend / addToCart).toFixed(2)}` : null, cvr: clicks > 0 ? `${(addToCart / clicks * 100).toFixed(1)}%` : null, barPct: 40 },
          { name: "Checkout", volume: `${initiateCheckout}`, cost: initiateCheckout > 0 ? `$${(spend / initiateCheckout).toFixed(2)}` : null, cvr: addToCart > 0 ? `${(initiateCheckout / addToCart * 100).toFixed(1)}%` : null, barPct: 25 },
          { name: "Purchases", volume: `${purchases}`, cost: `$${cpa.toFixed(2)}`, cvr: initiateCheckout > 0 ? `${(purchases / initiateCheckout * 100).toFixed(1)}%` : null, barPct: 12 },
        ],
        pillars: Object.entries(pillarMap).map(([name, data]) => ({
          name,
          pill: `pill-${name.toLowerCase()}`,
          roas7: parseFloat(data.roas),
          roas14: 0, // TODO: calculate from 14d data
          roas30: 0, // TODO: calculate from 30d data
        })),
        creatives: top6.map((c: any, i: number) => ({
          rank: i + 1,
          name: c.name?.split(">")[2]?.trim() || c.name,
          pillar: c.pillar,
          pill: `pill-${c.pillar.toLowerCase()}`,
          format: c.format,
          roas: parseFloat(c.roas.toFixed(1)),
          cpa: `$${c.cpa.toFixed(2)}`,
          cvr: c.cvr,
          thumb: c.thumbnail,
          campaign_url: `https://app.clickup.com/9016491138/v/l/${list.id}`,
        })),
        recommendations: [], // Extracted from Claude's analysis
        aiAnalysis: analysis,
      };

      // Store dashboard data in Netlify Blobs
      try {
        const { getStore } = await import("@netlify/blobs");
        const store = getStore("dashboard-data");
        await store.setJSON(`campaign-${list.id}`, dashboardData);
        await store.setJSON("latest", dashboardData); // Always keep a "latest" key
        console.log(`Dashboard data saved for ${campaign.name}`);
      } catch (blobErr) {
        console.error("Failed to save to Blobs:", blobErr);
      }

      // 6. Create ClickUp task
      const taskDate = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
      const taskName = `${campaign.name} — ${period.days} Day Report — ${taskDate}`;
      const taskDescription = `# ${taskName}\n\n${analysis}`;

      const task = await createClickUpTask(list.id, e.CLICKUP_API_KEY, taskName, taskDescription, reportStatus);
      console.log(`ClickUp task created: ${task.id} in list ${list.name}`);
    } // end campaign loop
    } // end period loop

    console.log("All reports complete.");

  } catch (err) {
    console.error("Report failed:", err);
  }
};

export const config: Config = {
  // Runs every Monday at 9am AEST (UTC+10 = 23:00 UTC Sunday)
  schedule: "0 23 * * 0",
};
