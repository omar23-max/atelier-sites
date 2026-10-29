// Panneau de style de l'atelier, pour un texte, un bouton, une image, une
// colonne / carte ou une section entière. Chaque réglage est rangé dans
// props.atl_styles de la section (engine/frame.js), par écran : « Tous »,
// « Ordinateur » ou « Mobile ». Rendu identique dans l'aperçu et sur Shopify.
import { useState } from "react";
import { ImageSetting } from "./fields-ui.jsx";

const DEVICE_LABELS = [
  { value: "all", label: "Tous les écrans" },
  { value: "d", label: "Ordinateur" },
  { value: "m", label: "Mobile" },
];
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

function Color({ label, value, fallback, onChange }) {
  return (
    <div className="atl-style__row">
      <span>{label}</span>
      <span className="atl-style__color">
        <input type="color" value={value && value.startsWith("#") ? value : toHex(fallback)} onChange={(e) => onChange(e.target.value)} />
        <code>{value || "d'origine"}</code>
        {value && (
          <button type="button" onClick={() => onChange("")} title="D'origine">
            ↺
          </button>
        )}
      </span>
    </div>
  );
}

function Px({ label, value, placeholder, onChange, unit = "px", free = false }) {
  return (
    <label className="atl-style__row">
      <span>{label}</span>
      <span className="atl-style__px">
        <input
          type={free ? "text" : "number"}
          value={free ? value ?? "" : num(value)}
          placeholder={placeholder ?? ""}
          onChange={(e) => onChange(free ? len(e.target.value) : e.target.value === "" ? "" : `${e.target.value}${unit}`)}
        />
        {!free && unit}
      </span>
    </label>
  );
}

