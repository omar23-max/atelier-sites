import { Liquid } from "liquidjs";

// Moteur Liquid de l'aperçu. Il imite juste assez Shopify pour que le même
// template.liquid s'affiche dans l'atelier, dans l'export HTML et dans la
// boutique. Utilisé à la fois dans le navigateur et par les scripts Node.
const engine = new Liquid({ strictFilters: false, strictVariables: false });

// Dans l'atelier une image est une URL ; dans Shopify c'est un objet image.
engine.registerFilter("image_url", (value) => {
  if (!value) return "";
  return typeof value === "string" ? value : value.src ?? "";
});

// Shopify stocke les prix en centimes.
engine.registerFilter("money", (cents) => {
  const amount = Number(cents ?? 0) / 100;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
});

// {% form 'customer' %} … {% endform %} : dans Shopify, la balise génère le
// formulaire d'inscription. Ici on produit un <form> inerte équivalent.
engine.registerTag("form", {
  parse(token, remainTokens) {
    this.formType = token.args.trim().split(/[\s,]+/)[0].replace(/['"]/g, "");
    this.templates = [];
    const stream = this.liquid.parser
      .parseStream(remainTokens)
      .on("tag:endform", () => stream.stop())
      .on("template", (tpl) => this.templates.push(tpl))
      .on("end", () => {
        throw new Error("tag {% form %} non fermé");
      });
    stream.start();
  },
  *render(ctx, emitter) {
    emitter.write(`<form class="atl-form" data-form="${this.formType}" onsubmit="return false">`);
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    emitter.write("</form>");
  },
});

const parsed = new Map();

function parse(template) {
  let tpl = parsed.get(template);
  if (!tpl) {
    tpl = engine.parse(template);
    parsed.set(template, tpl);
  }
  return tpl;
}

export function renderLiquid(template, context) {
  try {
    return engine.renderSync(parse(template), context);
  } catch (error) {
    const message = String(error?.message ?? error).replace(/</g, "&lt;");
    return `<pre style="padding:16px;background:#fee;color:#900;white-space:pre-wrap">Erreur Liquid : ${message}</pre>`;
  }
}
