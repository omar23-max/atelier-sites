// Carrousels (sliders) des sections copiées : la piste qui défile porte
// data-atl-car="track" (kimi-import.mjs, copie.mjs, sections refaites par
// l'IA). Réglage atl_carrousel d'une section, posé dans le panneau de droite :
//   { nav, auto, pause, boucle, visibles, visiblesM, nombre }
//   nav       « origine » (flèches et points du site, s'il y en a), « fleches »,
//             « points », « les-deux », « aucune » (au doigt seulement) ;
//   auto      secondes entre deux diapos (0 : pas de défilement automatique) ;
//   pause     le défilement automatique s'arrête au survol / au toucher ;
//   boucle    après la dernière diapo, retour à la première ;
//   visibles  diapos visibles à la fois sur ordinateur (0 : comme à l'origine) ;
//   visiblesM idem sur mobile ;
//   nombre    nombre de diapos montrées (0 : toutes).
// Le même code tourne dans l'aperçu de l'atelier (puck-config.jsx), sur la
// page publiée (script posé par render.js) et sur Shopify (shopify.js).

export const CAR_DEFAULTS = { nav: "origine", auto: 0, pause: true, boucle: true, visibles: 0, visiblesM: 0, nombre: 0 };

// Le template a-t-il une piste marquée ? (Vérifiée ensuite dans la page : un
// conteneur d'étoiles marqué à tort n'est pas un carrousel.)
export const hasCarrouselTrack = (section) => section.template.includes('data-atl-car="track"');

// Carrousel du site d'origine que l'import n'a pas su rendre réglable
// (diapo figée, bibliothèque Swiper/Slick…) : proposé à l'IA.
export const looksLikeCarrousel = (section) => /swiper|slick|splide|flickity|glide__|carousel|carrousel|slider|slideshow|embla/i.test(section.template);

