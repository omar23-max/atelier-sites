// Garde l'atelier allumé : lance le serveur (http://localhost:5180) et le
// relance s'il s'arrête. Démarré au démarrage de Windows (raccourci
// « Atelier — serveur » du dossier Démarrage) et par le raccourci « Atelier ».
// Un seul gardien à la fois : s'il y en a déjà un (port occupé), il s'arrête.
// Journal : export/serveur.log
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "export"), { recursive: true });
const log = (m) => appendFileSync(join(root, "export", "serveur.log"), `${new Date().toISOString()}  ${m}\n`);
const portBusy = () =>
  new Promise((resolve) => {
    const s = createConnection({ port: 5180, host: "127.0.0.1" }, () => (s.destroy(), resolve(true)));
    s.on("error", () => resolve(false));
  });

if (await portBusy()) {
  log("déjà en marche, rien à faire");
  process.exit(0);
}

let restarts = 0;
let waiting = false;
async function start() {
  // Un autre serveur répond déjà sur 5180 (lancé à la main ou par Claude) :
  // l'atelier marche, on attend sans relancer en boucle.
  if (await portBusy()) {
    if (!waiting) log("un autre serveur répond sur 5180 : en attente");
    waiting = true;
    restarts = 0;
    return setTimeout(start, 60000);
  }
  waiting = false;
  log(`démarrage du serveur${restarts ? ` (relance n° ${restarts})` : ""}`);
  const child = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js")], { cwd: root, stdio: "ignore", windowsHide: true });
  const began = Date.now();
  child.on("exit", (code) => {
    log(`serveur arrêté (code ${code})`);
    // Relance ; si ça plante en boucle, on espace les tentatives.
    restarts = Date.now() - began < 20000 ? restarts + 1 : 0;
    setTimeout(start, Math.min(60000, 2000 * 2 ** Math.min(restarts, 5)));
  });
}
start();
