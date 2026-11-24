"""Sections Whitelabeler, suite de cadres-image-wl.py (2026-11-24).
1) Cadres d'image QUI CONTIENNENT déjà quelque chose (<div data-wld-img ...>…</div>,
   ex. une étiquette « Pure amla… » posée sur la photo) : on ajoute dedans une
   image de fond (slot iwN, type image), sous le contenu existant.
2) Icônes en symbole texte (♥ ☁ ✦ dans une pastille, classe *icon*) : le slot
   accepte aussi une image (affichée à la place du symbole) ; type image dans l'arbre.
Met à jour template.liquid, style.css, schema.json, meta.json et les pages.
Usage : python3 cadres-pleins-wl.py [section ...]   (sans argument : toutes les wl-*)"""
import json, os, re, sys, glob

ROOT = "/home/ubuntu/atelier-sites/"
OUVRE = re.compile(r'<div((?:\s+[\w-]+="[^"]*")*?\s+data-wld-img=""(?:\s+[\w-]+="[^"]*")*)\s*>(?!</div>)')
ICONE = re.compile(r'(<(div|span|i|p)\s+class="([^"]*icon[^"]*)"\s+data-atl-slot="(s\d+)"[^>]*>)(\{%- for b in section\.blocks -%\}\{%- if b\.settings\.slot == \'\4\' -%\}\{\{ b\.settings\.text \| newline_to_br \}\}\{%- endif -%\}\{%- endfor -%\})')
CSS = """
/* Cadres photo avec contenu : image de fond sous le contenu (cadres-pleins-wl.py) */
.atl-wl-cadre { position: relative; isolation: isolate; }
.atl-wl-cadre > .atl-wl-fond { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1; margin: 0; padding: 0; border: 0; background: transparent; min-height: 0; }
.atl-wl-cadre:has(> img.atl-wl-fond)::after, .atl-wl-cadre:has(> img.atl-wl-fond)::before { content: none !important; }
/* Icônes : une image peut remplacer le symbole */
.atl-icone-img { width: 60%; height: 60%; object-fit: contain; display: block; margin: auto; }
"""


def placeholders(css):
    return {m.group(1): m.group(2) for m in re.finditer(r'\.([\w-]+)::after\s*\{\s*content:\s*"(\[[^"]*\])"', css)}


def noeuds(a):
    if isinstance(a, dict):
        yield a
        for c in a.get("children", []) or []:
            yield from noeuds(c)


def convert(sec):
    d = ROOT + "sections/" + sec + "/"
    tp = d + "template.liquid"
    if not os.path.exists(tp):
        return [], []
    tpl = open(tp, encoding="utf8").read()
    if "section.blocks" not in tpl:
        return [], []
    css = open(d + "style.css", encoding="utf8").read() if os.path.exists(d + "style.css") else ""
    ph = placeholders(css)
    added, icones = [], []
    n = [0]

    def rep(m):
        attrs = m.group(1)
        if "data-atl-slot" in attrs:
            return m.group(0)
        cls = re.search(r'class="([^"]*)"', attrs)
        c = cls.group(1) if cls else ""
        n[0] += 1
        slot = f"iw{n[0]}"
        while f'"{slot}"' in tpl or f"'{slot}'" in tpl:
            n[0] += 1
            slot = f"iw{n[0]}"
        label = next((ph[x] for x in c.split() if x in ph), "[ Image ]")
        added.append((slot, label))
        new_attrs = re.sub(r'class="([^"]*)"', lambda k: f'class="{k.group(1)} atl-wl-cadre"', attrs) if cls else attrs + ' class="atl-wl-cadre"'
        return (
            f"<div{new_attrs}>"
            "{%- for b in section.blocks -%}{%- if b.settings.slot == '" + slot + "' -%}"
            "{%- if b.settings.image != blank -%}"
            f'<img data-atl-slot="{slot}" class="atl-wl-fond" src="{{{{ b.settings.image | image_url: width: 1400 }}}}" alt="{{{{ b.settings.text | escape }}}}" style="{{{{ b.settings.style }}}}">'
            "{%- else -%}"
            f'<div data-atl-slot="{slot}" class="atl-wl-fond atl-vide" style="{{{{ b.settings.style }}}}"></div>'
            "{%- endif -%}{%- endif -%}{%- endfor -%}"
        )

    new = OUVRE.sub(rep, tpl)

    def rep_ic(m):
        icones.append(m.group(4))
        s = m.group(4)
        return m.group(1) + "{%- for b in section.blocks -%}{%- if b.settings.slot == '" + s + "' -%}{%- if b.settings.image != blank -%}<img class=\"atl-icone-img\" src=\"{{ b.settings.image | image_url: width: 200 }}\" alt=\"\">{%- else -%}{{ b.settings.text | newline_to_br }}{%- endif -%}{%- endif -%}{%- endfor -%}"

    new = ICONE.sub(rep_ic, new)
    if new == tpl:
        return [], []
    open(tp, "w", encoding="utf8").write(new)
    if "atl-wl-cadre {" not in css:
        open(d + "style.css", "a", encoding="utf8").write(CSS)

    blocks = [{"repere": f"Image · {lab[:40]}", "slot": s, "text": lab, "image": "", "link": "", "style": ""} for s, lab in added]
    sp = d + "schema.json"
    if blocks and os.path.exists(sp):
        sc = json.load(open(sp, encoding="utf8"))
        for pr in sc.get("presets", []):
            pr.setdefault("blocks", []).extend({"type": "element", "settings": dict(b)} for b in blocks)
        json.dump(sc, open(sp, "w", encoding="utf8"), ensure_ascii=True, indent=2)
    mp = d + "meta.json"
    if os.path.exists(mp):
        me = json.load(open(mp, encoding="utf8"))
        a = me.get("arbre")
        if isinstance(a, dict):
            for nd in noeuds(a):
                if nd.get("slot") in icones:
                    nd["type"] = "image"
                    nd["name"] = "Icône"
            a.setdefault("children", []).extend({"slot": s, "type": "image", "name": "Image", "k": 950 + i} for i, (s, _) in enumerate(added))
            json.dump(me, open(mp, "w", encoding="utf8"), ensure_ascii=True, indent=2)
    return blocks, icones


def main():
    secs = sys.argv[1:] or sorted(os.path.basename(p) for p in glob.glob(ROOT + "sections/wl-*"))
    done, nic = {}, 0
    for s in secs:
        b, ic = convert(s)
        nic += len(ic)
        if b:
            done[s] = b
    pages = 0
    for pf in glob.glob(ROOT + "pages/*.json"):
        raw = open(pf, encoding="utf8").read()
        if not any(s in raw for s in done):
            continue
        pg = json.loads(raw)
        ch = False
        for it in pg.get("content", []):
            b = done.get(it.get("type"))
            if not b:
                continue
            lst = it.setdefault("props", {}).setdefault("blocks_element", [])
            have = {x.get("slot") for x in lst}
            for x in b:
                if x["slot"] not in have:
                    lst.append(dict(x))
                    ch = True
        if ch:
            tmp = pf + ".tmp"
            json.dump(pg, open(tmp, "w", encoding="utf8"), ensure_ascii=True, indent=2)
            os.replace(tmp, pf)
            pages += 1
    print(json.dumps({"sections_cadres": len(done), "cadres": sum(len(v) for v in done.values()), "icones": nic, "pages": pages}))


main()
