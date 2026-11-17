// Rechargement sûr de l'interface (pas pendant une saisie). Sorti de
// vite.config.js le 2026-11-17.
// Rechargements automatiques de Vite (2026-11-10) : quand la connexion en
// direct tombe (le tunnel Cloudflare coupe une connexion inactive) ou après
// une mise à jour du code, Vite recharge la page tout seul et la saisie en
// cours est perdue. Ici : (1) un signal toutes les 25 s garde la connexion
// active ; (2) si l'utilisateur est en train d'écrire (champ actif, ou texte
// tapé dans les 15 dernières minutes), pas de rechargement : une barre
// propose « Recharger » quand il a fini.
export function rechargementSur() {
  const GARDE = `
const __atlSaisie = { derniere: 0 };
if (typeof document !== "undefined") {
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("textarea, [contenteditable=''], [contenteditable='true'], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])")) __atlSaisie.derniere = Date.now();
  }, true);
}
function __atlOccupe() {
  if (typeof document === "undefined") return false;
  const a = document.activeElement;
  const enChamp = a && (a.isContentEditable || /^(TEXTAREA|SELECT)$/.test(a.tagName) || (a.tagName === "INPUT" && !/^(checkbox|radio|range|file|button|submit)$/.test(a.type)));
  return Boolean(enChamp) || Date.now() - __atlSaisie.derniere < 15 * 60 * 1000;
}
function __atlRecharger() {
  if (!__atlOccupe()) { location.reload(); return; }
  if (document.getElementById("atl-maj")) return;
  const b = document.createElement("div");
  b.id = "atl-maj";
  b.setAttribute("role", "status");
  b.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;padding:10px 12px 10px 16px;background:#1c1b18;color:#fff;font:500 13px/1.4 Inter,system-ui,sans-serif;border-radius:10px;box-shadow:0 18px 44px rgba(28,27,24,.25);max-width:calc(100vw - 32px)";
  b.innerHTML = '<span>L’atelier doit être rechargé. Votre saisie est gardée : finissez-la, puis rechargez.</span>';
  const ok = document.createElement("button");
  ok.type = "button";
  ok.textContent = "Recharger";
  ok.style.cssText = "flex:none;border:0;border-radius:6px;padding:7px 12px;background:#4f46e5;color:#fff;font:600 13px Inter,system-ui,sans-serif;cursor:pointer";
  ok.onclick = () => location.reload();
  b.appendChild(ok);
  document.body.appendChild(b);
}
`;
  return {
    name: "atelier-rechargement-sur",
    configureServer(server) {
      const t = setInterval(() => server.ws.send({ type: "custom", event: "atl-garde" }), 25000);
      server.httpServer?.once("close", () => clearInterval(t));
    },
    transform(code, id) {
      if (!/vite[\\/]dist[\\/]client[\\/]client\.mjs/.test(id)) return null;
      let out = code;
      const a = /(timer = setTimeout\(\(\) => \{\s*)location\.reload\(\);/;
      const b = /(await waitForSuccessfulPing\(url\.href\);\s*)location\.reload\(\);/;
      if (!a.test(out) || !b.test(out)) {
        console.warn("[atelier] rechargement sûr : client Vite non reconnu, garde désactivée");
        return null;
      }
      out = out.replace(a, "$1__atlRecharger();").replace(b, "$1__atlRecharger();");
      return { code: GARDE + out, map: null };
    },
  };
}
