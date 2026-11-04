# Note de ressemblance PWC (Perfect Web Clone) entre l'original et la copie,
# avec les outils de PWC (core.gates.fidelity : SSIM, 1 = identique).
# Lancé par scripts/verifier-import.mjs avec le Python de PWC :
#   C:/Users/HP/outils/pwc-venv/Scripts/python scripts/pwc-score.py <original.png> <copie.png>
# Écrit sur la sortie un JSON : note globale, seuil de PWC (0,97), les bandes
# horizontales les moins ressemblantes (en % de la hauteur de la page) et les
# hauteurs des deux pages.
import json
import sys

from PIL import Image
from core.gates.fidelity import score_report, worst_regions

ref, cand = sys.argv[1], sys.argv[2]
Image.MAX_IMAGE_PIXELS = None
rows = 20
report = score_report(ref, cand)
bands = worst_regions(ref, cand, rows=rows)
print(json.dumps({
    "ssim": round(report["score"], 3),
    "seuil": report["threshold"],
    "ok": report["ok"],
    "hauteurs": {"original": Image.open(ref).size[1], "copie": Image.open(cand).size[1]},
    "pires_bandes": [
        {"de": round(100 * b["index"] / rows), "a": round(100 * (b["index"] + 1) / rows), "ssim": round(b["ssim"], 3)}
        for b in bands[:5]
    ],
}))
