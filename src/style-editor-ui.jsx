// Panneau de style de l'atelier, pour un texte, un bouton, une image, une
// colonne / carte ou une section entière. Chaque réglage est rangé dans
// props.atl_styles de la section (engine/frame.js), par écran : « Tous »,
// « Ordinateur » ou « Mobile ». Rendu identique dans l'aperçu et sur Shopify.
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { ImageSetting } from "./fields-ui.jsx";
import { designById } from "./engine/designs.js";

// Menu des écrans (2026-11-16) : Ordinateur · Téléphone · Tous les écrans.
// Le choix est partagé par tous les panneaux de style (il ne revient plus à
// « Tous » à chaque élément) ; Ordinateur / Téléphone mettent aussi l'aperçu
// sur cet écran, et changer l'écran de l'aperçu fait suivre la cible.
const DEVICE_LABELS = [
  { value: "d", label: "Ordinateur", where: "sur ordinateur", width: 1440 },
  { value: "m", label: "Téléphone", where: "sur téléphone", width: 390 },
  { value: "all", label: "Tous les écrans", where: "partout" },
];
const usePuckSel = createUsePuck();
let deviceNow = "all";
// Pour la sélection multiple (inspector-ui) : l'écran visé en ce moment.
export const currentDevice = () => DEVICE_LABELS.find((d) => d.value === deviceNow) ?? DEVICE_LABELS[2];
const deviceSubs = new Set();
const setSharedDevice = (v) => {
  deviceNow = v;
  deviceSubs.forEach((f) => f());
};
const useSharedDevice = () =>
  useSyncExternalStore(
    (f) => (deviceSubs.add(f), () => deviceSubs.delete(f)),
    () => deviceNow,
  );
const FONT_CHOICES = [
  { value: "", label: "D'origine" },
  { value: "var(--atl-font-heading, inherit)", label: "Police des titres" },
  { value: "var(--atl-font-body, inherit)", label: "Police du texte" },
];
const SHADOWS = {
  legere: "0 2px 8px rgba(0,0,0,.08)",
  moyenne: "0 6px 20px rgba(0,0,0,.12)",
  forte: "0 14px 40px rgba(0,0,0,.2)",
};
const BULLETS = { point: '"• "', coche: '"✓ "', fleche: '"→ "', etoile: '"★ "' };
const ARROWS = { fleche: '" →"', chevron: '" ›"', double: '" »"' };
const RATIOS = { carre: "1 / 1", "4-3": "4 / 3", "3-4": "3 / 4", "16-9": "16 / 9" };
const COLUMNS = { "50-50": "1fr 1fr", "60-40": "3fr 2fr", "40-60": "2fr 3fr", "70-30": "7fr 3fr", "30-70": "3fr 7fr", trois: "1fr 1fr 1fr" };
const FOCUS = ["left top", "center top", "right top", "left center", "center center", "right center", "left bottom", "center bottom", "right bottom"];
const CLIP_KEY = "atl-style-clip";
// Apparence relevée à l'écran quand on copie un style (texte, puis boîte).
const COPY_TEXT_PROPS = ["font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform", "color"];
const COPY_BOX_PROPS = ["background-color", "border-radius", "padding-top", "padding-right", "padding-bottom", "padding-left"];
const COPY_SKIP = /^(normal|none|auto|0px|rgba\(0, 0, 0, 0\)|transparent)$/;

export const toHex = (c) => {
  if (/^#[0-9a-f]{6}$/i.test(c ?? "")) return c;
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c ?? "");
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}` : "#000000";
};
const num = (v) => (v === "" || v == null ? "" : parseFloat(v));
// « 320 » → « 320px » ; « 80% », « auto », « 100vh » gardés tels quels.
const len = (v) => (v === "" || v == null ? "" : /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? `${String(v).trim()}px` : String(v).trim());

function Seg({ value, options, onChange }) {
  return (
    <div className="atl-seg2">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? "is-on" : ""} onClick={() => onChange(value === o.value ? "" : o.value)} title={o.title ?? o.label}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Palette de la page (couleurs nommées du design, puis couleurs trouvées dans
// la section), partagée par tous les choix de couleur du panneau.
const PaletteCtx = createContext([]);
const COLOR_NAMES = {
  fond: "Fond",
  surface: "Surface",
  "surface-forte": "Surface forte",
  texte: "Texte",
  bouton: "Bouton",
  "bouton-texte": "Texte du bouton",
  "fond-sombre": "Fond sombre",
  "fond-sombre-2": "Fond sombre 2",
  "surface-sombre": "Surface sombre",
  "texte-sur-sombre": "Texte sur sombre",
  accent: "Accent",
  "accent-clair": "Accent clair",
  etoiles: "Étoiles",
};

// Choix de couleur : onglet « Couleurs du style » (nommées) ou « Personnalisée ».
function Color({ label, value, fallback, onChange }) {
  const palette = useContext(PaletteCtx);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("style");
  const current = value ? toHex(value) : "";
  const named = palette.find((p) => p.hex === current)?.name;
  return (
    <div className="atl-style__row atl-cp-row">
      <span>{label}</span>
      <span className="atl-style__color">
        <button type="button" className="atl-cp__chip" style={{ background: current || toHex(fallback) }} onClick={() => setOpen((o) => !o)} title="Choisir une couleur" />
        <code title={value || ""}>{named ?? (value || "d'origine")}</code>
        {value && (
          <button type="button" onClick={() => onChange("")} title="D'origine">
            ↺
          </button>
        )}
      </span>
      {open && (
        <div className="atl-cp">
          <div className="atl-cp__tabs">
            <button type="button" className={tab === "style" ? "is-on" : ""} onClick={() => setTab("style")}>
              Couleurs du style
            </button>
            <button type="button" className={tab === "perso" ? "is-on" : ""} onClick={() => setTab("perso")}>
              Personnalisée
            </button>
            <button type="button" className="atl-cp__close" onClick={() => setOpen(false)} aria-label="Fermer">
              ×
            </button>
          </div>
          {tab === "style" ? (
            <div className="atl-cp__grid">
              {palette.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  className={current === p.hex ? "is-on" : ""}
                  title={`${p.name} · ${p.hex}`}
                  onClick={() => {
                    onChange(p.hex);
                    setOpen(false);
                  }}
                >
                  <i style={{ background: p.hex }} />
                  <b>{p.name}</b>
                  <small>{p.hex}</small>
                </button>
              ))}
              {!palette.length && <em>Aucune couleur trouvée</em>}
            </div>
          ) : (
            <div className="atl-cp__perso">
              <input type="color" value={current || toHex(fallback)} onChange={(e) => onChange(e.target.value)} />
              <input
                defaultValue={current}
                placeholder="#000000"
                onKeyDown={(e) => e.key === "Enter" && /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) && onChange(`#${e.target.value.trim().replace(/^#/, "")}`)}
                onBlur={(e) => /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) && onChange(`#${e.target.value.trim().replace(/^#/, "")}`)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Styles de texte proposés : ceux du design de la page, sinon ceux lus sur la
