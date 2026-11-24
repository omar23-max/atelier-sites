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
  const b = document.createElement("div");
  b.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#12233f;color:#fff;padding:10px 12px 10px 18px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:600 14px Inter,system-ui,sans-serif;display:flex;gap:14px;align-items:center";
  b.innerHTML = "Une nouvelle version de l atelier est disponible.";
  const r = document.createElement("button");
  r.textContent = "Recharger";
  r.style.cssText = "background:#ffd21f;color:#111;border:0;border-radius:6px;padding:7px 14px;font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer";
  r.onclick = () => location.reload();
  b.appendChild(r);
  document.body.appendChild(b);
}
if (charge) {
  setInterval(verifier, 60000);
  document.addEventListener("visibilitychange", verifier);
  window.addEventListener("focus", verifier);
}