// Quatre côtés (haut, droite, bas, gauche) d'une marge.
function Sides({ label, prefix, get, set, cs }) {
  const sides = [
    ["top", "Haut"],
    ["right", "Droite"],
    ["bottom", "Bas"],
    ["left", "Gauche"],
  ];
  const camel = (s) => `${prefix}${s[0].toUpperCase()}${s.slice(1)}`;
  return (
    <div className="atl-sx__sides">
      <span>{label}</span>
      <div>
        {sides.map(([s, l]) => (
          <label key={s} title={l}>
            <input
              type="number"
              value={num(get(`${prefix}-${s}`))}
              placeholder={cs ? Math.round(parseFloat(cs[camel(s)])) : ""}
              onChange={(e) => set({ [`${prefix}-${s}`]: e.target.value === "" ? "" : `${e.target.value}px` })}
            />
            <small>{l[0]}</small>
          </label>
        ))}
      </div>
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
  const [device, setDevice] = useState("all");
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

  const copyStyle = () => {
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(first));
    } catch {}
  };
  const pasteStyle = () => {
    let clip = null;
    try {
      clip = JSON.parse(localStorage.getItem(CLIP_KEY) ?? "null");
    } catch {}
    if (!clip) return;
    onChangeProps({ ...props, atl_styles: { ...styles, ...Object.fromEntries(targets.map((t) => [t, structuredClone(clip)])) } });
  };
  const reset = () => {
    const next = { ...styles };
    for (const t of targets) delete next[t];
    onChangeProps({ ...props, atl_styles: next, ...(kind === "section" ? { atl_fond_image: "", atl_animation: "", atl_ancre: "" } : {}) });
    onResetLegacy?.();
  };
  const hasStyle = targets.some((t) => styles[t]) || Boolean(legacy);
  const hidden = get("display") === "none";
  const deviceName = DEVICE_LABELS.find((d) => d.value === device).label.toLowerCase();

  return (
    <div className="atl-sx">
      <div className="atl-sx__device">
        {DEVICE_LABELS.map((d) => (
          <button key={d.value} type="button" className={device === d.value ? "is-on" : ""} onClick={() => setDevice(d.value)}>
            {d.label}
          </button>
        ))}
      </div>
      {device !== "all" && <p className="atl-insp__hint">Réglages pour {deviceName} seulement ; le reste vient de « Tous les écrans ».</p>}

      {isText && (
        <Part title="Typographie" open>
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
          <Px label="Taille" value={get("font-size")} placeholder={cs ? Math.round(parseFloat(cs.fontSize)) : ""} onChange={(v) => set({ "font-size": v })} />
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
              placeholder={cs && cs.lineHeight !== "normal" ? (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2) : "auto"}
              onChange={(e) => set({ "line-height": e.target.value })}
            />
          </label>
          <Px label="Espace entre lettres" value={get("letter-spacing")} placeholder={cs ? parseFloat(cs.letterSpacing) || 0 : ""} onChange={(v) => set({ "letter-spacing": v })} />
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
          <Color label="Fond" value={get("background-color")} fallback={cs?.backgroundColor} onChange={(v) => set({ "background-color": v })} />
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
          <Px label="Largeur max. des lignes" value={get("max-width")} placeholder="—" onChange={(v) => set({ "max-width": v })} />
          {kind === "texte" && (
            <>
              <div className="atl-style__row">
                <span>Puce devant</span>
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
          <Px label="Espace entre éléments" value={get("gap")} placeholder={cs ? parseFloat(cs.columnGap) || 0 : ""} onChange={(v) => set({ gap: v })} />
          <Color label="Fond" value={get("background-color")} fallback={cs?.backgroundColor} onChange={(v) => set({ "background-color": v })} />
        </Part>
      )}

      {kind === "section" && (
        <Part title="Fond de la section" open>
          <Color label="Couleur" value={get("background-color")} fallback={cs?.backgroundColor} onChange={(v) => set({ "background-color": v })} />
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
        <Part title="Marges et dimensions" open={kind === "section" || kind === "groupe"}>
          <Sides label="Marge extérieure" prefix="margin" get={(p) => get(p)} set={set} cs={cs} />
          <Sides label="Marge intérieure" prefix="padding" get={(p) => get(p)} set={set} cs={cs} />
          <Px label="Largeur" free value={get("width")} placeholder="ex. 320 ou 80%" onChange={(v) => set({ width: v })} />
          <Px label="Largeur max." free value={get("max-width")} placeholder="ex. 1200" onChange={(v) => set({ "max-width": v })} />
          <Px label="Hauteur min." free value={get("min-height")} placeholder="ex. 400" onChange={(v) => set({ "min-height": v })} />
          {kind === "section" && <Px label="Espace entre éléments" value={get("gap")} placeholder="—" onChange={(v) => set({ gap: v })} />}
        </Part>
      )}

      <Part title="Apparence">
        <Px label="Coins arrondis" value={get("border-radius")} placeholder={cs ? Math.round(parseFloat(cs.borderTopLeftRadius)) : ""} onChange={(v) => set({ "border-radius": v, overflow: kind === "groupe" && v ? "hidden" : "" })} />
        <Px label="Bordure" value={get("border-width")} placeholder={cs ? Math.round(parseFloat(cs.borderTopWidth)) : ""} onChange={(v) => set({ "border-width": v, "border-style": v ? "solid" : "" })} />
        {get("border-width") && <Color label="Couleur de bordure" value={get("border-color")} fallback={cs?.borderTopColor} onChange={(v) => set({ "border-color": v })} />}
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
        <label className="atl-style__row">
          <span>Opacité</span>
          <span className="atl-style__px">
            <input type="number" min="0" max="100" value={get("opacity") === "" ? "" : Math.round(parseFloat(get("opacity")) * 100)} placeholder="100" onChange={(e) => set({ opacity: e.target.value === "" ? "" : String(Math.max(0, Math.min(100, Number(e.target.value))) / 100) })} />%
          </span>
        </label>
      </Part>

      <label className="atl-style__toggle">
        <input type="checkbox" checked={hidden} onChange={(e) => set({ display: e.target.checked ? "none" : "" })} /> Masquer {device === "all" ? "partout" : `en ${deviceName}`}
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
    </div>
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