// page elle-même (premier H1, H2, H3, H4, paragraphe visibles).
const TEXT_STYLE_LABELS = { h1: ["H1", "Titre 1"], h2: ["H2", "Titre 2"], h3: ["H3", "Titre 3"], h4: ["H4", "Titre 4"], sousTitre: ["ST", "Sous-titre"], texte: ["P", "Paragraphe"], bouton: ["B", "Bouton"] };
const WEIGHT_NAMES = { 100: "Fine", 200: "Très légère", 300: "Légère", 400: "Normale", 500: "Moyenne", 600: "Semi-grasse", 700: "Grasse", 800: "Très grasse", 900: "Noire" };
function textStyles(design, el) {
  const out = [];
  const t = design?.tokens;
  if (t?.styles) {
    for (const key of ["h1", "h2", "h3", "h4", "sousTitre", "texte", "bouton"]) {
      const s = t.styles[key];
      if (!s?.taille) continue;
      const family = s.police && s.police === t.polices?.titres ? "var(--atl-font-heading, inherit)" : s.police && s.police === t.polices?.texte ? "var(--atl-font-body, inherit)" : s.police ? `"${s.police}", sans-serif` : "";
      out.push({ key, police: s.police ?? "", decl: { "font-family": family, "font-size": `${s.taille}px`, "font-weight": s.graisse ? String(s.graisse) : "", "line-height": s.interligne ? String(s.interligne) : "", "text-transform": s.casse === "majuscules" ? "uppercase" : "", "letter-spacing": s.espacement ?? "" } });
    }
    if (out.length) return out;
  }
  const doc = el?.ownerDocument;
  if (!doc) return out;
  const win = doc.defaultView;
  for (const [key, sel] of [["h1", "h1"], ["h2", "h2"], ["h3", "h3"], ["h4", "h4"], ["texte", "main p, p"]]) {
    const seen = [...doc.querySelectorAll(sel)].filter((n) => n.getBoundingClientRect().height > 0 && n.textContent.trim()).slice(0, 40);
    // Paragraphe : le plus long des premiers (une accroche en gras n'est pas représentative).
    const node = key === "texte" ? seen.sort((a, b) => b.textContent.length - a.textContent.length)[0] : seen[0];
    if (!node) continue;
    const cs = win.getComputedStyle(node);
    const size = Math.round(parseFloat(cs.fontSize));
    out.push({ key, police: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), decl: { "font-family": cs.fontFamily, "font-size": `${size}px`, "font-weight": cs.fontWeight, "line-height": cs.lineHeight === "normal" ? "" : (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2), "text-transform": cs.textTransform === "none" ? "" : cs.textTransform, "letter-spacing": cs.letterSpacing === "normal" ? "" : cs.letterSpacing } });
  }
  return out;
}

