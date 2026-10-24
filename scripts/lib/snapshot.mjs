// Relevé de la structure et des styles réels d'une page, pour en faire une copie
// modifiable au design identique (scripts/advertorial.mjs → lib/copie.mjs).
// Les fonctions marquées « dans la page » sont envoyées au navigateur par
// page.evaluate : elles ne doivent rien utiliser de l'extérieur.

export const PROPS = [
  "display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear", "box-sizing",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-transform", "text-decoration-line", "text-decoration-color", "text-indent", "white-space", "vertical-align",
  "opacity", "box-shadow", "text-shadow", "transform", "filter",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "align-self",
  "flex-grow", "flex-shrink", "flex-basis", "order", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows", "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end",
  "overflow-x", "overflow-y", "object-fit", "object-position", "list-style-type", "list-style-position", "visibility", "aspect-ratio",
];

export const INHERITED = new Set([
  "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-transform", "text-indent", "white-space", "visibility", "list-style-type", "list-style-position", "text-shadow",
]);

// Dans la page, à 1440 px : arbre des éléments, emplacements de texte et
// d'image, styles calculés et styles par défaut de chaque balise.
export function snapshotDesktop({ props, chromeSelector }) {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "BASE", "TITLE", "HEAD", "IFRAME-NONE"]);
  const INLINE = new Set(["inline", "inline-block", "inline-flex", "contents"]);
  const TRANSPARENT = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
  const clean = (t) => t.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const words = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0);
  const read = (el) => {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs.getPropertyValue(p);
    return o;
  };
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.ceil(r.width * 100) / 100, h: Math.ceil(r.height * 100) / 100 };
  };
  // Un élément « bloc » visuel : bouton, pastille… même s'il est en ligne.
  const looksBoxed = (el, cs) =>
    !TRANSPARENT(cs.backgroundColor) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) > 8;
  // Texte seul ou éléments en ligne sans bloc ni image : un seul emplacement de texte.
  const isTextLeaf = (el) => {
    if (!el.innerText || !el.innerText.trim()) return false;
    for (const c of el.querySelectorAll("*")) {
      const cs = getComputedStyle(c);
      if (cs.display === "none") continue;
      if (!INLINE.has(cs.display) && c.tagName !== "BR") return false;
      if (["IMG", "SVG", "svg", "VIDEO", "PICTURE", "CANVAS", "IFRAME", "INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(c.tagName)) {
        const r = c.getBoundingClientRect();
        if (c.tagName !== "svg" || r.width > 24) return false;
      }
      if (cs.display === "inline-block" && looksBoxed(c, cs)) return false;
    }
    return true;
  };

  // Mise en forme dans le texte (gras, italique, couleur, souligné, surligné,
  // taille) : gardée en <span style> simples, le reste du balisage est retiré.
  const escText = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function inlineHtml(root) {
    const walk = (node) =>
      [...node.childNodes]
        .map((c) => {
          if (c.nodeType === 3) return escText(c.textContent.replace(/\s+/g, " "));
          if (c.nodeType !== 1) return "";
          const cs = getComputedStyle(c);
          if (cs.display === "none") return "";
          if (c.tagName === "BR") return "<br>";
          const inner = walk(c);
          if (!inner.trim()) return inner;
          const p = getComputedStyle(c.parentElement);
          const st = [];
          if (cs.color !== p.color) st.push(`color:${cs.color}`);
          if (cs.fontWeight !== p.fontWeight) st.push(`font-weight:${cs.fontWeight}`);
          if (cs.fontStyle !== p.fontStyle) st.push(`font-style:${cs.fontStyle}`);
          if (cs.fontSize !== p.fontSize) st.push(`font-size:${cs.fontSize}`);
          if (cs.textDecorationLine !== "none" && cs.textDecorationLine !== p.textDecorationLine) st.push(`text-decoration:${cs.textDecorationLine}`);
          if (!TRANSPARENT(cs.backgroundColor)) st.push(`background-color:${cs.backgroundColor}`);
          if (cs.textTransform !== p.textTransform) st.push(`text-transform:${cs.textTransform}`);
          return st.length ? `<span style="${st.join(";")}">${inner}</span>` : inner;
        })
        .join("");
    return walk(root).replace(/\s*<br>\s*/g, "<br>").trim();
  }

  const nodes = [];
  let imageCount = 0;
  const markImage = (el, node) => {
    imageCount += 1;
    el.setAttribute("data-atl-img", String(imageCount));
    node.image = imageCount;
  };

  function visit(el, parent) {
    if (SKIP.has(el.tagName)) return;
    if (chromeSelector && el.matches(chromeSelector)) return;
    const id = nodes.length;
    el.setAttribute("data-atl-n", String(id));
    const tag = el.tagName.toLowerCase();
    const cs = getComputedStyle(el);
    const node = { id, parent, tag, style: read(el), box: boxOf(el), kids: [] };
    nodes.push(node);
    if (parent != null) nodes[parent].kids.push({ n: id });
    if (tag === "a") node.href = Boolean(el.getAttribute("href"));
    if (["input", "select", "textarea", "button"].includes(tag)) node.type = el.getAttribute("type") ?? "";
    const visible = cs.display !== "none" && node.box.w > 0 && node.box.h > 0;

    if (tag === "svg") {
      const html = el.outerHTML;
      if (node.box.w <= 64 && node.box.h <= 64 && html.length < 30000) node.svg = html;
      else if (visible) markImage(el, node);
      return;
    }
    if (["img", "video", "canvas", "iframe", "picture", "object", "embed"].includes(tag)) {
      if (visible) markImage(el, node);
      return;
    }
    if (cs.backgroundImage.includes("url(") && visible) {
      node.bgImage = true;
      if (!el.innerText.trim()) {
        markImage(el, node);
      } else {
        // Photo de fond sous du texte : on la découpe aussi (texte masqué).
        markImage(el, node);
      }
    }
    if (["input", "select", "textarea"].includes(tag)) return;
    if (isTextLeaf(el)) {
      const text = clean(el.innerText);
      node.text = text;
      node.words = words(text);
      const html = inlineHtml(el);
      if (/<(span|br)\b/.test(html)) node.html = html;
      return;
    }
    for (const c of el.childNodes) {
      if (c.nodeType === 1) visit(c, id);
      else if (c.nodeType === 3 && c.textContent.trim()) {
        const text = clean(c.textContent);
        node.kids.push({ text, words: words(text) });
      }
    }
  }
  visit(document.body, null);

  // Styles par défaut de chaque balise, dans une page vierge.
  const ifr = document.createElement("iframe");
  ifr.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  document.documentElement.appendChild(ifr);
  const idoc = ifr.contentDocument;
  idoc.open();
  idoc.write("<!doctype html><html><head></head><body></body></html>");
  idoc.close();
  const defaults = {};
  for (const tag of new Set(nodes.map((n) => n.tag))) {
    const e = idoc.createElementNS(tag === "svg" ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag);
    idoc.body.appendChild(e);
    const cs = ifr.contentWindow.getComputedStyle(e);
    defaults[tag] = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    e.remove();
  }
  ifr.remove();
  const html = getComputedStyle(document.documentElement).backgroundColor;
  return { nodes, defaults, htmlBackground: html, images: imageCount };
}

// Dans la page, à 390 px : les mêmes éléments, leurs styles en mobile.
export function snapshotMobile({ props }) {
  const out = {};
  for (const el of document.querySelectorAll("[data-atl-n]")) {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs.getPropertyValue(p);
    const r = el.getBoundingClientRect();
    o.__box = { w: Math.ceil(r.width * 100) / 100, h: Math.ceil(r.height * 100) / 100 };
    out[el.getAttribute("data-atl-n")] = o;
  }
  return out;
}
