/**
 * Quiz Mastermind — NVIDIA NIM CORS pass-through proxy (Cloudflare Worker).
 *
 * NVIDIA's API (integrate.api.nvidia.com) does not answer browser CORS
 * preflights, so a purely client-side app cannot call it directly. This worker
 * forwards the browser's chat/completions call to NVIDIA and adds the missing
 * CORS headers. It is a pure pass-through: the caller's API key is only
 * forwarded over TLS to NVIDIA — never logged, never stored.
 *
 * One-time free deploy (from this cloudflare/ folder):
 *   npx wrangler login
 *   npx wrangler deploy
 * Then paste https://quizmastermind-nvidia-proxy.<your-subdomain>.workers.dev
 * into the app: AI settings → Use my API key → NVIDIA → step 1b.
 */
const UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: { message: "Use POST." } }, 405);

    const auth = request.headers.get("authorization") ?? "";
    if (!/^bearer\s+\S+/i.test(auth))
      return json({ error: { message: "Missing 'Authorization: Bearer <NVIDIA API key>' header." } }, 401);

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json", accept: "application/json" },
        body: await request.text(),
      });
    } catch (e) {
      return json({ error: { message: `Upstream NVIDIA call failed: ${e?.message ?? e}` } }, 502);
    }

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...CORS, "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  },
};
