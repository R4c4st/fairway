// Fairway — fonction Supabase « push » : envoie les notifications (appli fermée)
// Déclenchée par les webhooks de base de données sur : events (INSERT), players (INSERT).
// Secrets requis : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET (+ VAPID_SUBJECT optionnel)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  { auth: { persistSession: false } },
);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:fairway@r4c4st.github.io",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);
const APP = "https://r4c4st.github.io/fairway/";

const SHOTS: Record<string, [string, string]> = {
  birdie: ["🐦", "Birdie"], eagle: ["🦅", "Eagle"], hio: ["💥", "Trou en 1"], drive: ["🚀", "Gros drive"],
  approche: ["🎯", "Belle approche"], putt: ["⛳", "Putt de fou"], chip: ["🪄", "Chip-in"],
  bunker: ["🏖️", "Sortie de bunker"], sauvetage: ["🦸", "Sauvetage"], par: ["💪", "Par arraché"], autre: ["👏", "Beau coup"],
};
const short = (name: string) => (name || "").replace(/^UGOLF\s+/i, "").replace(/^Golf\s+(de\s+|du\s+)?/i, "");

async function gameInfo(gameId: string) {
  const [{ data: g }, { data: players }] = await Promise.all([
    sb.from("games").select("id, course, created_by").eq("id", gameId).single(),
    sb.from("players").select("id, name, device_id").eq("game_id", gameId),
  ]);
  return { game: g, players: players ?? [] };
}

// joueurs de la partie + potes qui les suivent (option « Suivre mes potes »)
async function audience(players: { device_id: string | null }[]) {
  const devs = new Set<string>();
  const pdevs = players.map((p) => p.device_id).filter(Boolean) as string[];
  pdevs.forEach((d) => devs.add(d));
  for (const d of pdevs) {
    const { data } = await sb.from("profiles").select("device_id").eq("follow", true)
      .contains("partners", JSON.stringify([{ device_id: d }]));
    (data ?? []).forEach((r: { device_id: string }) => devs.add(r.device_id));
  }
  return devs;
}

async function send(devices: Set<string>, msg: Record<string, unknown>) {
  if (!devices.size) return 0;
  const { data: subs } = await sb.from("push_subs").select("endpoint, sub").in("device_id", [...devices]);
  let n = 0;
  await Promise.all((subs ?? []).map(async (s: { endpoint: string; sub: webpush.PushSubscription }) => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 3600 }); n++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push", code, (e as Error).message);
    }
  }));
  return n;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-fairway-secret") !== Deno.env.get("PUSH_SECRET")) return new Response("forbidden", { status: 403 });
  const { table, type, record } = await req.json();
  let sent = 0;
  try {
    if (table === "events" && type === "INSERT") {
      const { game, players } = await gameInfo(record.game_id);
      if (!game) return new Response("no game");
      const p = players.find((x) => x.id === record.player_id);
      const who = p?.name ?? "?";
      const where = short(game.course?.name ?? "golf");
      let title: string, body: string;
      if (record.type === "rouge") {
        title = `🍺 ${who} n'a pas passé les rouges !`;
        body = `Trou ${record.hole} · ${where} — une tournée de plus 😂`;
      } else if (record.type === "tournee") {
        title = record.label ? `🍻 Merci ${record.label} !` : "🍻 Partie terminée";
        body = record.label ? `Dernier à ${where} : c'est sa tournée 🍺` : `${where} — égalité, personne ne paie !`;
      } else {
        const [emo, lab] = SHOTS[record.type] ?? SHOTS.autre;
        title = `${emo} ${record.type === "autre" && record.label ? record.label : lab} de ${who} !`;
        body = `${record.hole ? "Trou " + record.hole + " · " : ""}${where}${record.by_name ? " · signalé par " + record.by_name : ""}`;
      }
      const devs = await audience(players);
      if (record.by_device) devs.delete(record.by_device);
      sent = await send(devs, { title, body, url: APP + "#/game/" + record.game_id, tag: "ev-" + record.id });
    }
    if (table === "players" && type === "INSERT" && record.device_id && record.added_by && record.added_by !== record.device_id) {
      const { game } = await gameInfo(record.game_id);
      if (game) {
        sent = await send(new Set([record.device_id]), {
          title: `⛳ ${game.created_by ?? "Un pote"} t'a ajouté à une partie`,
          body: `${short(game.course?.name ?? "")} — ouvre Fairway pour jouer`,
          url: APP + "#/game/" + record.game_id, tag: "inv-" + record.game_id,
        });
      }
    }
  } catch (e) { console.error(e); return new Response("error", { status: 500 }); }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
