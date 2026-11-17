// Messages du serveur : sections ou design.md changés, nouvelle version de
// l'atelier (2026-11-17). En développement, la connexion de Vite ; dans la
// version compilée (server/production.mjs), /api/evenements.
const subs = new Map();
let source = null;

export function onLive(event, cb) {
  if (import.meta.hot) return import.meta.hot.on(event, cb);
  if (!subs.has(event)) subs.set(event, new Set());
  subs.get(event).add(cb);
  if (!source && typeof EventSource !== "undefined") {
    source = new EventSource("/api/evenements");
    source.onmessage = (e) => {
      try {
        const { event: ev, data } = JSON.parse(e.data);
        subs.get(ev)?.forEach((f) => f(data ?? {}));
      } catch {
        /* message illisible : ignoré */
      }
    };
  }
}

// Version compilée : après une mise à jour de l'atelier, une barre propose de
// recharger (jamais de rechargement automatique : une saisie peut être en cours).
if (!import.meta.hot && typeof document !== "undefined") {
  onLive("atl-version", () => {
    if (document.getElementById("atl-version")) return;
    const bar = document.createElement("div");
    bar.id = "atl-version";
    bar.className = "atl-stale";
    bar.innerHTML = `<span>Une nouvelle version de l'atelier est prête.</span><button type="button">Recharger</button><button type="button" aria-label="Plus tard">×</button>`;
    const [reload, close] = bar.querySelectorAll("button");
    reload.onclick = () => location.reload();
    close.onclick = () => bar.remove();
    document.body.append(bar);
  });
}
