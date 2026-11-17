// Galerie du bloc d'achat (« Buy box », 2026-11-16) : cliquer une vignette
// met cette image en grand, et l'image principale devient un carrousel
// (flèches ‹ ›, glisser du doigt). Les sites importés le faisaient avec leur
// propre JavaScript, perdu à la copie.
//
// Repérage dans chaque section marquée data-atl-galerie (render.js, famille
// « fiche-produit ») : l'image principale = la plus grande image visible ;
// les vignettes = au moins deux petites images regroupées dans un même bloc
// qui ne contient pas l'image principale.
//
// Les clics sont repérés par la géométrie (comme les emplacements de
// l'atelier) : dans l'aperçu, Puck coupe les clics des éléments ; sur la page
// publiée, cela marche de la même façon. Fonction écrite pour être recopiée
// telle quelle dans un <script> (pas d'import, pas de syntaxe récente).
export function atlGaleries(doc) {
  var win = doc.defaultView;
  if (!win) return;
  var gals = [];

  function area(el) {
    var r = el.getBoundingClientRect();
    return r.width * r.height;
  }
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && win.getComputedStyle(el).visibility !== "hidden";
  }
  function srcOf(img) {
    return img.currentSrc || img.getAttribute("src") || "";
  }
  function show(g, i) {
    var n = g.thumbs.length;
    i = ((i % n) + n) % n;
    g.index = i;
    var t = g.thumbs[i];
    // Image principale déjà en carrousel (copié du site, avec ses flèches) :
    // la vignette N fait défiler le carrousel jusqu'à la diapo N.
    if (g.track) {
      var slides = g.slides;
      var s = slides[Math.min(i, slides.length - 1)];
      if (s) g.track.scrollTo({ left: s.offsetLeft - slides[0].offsetLeft, behavior: "smooth" });
      outline(g, i);
      return;
    }
    var src = srcOf(t);
    if (!src) return;
    var pic = g.main.parentElement && g.main.parentElement.tagName === "PICTURE" ? g.main.parentElement : null;
    if (pic)
      [].forEach.call(pic.querySelectorAll("source"), function (s) {
        s.setAttribute("srcset", src);
      });
    g.main.removeAttribute("srcset");
    g.main.setAttribute("src", src);
    outline(g, i);
  }
  function outline(g, i) {
    g.thumbs.forEach(function (x, j) {
      x.style.setProperty("outline", j === i ? "2px solid currentColor" : "", j === i ? "important" : "");
      x.style.setProperty("outline-offset", j === i ? "2px" : "");
      x.style.setProperty("opacity", j === i ? "1" : "");
    });
  }

  function setup(root) {
    var imgs = [].filter.call(root.querySelectorAll("img"), visible);
    if (imgs.length < 2) return;
    var main = imgs.reduce(function (a, b) {
      return area(b) > area(a) ? b : a;
    });
    var big = area(main);
    if (big < 40000) return;
    // Vignettes : aussi les emplacements encore vides (image cachée en
    // attendant ta photo) tant qu'ils occupent leur place dans la bande.
    var placed = [].filter.call(root.querySelectorAll("img"), function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    });
    var small = placed.filter(function (x) {
      var a = area(x);
      return x !== main && a <= big / 4 && a >= 900;
    });
    if (small.length < 2) return;
    // Carrousel de l'image principale (copié du site), s'il y en a un.
    var track = main.closest('[data-atl-car="track"]');
    if (track && !root.contains(track)) track = null;
    var slides = null;
    if (track) {
      var host = track.children.length === 1 && track.firstElementChild.children.length > 1 ? track.firstElementChild : track;
      slides = [].filter.call(host.children, function (c) {
        return win.getComputedStyle(c).display !== "none" && !c.hasAttribute("data-atl-car-ui");
      });
    }
    // Groupes de vignettes : des images de tailles proches (avatars d'avis,
    // icônes de packs exclus), réunies dans un bloc qui ne contient pas
    // l'image principale. On préfère le groupe qui compte autant d'images que
    // le carrousel, puis le plus proche de l'image principale, puis le plus grand.
    var similar = function (a, b) {
      var x = area(a), y = area(b);
      return Math.max(x, y) <= 2.5 * Math.min(x, y);
    };
    var mr = main.getBoundingClientRect();
    var best = null, bestScore = -Infinity;
    small.forEach(function (x) {
      for (var p = x.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        if (p.contains(main)) break;
        var set = small.filter(function (y) {
          return p.contains(y) && similar(x, y);
        });
        if (set.length < 2) continue;
        var r = p.getBoundingClientRect();
        var dist = Math.max(0, r.top - mr.bottom, mr.top - r.bottom) + Math.max(0, r.left - mr.right, mr.left - r.right);
        var score = set.length - dist / 50 + (slides && set.length === slides.length ? 100 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { box: p, set: set };
        }
      }
    });
    if (!best) return;
    var thumbs = best.set;
    best = best.box;
    var g = { main: main, thumbs: thumbs, index: 0 };
    if (track) {
      g.track = track;
      g.slides = slides;
      gals.push(g); // ses propres flèches suffisent
      return;
    }
    // L'image principale montre-t-elle déjà une des vignettes ?
    var cur = srcOf(main);
    thumbs.forEach(function (t, i) {
      if (srcOf(t) === cur) g.index = i;
    });
    // Flèches sur l'image principale (une seule fois par image).
    var holder = main.parentElement && main.parentElement.tagName === "PICTURE" ? main.parentElement.parentElement : main.parentElement;
    // Flèches du site déjà présentes autour de l'image (carrousel non repéré) : pas de doublon.
    var near = holder && (holder.parentElement && holder.parentElement.parentElement ? holder.parentElement.parentElement : holder);
    var siteArrows = near && [].some.call(near.querySelectorAll("button, a, [role=button], [class*=arrow], [class*=prev], [class*=next]"), function (b) {
      return !b.hasAttribute("data-atl-gal-ui") && !best.contains(b) && /prev|next|arrow|précédent|suivant|slide/i.test((b.className && b.className.baseVal !== undefined ? b.className.baseVal : b.className) + " " + (b.getAttribute("aria-label") || ""));
    });
    if (holder && !siteArrows && !holder.querySelector("[data-atl-gal-ui]")) {
      if (win.getComputedStyle(holder).position === "static") holder.style.position = "relative";
      ["prev", "next"].forEach(function (dir) {
        var b = doc.createElement("span");
        b.setAttribute("data-atl-gal-ui", dir);
        b.setAttribute("aria-hidden", "true");
        b.textContent = dir === "prev" ? "‹" : "›";
        b.style.cssText =
          "position:absolute;top:50%;" + (dir === "prev" ? "left:8px" : "right:8px") +
          ";transform:translateY(-50%);width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.85);color:#111;display:flex;align-items:center;justify-content:center;font:600 22px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2);z-index:5;cursor:pointer;user-select:none";
        holder.appendChild(b);
      });
    }
    g.prev = holder && holder.querySelector('[data-atl-gal-ui="prev"]');
    g.next = holder && holder.querySelector('[data-atl-gal-ui="next"]');
    gals.push(g);
  }

  [].forEach.call(doc.querySelectorAll("[data-atl-galerie]"), setup);
  doc.__atlGals = gals;

  function inside(el, x, y) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  if (!doc.__atlGalClick) {
    doc.__atlGalClick = true;
    doc.addEventListener(
      "click",
      function (e) {
        var x = e.clientX, y = e.clientY;
        (doc.__atlGals || []).forEach(function (g) {
          if (inside(g.prev, x, y)) {
            e.preventDefault();
            e.stopPropagation();
            return show(g, g.index - 1);
          }
          if (inside(g.next, x, y)) {
            e.preventDefault();
            e.stopPropagation();
            return show(g, g.index + 1);
          }
          g.thumbs.forEach(function (t, i) {
            // Vignette : on montre l'image ; dans l'atelier, l'élément reste aussi choisi.
            if (inside(t, x, y)) {
              e.preventDefault();
              show(g, i);
            }
          });
        });
      },
      true,
    );
    // Glisser du doigt sur l'image principale.
    var start = null;
    doc.addEventListener(
      "touchstart",
      function (e) {
        var t = e.touches[0];
        start = t ? { x: t.clientX, y: t.clientY } : null;
      },
      { passive: true },
    );
    doc.addEventListener(
      "touchend",
      function (e) {
        var t = e.changedTouches[0];
        if (!start || !t) return;
        var dx = t.clientX - start.x;
        (doc.__atlGals || []).forEach(function (g) {
          if (Math.abs(dx) > 40 && inside(g.main, start.x, start.y)) show(g, g.index + (dx < 0 ? 1 : -1));
        });
        start = null;
      },
      { passive: true },
    );
  }
}

export const GALERIE_SCRIPT = `<script>(function(){var f=${atlGaleries.toString()};function go(){setTimeout(function(){f(document)},0)}if(document.readyState==="complete")go();else addEventListener("load",go)})()</script>`;
