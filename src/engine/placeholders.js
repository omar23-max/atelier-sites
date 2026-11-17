// Page sans textes ni images d'origine (2026-11-17, « Miroring » vierge).
//
// Même mise en page et même design ; chaque texte devient une consigne
// « [ Titre H2 — 7 mots ] » (le rôle et la longueur d'origine), les chiffres
// gardent leur forme (0,00 $), les emplacements d'image sont vidés et
// props.wireframe cache aussi les photos d'origine de la copie. Sert à la
// « version wireframe » de l'atelier et au miroring sans contenu d'origine.

const plainText = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export function brief(html, label) {
  const t = plainText(html);
  if (!t) return html;
  if (/^[\d\s$€£.,:%/+×x*-]+$/i.test(t)) return t.replace(/\d/g, "0");
  const w = t.split(" ").length;
  return `[ ${label} — ${w} mot${w > 1 ? "s" : ""} ]`;
}

const TEXTUAL = ["text", "textarea", "richtext", "inline_richtext"];

export function placeholderContent(content = [], sectionsById = {}) {
  return content.map((item) => {
    const section = sectionsById[item.type];
    const props = { ...item.props, wireframe: true };
    // Noms des éléments d'une copie (meta.arbre) : Titre H2, Paragraphe…
    const names = {};
    (function walk(t) {
      if (!t) return;
      if (t.group) return (t.children ?? []).forEach(walk);
      names[t.slot] = t.name;
    })(section?.meta?.arbre);
    for (const [key, value] of Object.entries(props)) {
      if (!Array.isArray(value)) continue;
      const blockType = key.replace(/^blocks_/, "");
      const defs = section?.schema?.blocks?.find((b) => b.type === blockType)?.settings ?? [];
      props[key] = value.map((b) => {
        if (!b || typeof b !== "object") return b;
        const out = { ...b };
        if ("slot" in out) {
          if (out.text) out.text = brief(out.text, names[out.slot] ?? "Texte");
          if (out.image) out.image = "";
          return out;
        }
        for (const s of defs) {
          if (s.type === "image_picker") out[s.id] = "";
          else if (TEXTUAL.includes(s.type) && out[s.id]) out[s.id] = brief(out[s.id], s.label ?? "Texte");
        }
        return out;
      });
    }
    for (const s of section && !section.meta?.pageSpecific ? section.schema?.settings ?? [] : []) {
      if (s.type === "image_picker") props[s.id] = "";
      else if (TEXTUAL.includes(s.type) && props[s.id]) props[s.id] = brief(props[s.id], s.label ?? "Texte");
    }
    return { ...item, props };
  });
}
