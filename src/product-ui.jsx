import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";

// Produit Shopify : choisir un produit de la boutique (copie locale
// shopify/produits.json, tenue à jour par Claude), puis remplir la fiche :
// galerie, prix, et packs (une variante = un pack).

const gidNumber = (gid) => String(gid ?? "").split("/").pop();
const money = (v) => (v == null || v === "" ? "" : `$${Number(v).toFixed(2)}`);

function fillFromProduct(props, product, { gallery, packs, title }) {
  const next = { ...props, product: product.handle };
  if (title) next.title = product.title;
  if (gallery) {
    const images = product.images.length ? product.images : product.image ? [{ url: product.image }] : [];
    next.blocks_image = images.slice(0, 8).map((img, i) => ({ ...(props.blocks_image?.[i] ?? {}), image: img.url, alt: img.alt || product.title }));
  }
  if (packs && product.variants.length > 1) {
    next.blocks_pack = product.variants.map((v, i) => ({
      ...(props.blocks_pack?.[i] ?? {}),
      title: v.title,
      quantity: 1,
      variant_id: gidNumber(v.id),
      price: money(v.price),
      compare_price: money(v.compareAtPrice),
      image: v.image || product.image || "",
    }));
  } else if (packs && product.variants[0]) {
    // Une seule variante : les packs gardent leurs quantités, au prix du produit.
    const v = product.variants[0];
    next.blocks_pack = (props.blocks_pack ?? []).map((b) => ({
      ...b,
      variant_id: gidNumber(v.id),
      price: money(Number(v.price) * Number(b.quantity || 1)),
      compare_price: v.compareAtPrice ? money(Number(v.compareAtPrice) * Number(b.quantity || 1)) : b.compare_price,
    }));
  }
  return next;
}

const loadCatalog = () => fetch("/api/shopify/products").then((r) => r.json());

function ProductDialog({ current, onPick, onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null);
  const [opts, setOpts] = useState({ gallery: true, packs: true, title: false });
  useEffect(() => {
    loadCatalog()
      .then((c) => {
        setCatalog(c);
        setChosen(c.produits?.find((p) => p.handle === current) ?? null);
      })
      .catch(() => setCatalog({ produits: [] }));
  }, [current]);
  const list = (catalog?.produits ?? []).filter((p) => !query || p.title.toLowerCase().includes(query.toLowerCase()));

  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage atl-studio">
        <header className="atl-modal__head">
          <h2>Choisir un produit Shopify</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-newpage__body">
          {!catalog ? (
            <p>Chargement…</p>
          ) : (
            <>
              <p className="atl-newpage__hint" style={{ margin: 0 }}>
                Boutique <b>{catalog.boutique ?? "?"}</b> · copie du{" "}
                {catalog.misAJourLe ? new Date(catalog.misAJourLe).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}. Pour
                la mettre à jour, dis à Claude « synchronise les produits Shopify ».
              </p>
              {catalog.produits?.length ? (
                <>
                  <input className="atl-f__input" placeholder="Rechercher un produit…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <div className="atl-products">
                    {list.map((p) => (
                      <button type="button" key={p.id} className={chosen?.id === p.id ? "is-on" : ""} onClick={() => setChosen(p)}>
                        {p.image ? <img src={p.image} alt="" /> : <span className="atl-products__noimg">Sans image</span>}
                        <b>{p.title}</b>
                        <small>
                          {p.variants.length} variante(s) · {money(p.variants[0]?.price)}
                          {p.status && p.status !== "ACTIVE" ? ` · ${p.status === "DRAFT" ? "brouillon" : p.status.toLowerCase()}` : ""}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="atl-products__empty">
                  Ta boutique n'a encore aucun produit. Crée-le dans Shopify (Produits → Ajouter un produit ; mets les packs en variantes,
                  par ex. « Buy 1 », « Buy 2 Get 1 Free »…), puis dis à Claude « synchronise les produits Shopify ».
                </div>
              )}
              {chosen && (
                <fieldset className="atl-products__opts">
                  <legend>Remplir la fiche avec « {chosen.title} »</legend>
                  {[
                    ["gallery", `Galerie : les ${chosen.images.length || (chosen.image ? 1 : 0)} image(s) du produit`],
                    [
                      "packs",
                      chosen.variants.length > 1
                        ? `Packs : un par variante (${chosen.variants.map((v) => v.title).join(", ")}), avec leur prix`
                        : "Packs : prix du produit × quantité de chaque pack",
                    ],
                    ["title", "Nom du produit (remplace le titre de la section)"],
                  ].map(([k, label]) => (
                    <label key={k}>
                      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
        </div>
        <footer className="atl-newpage__foot">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={!chosen} onClick={() => onPick(chosen, opts)}>
            Utiliser ce produit
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function ProductSetting({ field, value, onChange }) {
  const getPuck = useGetPuck();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!value) return setInfo(null);
    loadCatalog()
      .then((c) => setInfo(c.produits?.find((p) => p.handle === value) ?? { title: value, missing: true }))
      .catch(() => {});
  }, [value]);

  // Remplit toute la section (produit, galerie, packs) en une fois.
  function pick(product, opts) {
    setOpen(false);
    const { selectedItem, getSelectorForId, dispatch } = getPuck();
    const selector = selectedItem ? getSelectorForId(selectedItem.props.id) : null;
    if (!selector) return onChange(product.handle);
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...selectedItem, props: fillFromProduct(selectedItem.props, product, opts) },
    });
  }

  return (
    <div className="atl-f">
      <span className="atl-f__label">
        <span>{field.label}</span>
      </span>
      <div className="atl-product">
        {value ? (
          <>
            {info?.image ? <img src={info.image} alt="" /> : <span className="atl-products__noimg">?</span>}
            <span>
              <b>{info?.title ?? value}</b>
              <small>{info?.missing ? "Introuvable dans la copie de la boutique" : `${info?.variants?.length ?? 0} variante(s)`}</small>
            </span>
          </>
        ) : (
          <span className="atl-f__info">Aucun : la section utilise le produit de la page produit Shopify.</span>
        )}
      </div>
      <div className="atl-product__actions">
        <button type="button" className="atl-img__btn" onClick={() => setOpen(true)}>
          {value ? "Changer de produit" : "Choisir un produit"}
        </button>
        {value && (
          <button type="button" className="atl-img__btn" onClick={() => onChange("")}>
            Retirer
          </button>
        )}
      </div>
      {field.info && <span className="atl-f__info">{field.info}</span>}
      {open && <ProductDialog current={value} onPick={pick} onClose={() => setOpen(false)} />}
    </div>
  );
}
