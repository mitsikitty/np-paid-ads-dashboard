import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 500 });

  const { question, dashboardData, history } = await req.json() as {
    question: string;
    dashboardData: any;
    history: Array<{ role: string; content: string }>;
  };

  const systemPrompt = `You are a paid ads analyst assistant for Nobody's Princess, an Australian women's ski and snowboard outerwear brand. 
You are embedded in their paid ads analytics dashboard and have access to their current campaign data.

Current dashboard data:
${JSON.stringify(dashboardData, null, 2)}

Answer questions about their Meta ads performance concisely and actionably. 
Reference specific numbers from the data when relevant.
Keep answers under 150 words unless the question requires more detail.
Use Australian English.`;

  const messages = [
    ...history,
    { role: "user", content: question }
  ];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  const d = await r.json() as { content: Array<{ type: string; text: string }> };
  const answer = d.content?.find(c => c.type === "text")?.text || "Sorry, I couldn't generate a response.";

  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/chat",
};
