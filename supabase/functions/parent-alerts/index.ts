// Chore Club — parent alert summaries.
// Called hourly by pg_cron ({"mode":"cron"}) and from the app's "Send test" button ({"mode":"test"}).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = "BDyrRFo9JshWVXC7ttLnvxf-Psxu6n6ycrFfDqAzcJL7aX52CE3DloWwq60M2hFicRI6pekKAdBUffSJ9olJKPc";
const TZ = "America/New_York";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return all.default || Object.values(all)[0] as string || "";
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let mode = "cron";
  try { mode = (await req.json()).mode || "cron"; } catch { /* default */ }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });

  const { data: row, error } = await sb.from("board_state").select("data").eq("id", "family").single();
  if (error) return json({ error: error.message }, 500);
  const d = row?.data || {};
  const names: string[] = d.names || ["Kid 1", "Kid 2"];

  const counts = [0, 1].map((k) =>
    (d.chores || []).filter((c: any) => c.kid === k && c.status === "pending").length +
    (d.pointSubmissions || []).filter((p: any) => p.kidIdx === k && p.status === "pending").length +
    (d.pendingRewards || []).filter((r: any) => r.kidIdx === k && r.status === "pending").length
  );
  const total = counts[0] + counts[1];

  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const hours: number[] = Array.isArray(d.alertHours) ? d.alertHours : [17, 20];

  if (mode === "cron" && (!hours.includes(hour) || total === 0)) {
    return json({ sent: 0, skipped: true, hour, total });
  }

  const title = total ? `✿ ${total} to approve` : "✿ Chore Club alerts are on";
  const body = total
    ? counts.map((n, k) => n ? `${names[k]} ${n}` : "").filter(Boolean).join(" · ") + " waiting"
    : "Nothing waiting right now — you'll get a summary at your set times.";

  const { data: priv } = await sb.rpc("get_vapid_private");
  if (!priv) return json({ error: "VAPID key missing" }, 500);
  webpush.setVapidDetails("mailto:alerts@hqnest.com", VAPID_PUBLIC, priv as string);

  const { data: subs } = await sb.from("push_subs").select("endpoint, sub");
  const payload = JSON.stringify({ title, body, url: "/?parent=inbox", tag: "chore-club-summary" });
  let sent = 0, removed = 0;
  await Promise.all((subs || []).map(async (s: any) => {
    try {
      await webpush.sendNotification(s.sub, payload, { TTL: 3600 });
      sent++;
      await sb.from("push_subs").update({ last_ok_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        removed++;
        await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      } else console.error("push failed", e?.statusCode, e?.body);
    }
  }));
  return json({ sent, removed, devices: subs?.length || 0, total, hour });
});