function TextStyle({ get, write, device, el }) {
  const getPuck = useGetPuck();
  const designId = getPuck().appState.data.root?.props?.design;
  const list = useMemo(() => textStyles(designById[designId], el), [designId, el]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = list.find((s) => s.decl["font-size"] === get("font-size") && (s.decl["font-weight"] || "") === get("font-weight"));
  if (!list.length) return null;
  const apply = (s) => {
    write({ [device]: { base: s ? s.decl : { "font-family": "", "font-size": "", "font-weight": "", "line-height": "", "text-transform": "", "letter-spacing": "" } } });
    setOpen(false);
  };
  const shown = list.filter((s) => !q || TEXT_STYLE_LABELS[s.key][1].toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="atl-f atl-ts">
      <span className="atl-f__lab">Style de texte</span>
      <div className="atl-f__ctl">
        <button type="button" className="atl-ts__btn" onClick={() => setOpen((o) => !o)}>
          <span>Aa</span> {current ? TEXT_STYLE_LABELS[current.key][1] : "Personnalisé / d'origine"} <i>▾</i>
        </button>
        {current && (
          <button type="button" className="atl-f__split" title="Revenir au style d'origine" onClick={() => apply(null)}>
            ↺
          </button>
        )}
      </div>
      {open && (
        <div className="atl-ts__list">
          <input autoFocus placeholder="Chercher un style…" value={q} onChange={(e) => setQ(e.target.value)} />
          {shown.map((s) => {
            const [badge, name] = TEXT_STYLE_LABELS[s.key];
            return (
              <button key={s.key} type="button" className={current?.key === s.key ? "is-on" : ""} onClick={() => apply(s)}>
                <b>{badge}</b>
                <span>
                  {name}
                  <small>
                    {[s.police, s.decl["font-size"], WEIGHT_NAMES[s.decl["font-weight"]] ?? s.decl["font-weight"]].filter(Boolean).join(" · ")}
                  </small>
                </span>
                {current?.key === s.key && <em>✓</em>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Px({ label, value, placeholder, onChange, unit = "px", free = false }) {
  // Saisie libre (« 320 », « 80% », « auto ») : le texte tapé reste tel quel
  // pendant la frappe ; « px » n'est ajouté qu'en validant (Entrée ou sortie
  // du champ), sinon « 8 » devenait « 8px » et le chiffre suivant « 8px0 ».
  const [draft, setDraft] = useState(null);
  const shown = (v) => String(v ?? "").replace(/^(-?\d+(?:\.\d+)?)px$/, "$1");
  const commit = () => {
    if (draft === null) return;
    onChange(len(draft));
    setDraft(null);
  };
  return (
    <label className="atl-style__row">
      <span>{label}</span>
      <span className="atl-style__px">
        <input
          type={free ? "text" : "number"}
          value={free ? draft ?? shown(value) : num(value)}
          placeholder={placeholder ?? ""}
          onChange={(e) => (free ? setDraft(e.target.value) : onChange(e.target.value === "" ? "" : `${e.target.value}${unit}`))}
          onBlur={free ? commit : undefined}
          onKeyDown={free ? (e) => e.key === "Enter" && commit() : undefined}
        />
        {free ? (/^-?\d+(\.\d+)?$/.test(String(draft ?? shown(value)).trim()) ? "px" : "") : unit}
      </span>
    </label>
  );
}

// Valeurs proposées dans les listes déroulantes (on peut aussi taper la sienne).
const SPACES = ["0", "1", "2", "4", "6", "8", "10", "12", "16", "20", "24", "32", "40", "48", "64", "80"];
const pxOptions = (list = SPACES) => [{ value: "", label: "D'origine" }, ...list.map((v) => ({ value: v === "0" ? "0" : `${v}px`, label: v === "0" ? "Aucun" : `${v}px` }))];
const RADII = [
  ["0", "Aucun"],
  ["4px", "Petit"],
  ["8px", "Moyen"],
  ["12px", "Grand"],
  ["16px", "Très grand"],
  ["24px", "2X grand"],
  ["32px", "3X grand"],
  ["9999px", "Arrondi complet"],
];
const OPACITIES = ["100", "90", "75", "60", "50", "25", "10", "0"];
const BORDER_STYLES = [
  { value: "", label: "D'origine" },
  { value: "none", label: "Aucune" },
  { value: "solid", label: "Pleine" },
  { value: "dashed", label: "Tirets" },
  { value: "dotted", label: "Points" },
];

// Champ avec liste de valeurs toutes faites ET saisie libre (« 18 », « 2rem »,
// « auto »). Le texte tapé n'est appliqué qu'en validant (Entrée ou sortie).
function Preset({ value, options, placeholder, onChange, icon, title }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const known = options.find((o) => o.value === value && o.value !== "");
  const shown = draft ?? (known ? known.label : String(value ?? "").replace(/^(-?\d+(?:\.\d+)?)px$/, "$1"));
  const commit = () => {
    if (draft === null) return;
    const hit = options.find((o) => o.label.toLowerCase() === draft.trim().toLowerCase());
    onChange(hit ? hit.value : len(draft));
    setDraft(null);
  };
  return (
    <span className={`atl-pre${open ? " is-open" : ""}`} title={title}>
      {icon && <i className="atl-pre__icon">{icon}</i>}
      <input
        value={shown}
        placeholder={placeholder ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          commit();
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} aria-label="Choisir une valeur">
        ▾
      </button>
      {open && (
        <span className="atl-pre__list" role="listbox">
          {options.map((o) => (
            <button
              key={o.value + o.label}
              type="button"
              role="option"
              className={o.value === value ? "is-on" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value);
                setDraft(null);
                setOpen(false);
              }}
            >
              {o.label}
              {o.value === value && <b>✓</b>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// Ligne « libellé au-dessus, réglages dessous » ; split : bouton qui bascule
// vers un réglage côté par côté (ou coin par coin).
function Field({ label, children, split, onSplit, splitTitle }) {
  return (
    <div className="atl-f">
      <span className="atl-f__lab">{label}</span>
      <div className="atl-f__ctl">
        {children}
        {onSplit && (
          <button type="button" className={`atl-f__split${split ? " is-on" : ""}`} onClick={onSplit} title={splitTitle}>
            ⊞
          </button>
        )}
      </div>
    </div>
  );
}

const SIDES = [
  ["top", "Haut", "↑"],
  ["right", "Droite", "→"],
  ["bottom", "Bas", "↓"],
  ["left", "Gauche", "←"],
];

// Marge intérieure / extérieure : deux réglages (haut-bas, gauche-droite),
// ou les quatre côtés séparément.
function Spacing({ label, prefix, get, set, cs, auto = false }) {
  const v = (s) => get(`${prefix}-${s}`);
  const differs = v("top") !== v("bottom") || v("left") !== v("right");
  const [split, setSplit] = useState(differs);
  const ph = (s) => (cs ? `${Math.round(parseFloat(cs[`${prefix}${s[0].toUpperCase()}${s.slice(1)}`]) || 0)}` : "");
  const opts = pxOptions();
  const hOpts = auto ? [opts[0], { value: "auto", label: "Auto (centré)" }, ...opts.slice(1)] : opts;
  return (
    <Field label={label} split={split} onSplit={() => setSplit((s) => !s)} splitTitle={split ? "Même valeur haut-bas et gauche-droite" : "Régler chaque côté"}>
      {split ? (
        <span className="atl-f__grid">
          {SIDES.map(([s, l, ic]) => (
            <Preset key={s} icon={ic} title={l} value={v(s)} placeholder={ph(s)} options={s === "left" || s === "right" ? hOpts : opts} onChange={(x) => set({ [`${prefix}-${s}`]: x })} />
          ))}
        </span>
      ) : (
        <>
          <Preset icon="↕" title="Haut et bas" value={v("top")} placeholder={ph("top")} options={opts} onChange={(x) => set({ [`${prefix}-top`]: x, [`${prefix}-bottom`]: x })} />
          <Preset icon="↔" title="Gauche et droite" value={v("left")} placeholder={ph("left")} options={hOpts} onChange={(x) => set({ [`${prefix}-left`]: x, [`${prefix}-right`]: x })} />
        </>
      )}
    </Field>
  );
}

// Largeur : fixe, ajustée au contenu, ou remplir la place ; hauteur : fixe ou ajustée.
function Size({ get, set, cs }) {
  const w = get("width");
  const wMode = w === "100%" ? "fill" : w === "fit-content" ? "hug" : w ? "fixed" : "";
  const h = get("height");
  const hMode = h === "auto" ? "hug" : h ? "fixed" : "";
  const [wOpen, setWOpen] = useState(wMode === "fixed");
  const [hOpen, setHOpen] = useState(hMode === "fixed");
  return (
    <>
      <Field label="Largeur">
        <Seg
          value={wOpen && !w ? "fixed" : wMode}
          options={[
            { value: "fixed", label: "Fixe", title: "Largeur précise" },
            { value: "hug", label: "Ajustée", title: "S'ajuste au contenu" },
            { value: "fill", label: "Remplir", title: "Prend toute la place disponible" },
          ]}
          onChange={(m) => {
            setWOpen(m === "fixed");
            set({ width: m === "fill" ? "100%" : m === "hug" ? "fit-content" : m === "fixed" ? `${Math.round(parseFloat(cs?.width) || 0)}px` : "", "box-sizing": m === "fill" ? "border-box" : "" });
          }}
        />
        {wMode === "fixed" && <Preset value={w} placeholder={cs ? `${Math.round(parseFloat(cs.width))}` : ""} options={pxOptions(["120", "200", "280", "320", "400", "480", "560", "640", "800", "960", "1200"]).concat([{ value: "50%", label: "50 %" }, { value: "80%", label: "80 %" }])} onChange={(x) => set({ width: x })} />}
      </Field>
      <Field label="Hauteur">
        <Seg
          value={hOpen && !h ? "fixed" : hMode}
          options={[
            { value: "fixed", label: "Fixe", title: "Hauteur précise" },
            { value: "hug", label: "Ajustée", title: "S'ajuste au contenu" },
          ]}
          onChange={(m) => {
            setHOpen(m === "fixed");
            set({ height: m === "hug" ? "auto" : m === "fixed" ? `${Math.round(parseFloat(cs?.height) || 0)}px` : "" });
          }}
        />
        {hMode === "fixed" && <Preset value={h} placeholder={cs ? `${Math.round(parseFloat(cs.height))}` : ""} options={pxOptions(["40", "48", "64", "80", "120", "200", "300", "400", "500", "600"]).concat([{ value: "100vh", label: "Plein écran" }])} onChange={(x) => set({ height: x })} />}
      </Field>
    </>
  );
}

// Coins arrondis : une valeur pour tous, ou coin par coin.
function Corners({ get, set, cs, clip }) {
  const CORNERS = [
    ["top-left", "Haut gauche", "◜"],
    ["top-right", "Haut droite", "◝"],
    ["bottom-left", "Bas gauche", "◟"],
    ["bottom-right", "Bas droite", "◞"],
  ];
  const any = CORNERS.some(([c]) => get(`border-${c}-radius`));
  const [split, setSplit] = useState(any);
  const opts = [{ value: "", label: "D'origine" }, ...RADII.map(([value, label]) => ({ value, label }))];
  const extra = (v) => (clip ? { overflow: v ? "hidden" : "" } : {});
  return (
    <Field label="Coins arrondis" split={split} onSplit={() => setSplit((s) => !s)} splitTitle={split ? "Même arrondi partout" : "Régler chaque coin"}>
      {split ? (
        <span className="atl-f__grid">
          {CORNERS.map(([c, l, ic]) => (
            <Preset key={c} icon={ic} title={l} value={get(`border-${c}-radius`) || get("border-radius")} placeholder={cs ? `${Math.round(parseFloat(cs.getPropertyValue(`border-${c}-radius`)) || 0)}` : ""} options={opts} onChange={(x) => set({ "border-radius": "", ...Object.fromEntries(CORNERS.map(([k]) => [`border-${k}-radius`, k === c ? x : get(`border-${k}-radius`) || get("border-radius")])), ...extra(x) })} />
          ))}
        </span>
      ) : (
        <Preset
          icon="◌"
          value={get("border-radius")}
          placeholder={cs ? `${Math.round(parseFloat(cs.borderTopLeftRadius) || 0)}` : ""}
          options={opts}
          onChange={(x) => set({ "border-radius": x, ...Object.fromEntries(CORNERS.map(([c]) => [`border-${c}-radius`, ""])), ...extra(x) })}
        />
      )}
    </Field>
  );
}

// Bordure : couleur, style, épaisseur (une pour tous les côtés ou côté par côté).
function Border({ get, set, cs }) {
  const any = SIDES.some(([s]) => get(`border-${s}-width`));
  const [split, setSplit] = useState(any);
  const opts = pxOptions(["0", "1", "2", "3", "4", "6", "8"]);
  const withStyle = (decl, x) => ({ ...decl, "border-style": x && x !== "0" && !get("border-style") ? "solid" : get("border-style") });
  return (
    <>
      <Field label="Bordure">
        <span className="atl-style__color">
          <input type="color" value={get("border-color") ? toHex(get("border-color")) : toHex(cs?.borderTopColor)} onChange={(e) => set({ "border-color": e.target.value, "border-style": get("border-style") || "solid", "border-width": get("border-width") || (any ? "" : "1px") })} title="Couleur de la bordure" />
        </span>
        <select className="atl-f__select" value={get("border-style")} onChange={(e) => set({ "border-style": e.target.value })} title="Style de trait">
          {BORDER_STYLES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Épaisseur" split={split} onSplit={() => setSplit((s) => !s)} splitTitle={split ? "Même épaisseur partout" : "Régler chaque côté"}>
        {split ? (
          <span className="atl-f__grid">
            {SIDES.map(([s, l, ic]) => (
              <Preset key={s} icon={ic} title={l} value={get(`border-${s}-width`)} placeholder={cs ? `${Math.round(parseFloat(cs[`border${s[0].toUpperCase()}${s.slice(1)}Width`]) || 0)}` : ""} options={opts} onChange={(x) => set(withStyle({ "border-width": "", [`border-${s}-width`]: x }, x))} />
            ))}
          </span>
        ) : (
          <Preset icon="▭" value={get("border-width")} placeholder={cs ? `${Math.round(parseFloat(cs.borderTopWidth) || 0)}` : ""} options={opts} onChange={(x) => set(withStyle({ "border-width": x, ...Object.fromEntries(SIDES.map(([s]) => [`border-${s}-width`, ""])) }, x))} />
        )}
      </Field>
    </>
  );
}

// Couleurs du style déjà appliqué : la palette du design.md de la page, puis
// les couleurs présentes dans la section (fonds et textes), les plus
// fréquentes d'abord.
function styleColors(designId, el) {
  const out = [];
  let n = 0;
  const add = (c, name) => {
    const hex = c && c.startsWith("#") ? c.toLowerCase() : c ? toHex(c) : null;
    if (hex && !out.some((o) => o.hex === hex)) out.push({ hex, name: name ?? `Couleur de la page ${++n}` });
  };
  for (const [k, c] of Object.entries(designById[designId]?.tokens?.couleurs ?? {})) if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim())) add(c.trim(), COLOR_NAMES[k] ?? k);
  const root = el?.closest?.("[data-atl-id]") ?? el;
  if (root) {
    const win = root.ownerDocument.defaultView;
    const count = new Map();
    const seen = [root, ...root.querySelectorAll("*")].slice(0, 600);
    for (const x of seen) {
      const cs = win.getComputedStyle(x);
      for (const c of [cs.backgroundColor, cs.color]) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c);
        if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) continue;
        const hex = toHex(c);
        count.set(hex, (count.get(hex) ?? 0) + 1);
      }
    }
    [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c]) => add(c));
  }
  return out.slice(0, 12);
}

// Fond d'une section ou d'un élément : une couleur du style en un clic, une
// autre couleur, ou une image téléversée (sections, cartes, colonnes).
function Background({ value, fallback, onColor, image, onImage }) {
  const colors = useContext(PaletteCtx);
  const current = value ? toHex(value) : "";
  return (
    <div className="atl-bg">
      <span className="atl-bg__label">Couleurs du style</span>
      <div className="atl-bg__swatches">
        {colors.map(({ hex: c, name }) => (
          <button key={c} type="button" className={current === c ? "is-on" : ""} style={{ background: c }} title={`${name} · ${c}`} onClick={() => onColor(current === c ? "" : c)} />
        ))}
        {!colors.length && <em>Aucune couleur trouvée</em>}
      </div>
      <Color label="Autre couleur" value={value} fallback={fallback} onChange={onColor} />
      {onImage && <ImageSetting field={{ label: "Image de fond" }} value={image ?? ""} onChange={onImage} />}
      {onImage && image && (
        <button type="button" className="atl-bg__remove" onClick={() => onImage("")}>
          Retirer l'image de fond
        </button>
      )}
    </div>
  );
}

function Part({ title, open = false, children }) {
  return (
    <details className="atl-sx__part" open={open}>
      <summary>{title}</summary>
      <div className="atl-style">{children}</div>
    </details>
  );
}

// kind : « texte », « bouton », « image », « groupe », « section ».
// targets : cibles de atl_styles (plusieurs pour un texte de plusieurs paragraphes).
export function StyleEditor({ kind, targets, props, onChangeProps, el, legacy, onResetLegacy }) {
  const device = useSharedDevice();
  const getPuckNow = useGetPuck();
  const viewWidth = usePuckSel((s) => s.appState.ui.viewports?.current?.width);
  // Écran de l'aperçu changé à la main : la cible suit (sauf « Tous »).
  useEffect(() => {
    if (deviceNow === "all" || typeof viewWidth !== "number") return;
    const seen = viewWidth < 750 ? "m" : "d";
    if (seen !== deviceNow) setSharedDevice(seen);
  }, [viewWidth]);
  const setDevice = (v) => {
    setSharedDevice(v);
    const target = DEVICE_LABELS.find((d) => d.value === v)?.width;
    if (!target) return;
    const { appState, dispatch } = getPuckNow();
    const vp = appState.ui.viewports ?? {};
    if (vp.current?.width !== target) dispatch({ type: "setUi", ui: { viewports: { ...vp, current: { ...(vp.current ?? {}), width: target, height: "auto" } } } });
  };
  const styles = props.atl_styles ?? {};
  const first = styles[targets[0]] ?? {};
  const cs = el ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
  const get = (prop, part = "base", dev = device) => first?.[dev]?.[part]?.[prop] ?? "";

  // patches : { [écran]: { [partie]: { propriété: valeur ou "" pour retirer } } }
  const write = (patches, extraProps = {}) => {
    const next = structuredClone(styles);
    for (const t of targets) {
      for (const [dev, parts] of Object.entries(patches)) {
        for (const [part, decl] of Object.entries(parts)) {
          for (const [p, v] of Object.entries(decl)) {
            if (v === "" || v == null) {
              delete next[t]?.[dev]?.[part]?.[p];
            } else {
              next[t] ??= {};
              next[t][dev] ??= {};
              next[t][dev][part] ??= {};
              next[t][dev][part][p] = v;
            }
          }
          if (next[t]?.[dev]?.[part] && !Object.keys(next[t][dev][part]).length) delete next[t][dev][part];
        }
        if (next[t]?.[dev] && !Object.keys(next[t][dev]).length) delete next[t][dev];
      }
      if (next[t] && !Object.keys(next[t]).length) delete next[t];
    }
    onChangeProps({ ...props, ...extraProps, atl_styles: next });
  };
  const set = (decl, part = "base") => write({ [device]: { [part]: decl } });
  const isText = kind === "texte" || kind === "bouton";

  // Copier le style (vérifié le 2026-11-16) : avant, un élément jamais retouché
  // copiait un style vide, et le coller EFFAÇAIT les retouches de la cible.
  // Maintenant on copie aussi son apparence réelle (police, taille, couleur…,
  // relevée à l'écran) et coller s'AJOUTE aux retouches de la cible.
  const [clipMsg, setClipMsg] = useState("");
  const flashMsg = (m) => {
    setClipMsg(m);
    setTimeout(() => setClipMsg((cur) => (cur === m ? "" : cur)), 2200);
  };
  const copyStyle = () => {
    const clip = structuredClone(first);
    if (cs) {
      const base = (clip.all ??= {}).base ??= {};
      // Section : seulement sa couleur de fond (ses marges lui sont propres).
      const keys = isText ? COPY_TEXT_PROPS.concat(kind === "bouton" ? COPY_BOX_PROPS : []) : kind === "section" ? ["background-color"] : COPY_BOX_PROPS;
      for (const p of keys) {
        const v = cs.getPropertyValue(p);
        if (base[p] == null && v && !COPY_SKIP.test(v)) base[p] = v;
      }
      // Interligne relevé en px → rapport (le champ « Interligne » attend 1,5…).
      const lh = parseFloat(base["line-height"]);
      const fs = parseFloat(cs.fontSize);
      if (/px$/.test(base["line-height"] ?? "") && lh && fs) base["line-height"] = String(Math.round((lh / fs) * 100) / 100);
      // Police d'origine : la même pile que la page, sans guillemets superflus.
      if (base["font-family"]) base["font-family"] = base["font-family"].replace(/"/g, "'");
    }
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
      flashMsg("✓ Style copié");
    } catch {
      flashMsg("Copie impossible");
    }
  };
  const pasteStyle = () => {
    let clip = null;
    try {
      clip = JSON.parse(localStorage.getItem(CLIP_KEY) ?? "null");
    } catch {}
    if (!clip || !Object.keys(clip).length) return flashMsg("Rien à coller : copie d'abord un style");
    const next = structuredClone(styles);
    for (const t of targets) {
      next[t] ??= {};
      for (const [dev, parts] of Object.entries(clip)) {
        next[t][dev] ??= {};
        for (const [part, decl] of Object.entries(parts ?? {})) next[t][dev][part] = { ...(next[t][dev][part] ?? {}), ...decl };
      }
    }
    onChangeProps({ ...props, atl_styles: next });
    flashMsg("✓ Style collé (Ctrl+Z pour annuler)");
  };
  const reset = () => {
    const next = { ...styles };
    for (const t of targets) delete next[t];
    onChangeProps({ ...props, atl_styles: next, ...(kind === "section" ? { atl_fond_image: "", atl_animation: "", atl_ancre: "" } : {}) });
    onResetLegacy?.();
  };
  const hasStyle = targets.some((t) => styles[t]) || Boolean(legacy);
  const hidden = get("display") === "none";
  const deviceInfo = DEVICE_LABELS.find((d) => d.value === device);
  const deviceName = deviceInfo.label.toLowerCase();
  const designId = useGetPuck()().appState.data.root?.props?.design;
  const palette = useMemo(() => styleColors(designId, el), [designId, el]);

  return (
    <PaletteCtx.Provider value={palette}>
    <div className="atl-sx">
      <div className="atl-sx__device">
        {DEVICE_LABELS.map((d) => (
          <button key={d.value} type="button" className={device === d.value ? "is-on" : ""} onClick={() => setDevice(d.value)}>
            {d.label}
          </button>
        ))}
      </div>
      {device !== "all" && <p className="atl-insp__hint">Modifications {deviceInfo.where} seulement ; le reste vient de « Tous les écrans ».</p>}

      {isText && (
        <Part title="Typographie" open>
          <TextStyle get={get} write={write} device={device} el={el} />
          <label className="atl-style__row">
            <span>Police</span>
            <select value={get("font-family")} onChange={(e) => set({ "font-family": e.target.value })}>
              {FONT_CHOICES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <Px label="Taille" value={get("font-size")} placeholder={cs && Number.isFinite(parseFloat(cs.fontSize)) ? Math.round(parseFloat(cs.fontSize)) : ""} onChange={(v) => set({ "font-size": v })} />
          <div className="atl-style__row">
            <span>Graisse</span>
            <Seg value={get("font-weight")} options={["300", "400", "500", "600", "700", "800"].map((w) => ({ value: w, label: w }))} onChange={(v) => set({ "font-weight": v })} />
          </div>
          <label className="atl-style__row">
            <span>Interligne</span>
            <input
              type="number"
              step="0.05"
              min="0.8"
              max="3"
              value={get("line-height")}
              placeholder={cs && Number.isFinite(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)) ? (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2) : "auto"}
              onChange={(e) => set({ "line-height": e.target.value })}
            />
          </label>
          <Px label="Espacement" value={get("letter-spacing")} placeholder={cs ? parseFloat(cs.letterSpacing) || 0 : ""} onChange={(v) => set({ "letter-spacing": v })} />
          <div className="atl-style__row">
            <span>Style</span>
            <div className="atl-seg2">
              {[
                ["font-style", "italic", <i key="i">I</i>, "Italique"],
                ["text-decoration-line", "underline", <u key="u">U</u>, "Souligné"],
                ["text-decoration-line", "line-through", <s key="s">S</s>, "Barré"],
                ["text-transform", "uppercase", "AA", "Majuscules"],
              ].map(([p, v, label, title]) => (
                <button key={title} type="button" title={title} className={get(p) === v ? "is-on" : ""} onClick={() => set({ [p]: get(p) === v ? "" : v })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Color label="Couleur" value={get("color")} fallback={cs?.color} onChange={(v) => set({ color: v })} />
          <p className="atl-style__title">Fond</p>
          <Background value={get("background-color")} fallback={cs?.backgroundColor} onColor={(v) => set({ "background-color": v })} el={el} />
          <div className="atl-style__row">
            <span>Alignement</span>
            <Seg
              value={get("text-align")}
              options={[
                { value: "left", label: "⯇", title: "À gauche" },
                { value: "center", label: "≡", title: "Centré" },
                { value: "right", label: "⯈", title: "À droite" },
              ]}
              onChange={(v) => set({ "text-align": v })}
            />
          </div>
          <Px label="Largeur max." value={get("max-width")} placeholder="—" onChange={(v) => set({ "max-width": v })} />
          {kind === "texte" && (
            <>
              <div className="atl-style__row">
                <span>Puce</span>
                <Seg
                  value={Object.keys(BULLETS).find((k) => BULLETS[k] === get("content", "before")) ?? ""}
                  options={[
                    { value: "point", label: "•" },
                    { value: "coche", label: "✓" },
                    { value: "fleche", label: "→" },
                    { value: "etoile", label: "★" },
                  ]}
                  onChange={(v) => set({ content: v ? BULLETS[v] : "", "margin-right": v ? "0.15em" : "" }, "before")}
                />
              </div>
              {get("content", "before") && <Color label="Couleur de la puce" value={get("color", "before")} fallback={cs?.color} onChange={(v) => set({ color: v }, "before")} />}
            </>
          )}
        </Part>
      )}

      {kind === "bouton" && (
        <Part title="Bouton" open>
          <Color label="Fond au survol" value={get("background-color", "hover")} fallback={cs?.backgroundColor} onChange={(v) => set({ "background-color": v }, "hover")} />
          <Color label="Texte au survol" value={get("color", "hover")} fallback={cs?.color} onChange={(v) => set({ color: v }, "hover")} />
          <label className="atl-style__toggle">
            <input
              type="checkbox"
              checked={get("width") === "100%"}
              onChange={(e) => set(e.target.checked ? { display: "block", width: "100%", "box-sizing": "border-box", "text-align": "center" } : { display: "", width: "", "box-sizing": "", "text-align": "" })}
            />{" "}
            Pleine largeur
          </label>
          <div className="atl-style__row">
            <span>Flèche après</span>
            <Seg
              value={Object.keys(ARROWS).find((k) => ARROWS[k] === get("content", "after")) ?? ""}
              options={[
                { value: "fleche", label: "→" },
                { value: "chevron", label: "›" },
                { value: "double", label: "»" },
              ]}
              onChange={(v) => set({ content: v ? ARROWS[v] : "" }, "after")}
            />
          </div>
        </Part>
      )}

      {kind === "image" && (
        <Part title="Image" open>
          <div className="atl-style__row">
            <span>Format</span>
            <Seg
              value={Object.keys(RATIOS).find((k) => RATIOS[k] === get("aspect-ratio")) ?? ""}
              options={[
                { value: "carre", label: "1:1" },
                { value: "4-3", label: "4:3" },
                { value: "3-4", label: "3:4" },
                { value: "16-9", label: "16:9" },
              ]}
              onChange={(v) => set(v ? { "aspect-ratio": RATIOS[v], "object-fit": get("object-fit") || "cover", height: "auto" } : { "aspect-ratio": "", height: "" })}
            />
          </div>
          <div className="atl-style__row">
            <span>Cadrage</span>
            <Seg
              value={get("object-fit")}
              options={[
                { value: "cover", label: "Remplir" },
                { value: "contain", label: "Entière" },
              ]}
              onChange={(v) => set({ "object-fit": v })}
            />
          </div>
          <div className="atl-style__row">
            <span>Point à garder</span>
            <div className="atl-sx__focus">
              {FOCUS.map((f) => (
                <button key={f} type="button" title={f} className={get("object-position") === f ? "is-on" : ""} onClick={() => set({ "object-position": get("object-position") === f ? "" : f })} />
              ))}
            </div>
          </div>
        </Part>
      )}

      {kind === "groupe" && (
        <Part title="Colonnes" open>
          <div className="atl-style__row">
            <span>En mobile</span>
            <Seg
              value={get("flex-direction", "base", "m")}
              options={[
                { value: "column", label: "Empiler" },
                { value: "column-reverse", label: "Inverser" },
              ]}
              onChange={(v) =>
                write({
                  m: {
                    base: v ? { display: "flex", "flex-direction": v } : { display: "", "flex-direction": "" },
                    kids: v ? { width: "100%", "max-width": "100%", "flex-basis": "auto" } : { width: "", "max-width": "", "flex-basis": "" },
                  },
                })
              }
            />
          </div>
          <div className="atl-style__row">
            <span>Largeurs (ordinateur)</span>
            <select
              value={Object.keys(COLUMNS).find((k) => COLUMNS[k] === get("grid-template-columns", "base", "d")) ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                write({
                  d: {
                    base: v ? { display: "grid", "grid-template-columns": COLUMNS[v] } : { display: "", "grid-template-columns": "" },
                    kids: v ? { width: "auto", "max-width": "none" } : { width: "", "max-width": "" },
                  },
                });
              }}
            >
              <option value="">D'origine</option>
              <option value="50-50">50 / 50</option>
              <option value="60-40">60 / 40</option>
              <option value="40-60">40 / 60</option>
              <option value="70-30">70 / 30</option>
              <option value="30-70">30 / 70</option>
              <option value="trois">3 égales</option>
            </select>
          </div>
          <div className="atl-style__row">
            <span>Alignement vertical</span>
            <Seg
              value={get("align-items")}
              options={[
                { value: "flex-start", label: "Haut" },
                { value: "center", label: "Centre" },
                { value: "flex-end", label: "Bas" },
              ]}
              onChange={(v) => set({ "align-items": v })}
            />
          </div>
          <p className="atl-style__title">Fond</p>
          <Background
            value={get("background-color")}
            fallback={cs?.backgroundColor}
            onColor={(v) => set({ "background-color": v })}
            image={/^url\("(.+)"\)$/.exec(get("background-image"))?.[1] ?? ""}
            onImage={(v) => set(v ? { "background-image": `url("${v.replace(/"/g, "%22")}")`, "background-size": "cover", "background-position": "center" } : { "background-image": "", "background-size": "", "background-position": "" })}
            el={el}
          />
        </Part>
      )}

      {kind === "section" && (
        <Part title="Fond de la section" open>
          <Background value={get("background-color")} fallback={cs?.backgroundColor} onColor={(v) => set({ "background-color": v })} el={el} />
          <div className="atl-style__row">
            <span>Dégradé</span>
            <span className="atl-sx__grad">
              <input type="color" value={toHex(gradientColors(get("background-image"))[0] ?? "#ffffff")} onChange={(e) => setGradient(e.target.value, null)} />
              <input type="color" value={toHex(gradientColors(get("background-image"))[1] ?? "#eeeeee")} onChange={(e) => setGradient(null, e.target.value)} />
              {/gradient/.test(get("background-image")) && (
                <button type="button" onClick={() => set({ "background-image": "" })} title="Sans dégradé">
                  ↺
                </button>
              )}
            </span>
          </div>
          <ImageSetting
            field={{ label: "Image de fond" }}
            value={props.atl_fond_image ?? ""}
            onChange={(v) =>
              write(
                { all: { base: v ? { "background-image": 'url("@@IMG@@")', "background-size": "cover", "background-position": "center" } : { "background-image": "", "background-size": "", "background-position": "" } } },
                { atl_fond_image: v ?? "" },
              )
            }
          />
          <label className="atl-style__toggle">
            <input type="checkbox" checked={get("min-height") === "100vh"} onChange={(e) => set({ "min-height": e.target.checked ? "100vh" : "" })} /> Hauteur plein écran
          </label>
          <div className="atl-style__row">
            <span>Séparateur en bas</span>
            <Seg
              value={separatorOf(get("background", "after"), get("clip-path", "after"), get("border-top-left-radius", "after"))}
              options={[
                { value: "vague", label: "Vague" },
                { value: "diagonale", label: "Diagonale" },
                { value: "courbe", label: "Courbe" },
              ]}
              onChange={(v) => setSeparator(v, get("--atl-sep", "after") || "#ffffff")}
            />
          </div>
          {get("content", "after") && <Color label="Couleur du séparateur" value={get("--atl-sep", "after")} fallback="#ffffff" onChange={(c) => setSeparator(separatorOf(get("background", "after"), get("clip-path", "after"), get("border-top-left-radius", "after")), c || "#ffffff")} />}
          <div className="atl-style__row">
            <span>Apparition</span>
            <Seg
              value={props.atl_animation ?? ""}
              options={[
                { value: "fondu", label: "Fondu" },
                { value: "montee", label: "Montée" },
              ]}
              onChange={(v) => onChangeProps({ ...props, atl_animation: v })}
            />
          </div>
          <label className="atl-style__row">
            <span>Ancre (#)</span>
            <input value={props.atl_ancre ?? ""} placeholder="ex. offre" onChange={(e) => onChangeProps({ ...props, atl_ancre: e.target.value })} />
          </label>
          {props.atl_ancre && <p className="atl-insp__hint">Un bouton avec le lien « #{props.atl_ancre.replace(/^#/, "")} » descend jusqu'à cette section.</p>}
        </Part>
      )}

      {(
        <Part title="Taille et espacements" open={kind === "section" || kind === "groupe"} key={`dim-${device}-${targets[0]}`}>
          {kind !== "section" && <Size get={get} set={set} cs={cs} />}
          {(kind === "section" || kind === "groupe") && (
            <Field label="Espace entre éléments">
              <Preset icon="⇹" value={get("gap")} placeholder={cs ? `${parseFloat(cs.columnGap) || 0}` : ""} options={pxOptions()} onChange={(v) => set({ gap: v })} />
            </Field>
          )}
          <Spacing label="Marge intérieure" prefix="padding" get={get} set={set} cs={cs} />
          <Spacing label="Marge extérieure" prefix="margin" get={get} set={set} cs={cs} auto />
          <Field label="Largeur max. · Hauteur min.">
            <Preset icon="⇤" title="Largeur maximale" value={get("max-width")} placeholder="—" options={pxOptions(["320", "480", "640", "800", "960", "1100", "1200", "1400"]).concat([{ value: "none", label: "Aucune" }])} onChange={(v) => set({ "max-width": v })} />
            <Preset icon="⤒" title="Hauteur minimale" value={get("min-height")} placeholder="—" options={pxOptions(["100", "200", "300", "400", "500", "600"]).concat([{ value: "100vh", label: "Plein écran" }])} onChange={(v) => set({ "min-height": v })} />
          </Field>
        </Part>
      )}

      <Part title="Apparence" key={`app-${device}-${targets[0]}`}>
        <Field label="Opacité">
          <Preset
            icon="◐"
            value={get("opacity") === "" ? "" : `${Math.round(parseFloat(get("opacity")) * 100)}%`}
            placeholder="100%"
            options={[{ value: "", label: "D'origine" }, ...OPACITIES.map((o) => ({ value: `${o}%`, label: `${o} %` }))]}
            onChange={(v) => set({ opacity: v === "" ? "" : String(Math.max(0, Math.min(100, parseFloat(v) || 0)) / 100) })}
          />
        </Field>
        <Corners get={get} set={set} cs={cs} clip={kind === "groupe"} />
        <Border get={get} set={set} cs={cs} />
        <div className="atl-style__row">
          <span>Ombre</span>
          <Seg
            value={Object.keys(SHADOWS).find((k) => SHADOWS[k] === get("box-shadow")) ?? ""}
            options={[
              { value: "legere", label: "Légère" },
              { value: "moyenne", label: "Moyenne" },
              { value: "forte", label: "Forte" },
            ]}
            onChange={(v) => set({ "box-shadow": v ? SHADOWS[v] : "" })}
          />
        </div>
      </Part>

      <label className="atl-style__toggle">
        <input type="checkbox" checked={hidden} onChange={(e) => set({ display: e.target.checked ? "none" : "" })} /> Masquer {deviceInfo.where}
      </label>

      <div className="atl-sx__actions">
        <button type="button" onClick={copyStyle} title="Copier le style de cet élément">
          Copier le style
        </button>
        <button type="button" onClick={pasteStyle} title="Coller le style copié sur cet élément">
          Coller le style
        </button>
        {hasStyle && (
          <button type="button" className="atl-style__reset" onClick={reset}>
            Rétablir l'origine
          </button>
        )}
      </div>
      {clipMsg && (
        <p className="atl-sx__clipmsg" role="status">
          {clipMsg}
        </p>
      )}
    </div>
    </PaletteCtx.Provider>
  );

  function setGradient(c1, c2) {
    const [a, b] = gradientColors(get("background-image"));
    set({ "background-image": `linear-gradient(180deg, ${c1 ?? a ?? "#ffffff"}, ${c2 ?? b ?? "#eeeeee"})` });
  }
  function setSeparator(shape, color) {
    const after = { content: "", position: "", left: "", right: "", bottom: "", height: "", background: "", "clip-path": "", "border-top-left-radius": "", "border-top-right-radius": "", "--atl-sep": "", "pointer-events": "", "z-index": "" };
    if (shape) {
      Object.assign(after, { content: '""', position: "absolute", left: "0", right: "0", bottom: "-1px", height: "50px", "--atl-sep": color, "pointer-events": "none", "z-index": "1" });
      if (shape === "vague") Object.assign(after, { height: "24px", background: `radial-gradient(circle at 20px -8px, transparent 22px, ${color} 23px) 0 0 / 40px 24px repeat-x` });
      if (shape === "diagonale") Object.assign(after, { background: color, "clip-path": "polygon(0 100%, 100% 0, 100% 100%)" });
      if (shape === "courbe") Object.assign(after, { background: color, "border-top-left-radius": "50% 100%", "border-top-right-radius": "50% 100%" });
    }
    write({ [device]: { base: { position: shape ? "relative" : "" }, after } });
  }
}

const gradientColors = (v) => String(v ?? "").match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi) ?? [];
function separatorOf(background, clip, radius) {
  if (clip) return "diagonale";
  if (radius) return "courbe";
  if (/radial-gradient/.test(background ?? "")) return "vague";
  return "";
}
