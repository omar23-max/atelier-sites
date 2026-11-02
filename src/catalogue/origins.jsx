import { createContext, useContext, useEffect, useState } from "react";

// Origine d'un template et de tout ce qui en vient (ses sections, son design) :
// filtre et recherche du catalogue. Par défaut : les 44 templates refaits par
// Kimi (docs/templates-pour-kimi.md) → Daydreamer Excel ; wl-… / wll-… →
// Whitelabeler ; le reste → Autres. Un choix à la main (menu ⋯ d'un template)
// est rangé dans origines.json (/api/origines).
export const ORIGINS = [
  { id: "daydreamer-excel", label: "Daydreamer Excel" },
  { id: "daydreamer-vault", label: "Daydreamer Vault" },
  { id: "whitelabeler", label: "Whitelabeler" },
  { id: "replo", label: "Replo" },
  { id: "autres", label: "Autres" },
];
export const originLabel = (id) => ORIGINS.find((o) => o.id === id)?.label ?? "Autres";

// Template d'où vient un élément : « novaalab-produit-sec-4 » → « novaalab-produit »,
// « magicmind-produit-design » → « magicmind-produit ».
export const templateOf = (id) => String(id ?? "").replace(/-design$/, "").replace(/-(sec-|p)\d+$/, "");

const OriginContext = createContext(null);

export function OriginProvider({ children }) {
  const [data, setData] = useState({ excel: [], choix: {} });
  useEffect(() => {
    fetch("/api/origines")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  const excel = new Set(data.excel);
  const originOf = (id) => {
    const tpl = templateOf(id);
    const chosen = data.choix[id] ?? data.choix[tpl];
    if (chosen) return chosen;
    if (/^wll?-/.test(tpl)) return "whitelabeler";
    if (excel.has(tpl)) return "daydreamer-excel";
    return "autres";
  };
  async function setOrigin(id, origine) {
    const res = await fetch("/api/origines", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, origine }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    setData((d) => ({ ...d, choix: body.choix }));
  }
  return <OriginContext.Provider value={{ originOf, setOrigin }}>{children}</OriginContext.Provider>;
}

export const useOrigins = () => useContext(OriginContext) ?? { originOf: () => "autres", setOrigin: async () => {} };

// Barre « Origine » : Toutes, puis chaque origine présente, avec son nombre.
export function OriginBar({ ids, value, onChange }) {
  const { originOf } = useOrigins();
  const counts = {};
  for (const id of ids) counts[originOf(id)] = (counts[originOf(id)] ?? 0) + 1;
  return (
    <div className="cat-origins" role="group" aria-label="Origine">
      <span>Origine</span>
      <button type="button" className={!value ? "is-on" : ""} onClick={() => onChange("")}>
        Toutes ({ids.length})
      </button>
      {ORIGINS.filter((o) => counts[o.id]).map((o) => (
        <button key={o.id} type="button" className={value === o.id ? "is-on" : ""} onClick={() => onChange(value === o.id ? "" : o.id)}>
          {o.label} ({counts[o.id]})
        </button>
      ))}
    </div>
  );
}
