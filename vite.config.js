import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";
import { root } from "./server/commun.mjs";
import { sectionsBundle } from "./server/sections.mjs";
import { atelierApi } from "./server/api.mjs";
import { rechargementSur } from "./server/rechargement.mjs";

// Le serveur de l'atelier est dans server/ (découpé le 2026-11-17, audit T6) :
//   server/commun.mjs        outils communs (dossiers, JSON + ETag, Supabase…)
//   server/sections.mjs      /api/sections-data
//   server/api.mjs           toute l'API (/api/…, /partage, /imports)
//   server/rechargement.mjs  rechargement sûr de l'interface
// Ici, seulement la configuration de Vite.
export default defineConfig({
  // sectionsBundle avant atelierApi : sa route /api/sections-data passe en premier.
  plugins: [react(), rechargementSur(), sectionsBundle(), atelierApi()],
  build: {
    // Version compilée servie par server/production.mjs : les anciens
    // fichiers restent (un onglet ouvert pendant une mise à jour les charge
    // encore) ; « npm run build » ne vide donc pas dist/.
    emptyOutDir: false,
    rollupOptions: {
      input: { atelier: join(root, "index.html"), catalogue: join(root, "catalogue.html"), agents: join(root, "agents.html"), recherche: join(root, "recherche.html"), canvas: join(root, "canvas.html") },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    // Pages, imports, exports, corbeille et demandes sont lus par l'API :
    // pas de rechargement de l'interface quand ils changent.
    watch: { ignored: ["**/pages/**", "**/imports/**", "**/export/**", "**/corbeille/**", "**/demandes/**", "**/medias/**", "**/projets/**", "**/dist/**"] },
  },
});
