// Nouvelle version publiée pendant qu une page reste ouverte (2026-11-23) :
// on compare le programme chargé à celui de la page sur le serveur et on
// propose de recharger (jamais de rechargement automatique : voir rechargement sûr).
const motif = /\/assets\/[^"\x27]+\.js/;
const charge = [...document.querySelectorAll("script[type=module][src]")].map((s) => s.getAttribute("src")).find((s) => motif.test(s));
let affiche = false;
async function verifier() {
  if (!charge || affiche || document.hidden) return;
  try {
    const html = await fetch(location.pathname, { cache: "no-store", credentials: "same-origin" }).then((r) => r.text());
    const m = html.match(motif);
    if (m && !charge.endsWith(m[0])) montrer();
  } catch {}
}
function montrer() {
  affiche = true;
  // Une seule barre (2026-11-24) : la même que celle de src/live.js (#atl-version,
  // en haut, avec Recharger et ×). Si elle est déjà là, rien de plus.
  if (document.getElementById("atl-version")) return;
  const bar = document.createElement("div");
  bar.id = "atl-version";
  bar.className = "atl-stale";
  bar.innerHTML = `<span>Une nouvelle version de l'atelier est prête.</span><button type="button">Recharger</button><button type="button" aria-label="Plus tard">×</button>`;
  const [reload, close] = bar.querySelectorAll("button");
  reload.onclick = () => location.reload();
  close.onclick = () => bar.remove();
  document.body.append(bar);
}
if (charge) {
  setInterval(verifier, 60000);
  document.addEventListener("visibilitychange", verifier);
  window.addEventListener("focus", verifier);
}
