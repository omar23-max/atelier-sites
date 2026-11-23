"""Cadres d'image vides des sections Whitelabeler (<div data-wld-img ...></div>)
-> vrais emplacements d'image (data-atl-slot), comme les autres images de l'atelier.
Usage : python3 wl-images.py [section ...]   (sans argument : toutes les wl-*)
Met à jour template.liquid, schema.json (presets), meta.json (arbre) et les pages
qui utilisent ces sections (blocks_element). Sauvegarde à faire avant (tar)."""
import json, os, re, sys, glob

ROOT = "/home/ubuntu/atelier-sites/"
DIV = re.compile(r'<div((?:\s+[\w-]+="[^"]*")*?\s+data-wld-img=""(?:\s+[\w-]+="[^"]*")*)\s*></div>')


def placeholders(css):
    out = {}
    for m in re.finditer(r'\.([\w-]+)::after\s*\{\s*content:\s*"(\[[^"]*\])"', css):
        out[m.group(1)] = m.group(2)
    return out


def convert(sec):
    d = ROOT + "sections/" + sec + "/"
    tpl = open(d + "template.liquid", encoding="utf8").read()
    if "section.blocks" not in tpl or "data-wld-img" not in tpl:
        return []
    css = open(d + "style.css", encoding="utf8").read() if os.path.exists(d + "style.css") else ""
    ph = placeholders(css)
    added = []
    n = [0]

    def rep(m):
        attrs = m.group(1)
        cls = re.search(r'class="([^"]*)"', attrs)
        cls = cls.group(1) if cls else ""
        other = re.sub(r'\s+class="[^"]*"', "", attrs).replace(' data-wld-img=""', "")
        n[0] += 1
        slot = f"iw{n[0]}"
        while slot in tpl:
            n[0] += 1
            slot = f"iw{n[0]}"
        label = next((ph[c] for c in cls.split() if c in ph), "[ Image ]")
        added.append((slot, label))
        return (
            "{%- for b in section.blocks -%}{%- if b.settings.slot == '" + slot + "' -%}"
            "{%- if b.settings.image != blank -%}"
            f'<img data-atl-slot="{slot}"{other} class="{cls}" src="{{{{ b.settings.image | image_url: width: 1200 }}}}" alt="{{{{ b.settings.text | escape }}}}" style="object-fit:cover;display:block;{{{{ b.settings.style }}}}">'
            "{%- else -%}"
            f'<div data-atl-slot="{slot}" data-wld-img=""{other} class="{cls} atl-vide" style="{{{{ b.settings.style }}}}"></div>'
            "{%- endif -%}{%- endif -%}{%- endfor -%}"
        )

    new = DIV.sub(rep, tpl)
    if not added:
        return []
    open(d + "template.liquid", "w", encoding="utf8").write(new)

    blocks = [{"repere": f"Image · {lab[:40]}", "slot": s, "text": lab, "image": "", "link": "", "style": ""} for s, lab in added]
    sc = json.load(open(d + "schema.json", encoding="utf8"))
    for pr in sc.get("presets", []):
        pr.setdefault("blocks", []).extend({"type": "element", "settings": dict(b)} for b in blocks)
    json.dump(sc, open(d + "schema.json", "w", encoding="utf8"), ensure_ascii=False, indent=2)

    mp = d + "meta.json"
    if os.path.exists(mp):
        me = json.load(open(mp, encoding="utf8"))
        a = me.get("arbre")
        if isinstance(a, dict):
            a.setdefault("children", []).extend({"slot": s, "type": "image", "name": "Image", "k": 900 + i} for i, (s, _) in enumerate(added))
            json.dump(me, open(mp, "w", encoding="utf8"), ensure_ascii=False, indent=2)
    return blocks


def main():
    secs = sys.argv[1:] or sorted(os.path.basename(p) for p in glob.glob(ROOT + "sections/wl-*"))
    done = {}
    for s in secs:
        b = convert(s)
        if b:
            done[s] = b
    pages_upd = 0
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
            json.dump(pg, open(pf, "w", encoding="utf8"), ensure_ascii=False, indent=2)
            pages_upd += 1
    print(json.dumps({"sections": len(done), "cadres": sum(len(v) for v in done.values()), "pages": pages_upd}))


main()