// Attribut posé sur le cadre de la section ; null sans réglage.
// force : la section a une piste, le carrousel est actif même sans réglage
// (flèches du site branchées, défilement par diapo ; 2026-11-07).
export function carrouselAttr(value, force = false) {
  if (!value || typeof value !== "object") {
    if (!force) return null;
    value = {};
  }
  const o = { ...CAR_DEFAULTS, ...value };
  if (!force && JSON.stringify(o) === JSON.stringify(CAR_DEFAULTS)) return null;
  return JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Moteur, sans dépendance : appelé tel quel dans l'atelier, et recopié en
// texte dans un <script> sur la page publiée. Une section déjà réglée est
// ignorée (root.__atlCar) ; l'aperçu remplace le HTML à chaque modification,
// la nouvelle version est réglée au passage suivant.
export function atlCarrousels(doc, inspect) {
  var win = doc.defaultView;
  // Diapos d'une piste : ses enfants, ou ceux de son unique enfant (Swiper :
  // piste > wrapper > diapos). Une piste « réelle » a au moins deux diapos
  // côte à côte.
  function slidesOf(t) {
    var host = t.children.length === 1 && t.firstElementChild.children.length > 1 ? t.firstElementChild : t;
    var list = [].filter.call(host.children, function (c) {
      return !c.hasAttribute("data-atl-car-ui") && c.tagName !== "STYLE" && c.tagName !== "SCRIPT" && (c.hasAttribute("data-atl-car-off") || win.getComputedStyle(c).display !== "none");
    });
    return { host: host, list: list };
  }
  function isReal(t) {
    var s = slidesOf(t).list.filter(function (c) {
      return !c.hasAttribute("data-atl-car-off");
    });
    // Une seule diapo montrée (réglage « nombre ») : la piste reste un carrousel.
    if (s.length === 1 && slidesOf(t).list.length > 1) return true;
    if (s.length < 2) return false;
    var a = s[0].getBoundingClientRect(), b = s[1].getBoundingClientRect();
    return b.left > a.left + 10 && Math.abs(b.top - a.top) < 40;
  }
  function tracksIn(root) {
    return [].filter.call(root.querySelectorAll('[data-atl-car="track"]'), function (t) {
      return !(t.parentElement && t.parentElement.closest('[data-atl-car="track"]')) && isReal(t);
    });
  }
  // Panneau de droite : les carrousels réels d'une section et leur nombre de diapos.
  if (inspect)
    return tracksIn(inspect).map(function (t) {
      return { track: t, count: slidesOf(t).list.length };
    });

  // Les styles copiés du site sont souvent en !important.
  function imp(el, prop, value) {
    el.style.setProperty(prop, value, "important");
  }

  function setup(root, t, o) {
    var s = slidesOf(t), host = s.host, slides = s.list;
    if (o.nombre > 0)
      slides.forEach(function (el, i) {
        if (i >= o.nombre) {
          el.setAttribute("data-atl-car-off", "");
          imp(el, "display", "none");
        }
      });
    slides = slides.slice(0, o.nombre > 0 ? o.nombre : slides.length);
    imp(t, "overflow-x", "auto");
    // La piste garde la largeur de la section : sans ça, dans une colonne
    // flex ou grid, elle s'élargirait à la taille de toutes ses diapos.
    for (var x = t; x && x !== root; x = x.parentElement) imp(x, "min-width", "0");
    imp(t, "max-width", "100%");
    // Piste marquée plus large que la fenêtre qui la découpe (galerie produit
    // Replo : bande de diapos dans une colonne étroite) : la piste et ses
    // parents prennent la largeur de cette fenêtre, et c'est la piste qui défile.
    // Refait à chaque changement de taille (l'aperçu de l'atelier se met en place après).
    function fit() {
      for (var y = t.parentElement; y && y !== root; y = y.parentElement)
        if (y.clientWidth && y.clientWidth < t.clientWidth - 2) {
          for (var z = t; z !== y; z = z.parentElement) {
            imp(z, "width", "100%");
            imp(z, "max-width", "100%");
          }
          return;
        }
    }
    fit();
    imp(t, "scroll-snap-type", "x mandatory");
    imp(t, "scrollbar-width", "none");
    slides.forEach(function (el) {
      imp(el, "scroll-snap-align", "start");
    });

    // Diapos visibles à la fois : largeur calculée sur la piste, refaite au redimensionnement.
    // Styles d'origine, remis quand l'écran repasse sur « comme le site ».
    var saved = [host].concat(slides).map(function (el) {
      return el.style.cssText;
    });
    function layout() {
      var v = win.innerWidth < 750 ? o.visiblesM : o.visibles;
      if (!(v > 0)) {
        [host].concat(slides).forEach(function (el, i) {
          el.style.cssText = saved[i];
          if (i > 0) imp(el, "scroll-snap-align", "start");
          if (el.hasAttribute("data-atl-car-off")) imp(el, "display", "none");
        });
        return;
      }
      var gap = parseFloat(win.getComputedStyle(host).columnGap) || 0;
      var w = (t.clientWidth - gap * (v - 1)) / v;
      imp(host, "display", "flex");
      imp(host, "flex-wrap", "nowrap");
      if (host !== t) imp(host, "width", "auto");
      slides.forEach(function (el) {
        imp(el, "flex", "0 0 " + w + "px");
        imp(el, "width", w + "px");
        imp(el, "max-width", w + "px");
        imp(el, "min-width", "0");
      });
    }
    layout();

    // Positions d'arrêt : le début de chaque diapo, sans dépasser la fin.
    function stops() {
      var max = t.scrollWidth - t.clientWidth, left = t.getBoundingClientRect().left, out = [];
      slides.forEach(function (el) {
        var x = Math.max(0, Math.min(max, t.scrollLeft + el.getBoundingClientRect().left - left));
        if (!out.length || x - out[out.length - 1] > 2) out.push(x);
      });
      return out;
    }
    function current() {
      var st = stops(), best = 0;
      st.forEach(function (x, i) {
        if (Math.abs(x - t.scrollLeft) < Math.abs(st[best] - t.scrollLeft)) best = i;
      });
      return best;
    }
    function go(i) {
      var st = stops();
      if (!st.length) return;
      if (i >= st.length) i = o.boucle ? 0 : st.length - 1;
      if (i < 0) i = o.boucle ? st.length - 1 : 0;
      t.scrollTo({ left: st[i], behavior: "smooth" });
    }

    var box = t.parentElement;
    if (win.getComputedStyle(box).position === "static") box.style.position = "relative";
    // Flèches et points du site : cachés si l'on choisit autre chose.
    var own = root.querySelectorAll('[data-atl-car="prev"],[data-atl-car="next"]');
    if (o.nav !== "origine")
      [].forEach.call(own, function (b) {
        imp(b, "display", "none");
      });
    // Flèches du site : branchées sur la piste la plus proche (aperçu de
    // l'atelier, catalogue et page publiée).
    if (o.nav === "origine")
      [].forEach.call(own, function (b) {
        if (b.__atlCarBound) return;
        var p = b, near = null;
        for (var k = 0; k < 8 && p && !near; k++) {
          p = p.parentElement;
          near = p && p.querySelector('[data-atl-car="track"]');
        }
        if (near !== t) return;
        b.__atlCarBound = 1;
        b.style.cursor = "pointer";
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          go(current() + (b.getAttribute("data-atl-car") === "prev" ? -1 : 1));
          restart();
        });
      });
    if (o.nav === "fleches" || o.nav === "les-deux") {
      [-1, 1].forEach(function (dir) {
        var b = doc.createElement("button");
        b.type = "button";
        b.setAttribute("data-atl-car-ui", "fleche");
        b.setAttribute("aria-label", dir < 0 ? "Précédent" : "Suivant");
        b.textContent = dir < 0 ? "‹" : "›";
        b.style.cssText =
          "position:absolute;top:50%;" + (dir < 0 ? "left:8px" : "right:8px") +
          ";transform:translateY(-50%);z-index:5;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.92);color:#111;font:28px/1 sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18);display:grid;place-items:center;padding:0 0 3px";
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          go(current() + dir);
          restart();
        });
        box.appendChild(b);
      });
    }
    var dots = null;
    if (o.nav === "points" || o.nav === "les-deux") {
      dots = doc.createElement("div");
      dots.setAttribute("data-atl-car-ui", "points");
      dots.style.cssText = "display:flex;justify-content:center;gap:8px;padding:14px 0 4px";
      box.insertBefore(dots, t.nextSibling);
      var paint = function () {
        var n = stops().length, c = current();
        if (dots.children.length !== n) {
          dots.innerHTML = "";
          for (var i = 0; i < n; i++)
            (function (i) {
              var d = doc.createElement("button");
              d.type = "button";
              d.setAttribute("aria-label", "Diapo " + (i + 1));
              d.style.cssText = "width:9px;height:9px;padding:0;border:0;border-radius:50%;cursor:pointer;transition:background .2s,transform .2s";
              d.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                go(i);
                restart();
              });
              dots.appendChild(d);
            })(i);
        }
        [].forEach.call(dots.children, function (d, i) {
          d.style.background = i === c ? "#111" : "rgba(0,0,0,.25)";
          d.style.transform = i === c ? "scale(1.25)" : "none";
        });
      };
      var raf = 0;
      t.addEventListener("scroll", function () {
        if (!raf) raf = win.requestAnimationFrame(function () { raf = 0; paint(); });
      }, { passive: true });
      paint();
    }

    // Défilement automatique.
    var timer = 0, paused = false;
    function restart() {
      if (timer) win.clearInterval(timer);
      timer = 0;
      if (!(o.auto > 0)) return;
      timer = win.setInterval(function () {
        if (!root.isConnected) return win.clearInterval(timer);
        if (paused || doc.hidden) return;
        var st = stops(), c = current();
        if (c >= st.length - 1 && !o.boucle) return;
        go(c + 1);
      }, o.auto * 1000);
    }
    if (o.pause) {
      box.addEventListener("mouseenter", function () { paused = true; });
      box.addEventListener("mouseleave", function () { paused = false; });
      t.addEventListener("touchstart", function () { paused = true; }, { passive: true });
      t.addEventListener("touchend", function () { win.setTimeout(function () { paused = false; }, 3000); }, { passive: true });
    }
    restart();
    // La piste change de taille (fenêtre, aperçu de l'atelier encore en
    // train de se mettre en place) : largeurs et points refaits.
    var last = "";
    var resized = function () {
      var key = t.clientWidth + "|" + root.clientWidth + "|" + (win.innerWidth < 750);
      if (!root.isConnected || key === last) return;
      last = key;
      fit();
      layout();
      if (dots) paint();
    };
    if (win.ResizeObserver) {
      var ro = new win.ResizeObserver(resized);
      ro.observe(t);
      ro.observe(root);
    }
    win.addEventListener("resize", resized);
    resized();
  }

  [].forEach.call(doc.querySelectorAll("[data-atl-carrousel]"), function (root) {
    if (root.__atlCar) return;
    root.__atlCar = 1;
    var o = {};
    try {
      o = JSON.parse(root.getAttribute("data-atl-carrousel"));
    } catch (e) {}
    tracksIn(root).forEach(function (t) {
      setup(root, t, o);
    });
  });
}

// Script de la page publiée (une copie par section réglée ; il ne règle que
// les carrousels pas encore réglés). Lancé une fois la page chargée : les
// rangées coupées entre sections (STICKY de copie.mjs) sont alors recollées.
export const CARROUSEL_SCRIPT = `<script>(function(){var f=${atlCarrousels.toString()};function go(){setTimeout(function(){f(document)},0)}if(document.readyState==="complete")go();else addEventListener("load",go)})()</script>`;
