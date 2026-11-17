// Polices proposées dans le sélecteur de Palette (2026-11-17) et police de
// secours selon la famille : un titre serif qui ne charge pas retombe sur un
// serif, pas sur une police sans empattement.
// Partagé par l'atelier (font-picker.jsx) et brand.js (aussi utilisé par les
// scripts Node : pas d'import de navigateur ici).

export const FONT_GROUPS = [
  {
    id: "sans",
    label: "Sans empattement",
    fallback: "sans-serif",
    fonts: ["Inter", "Inter Tight", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Nunito Sans", "Raleway", "Work Sans", "DM Sans", "Manrope", "Plus Jakarta Sans", "Outfit", "Figtree", "Rubik", "Karla", "Mulish", "Barlow", "Jost", "Readex Pro", "Space Grotesk", "Sora", "Urbanist", "Archivo", "Lexend", "Source Sans 3", "Noto Sans", "Public Sans"],
  },
  {
    id: "serif",
    label: "Avec empattement (serif)",
    fallback: "serif",
    fonts: ["Playfair Display", "Merriweather", "Lora", "Libre Baskerville", "EB Garamond", "Cormorant Garamond", "DM Serif Display", "Fraunces", "Crimson Pro", "Source Serif 4", "Noto Serif", "Bitter", "Roboto Slab", "Spectral", "Newsreader", "Instrument Serif"],
  },
  {
    id: "display",
    label: "Titres marquants",
    fallback: "sans-serif",
    fonts: ["Bebas Neue", "Oswald", "Anton", "Archivo Black", "Abril Fatface", "Righteous", "Bricolage Grotesque", "Syne", "Unbounded"],
  },
  { id: "script", label: "Manuscrites", fallback: "cursive", fonts: ["Dancing Script", "Pacifico", "Caveat", "Great Vibes", "Satisfy"] },
  { id: "mono", label: "Machine à écrire", fallback: "monospace", fonts: ["JetBrains Mono", "IBM Plex Mono", "Space Mono"] },
];

const BY_NAME = new Map(FONT_GROUPS.flatMap((g) => g.fonts.map((f) => [f.toLowerCase(), g])));

export const groupOfFont = (name) => BY_NAME.get(String(name ?? "").trim().toLowerCase()) ?? null;

// Famille de secours : celle du groupe connu, sinon devinée d'après le nom.
export function fallbackOf(name) {
  const g = groupOfFont(name);
  if (g) return g.fallback;
  const n = String(name ?? "").toLowerCase();
  if (/serif|garamond|baskerville|playfair|times|georgia|slab|caslon|bodoni|didot/.test(n) && !/sans/.test(n)) return "serif";
  if (/mono|code|courier/.test(n)) return "monospace";
  if (/script|hand|brush|signature/.test(n)) return "cursive";
  return "sans-serif";
}
