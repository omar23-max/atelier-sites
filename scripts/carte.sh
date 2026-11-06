#!/bin/sh
# Aperçu léger d'un template pour le catalogue : capture pleine page réduite à
# 360 px de large, coupée à 3600 px de haut (environ 10 écrans), en JPEG.
# Peu de mémoire dans le navigateur, même avec des centaines de cartes.
# Usage : carte.sh <desktop.png> <carte.jpg>   (chemins absolus)
set -e
tmp="$2.tmp.v"
vipsthumbnail "$1" --size 360x -o "$tmp"
h=$(vipsheader -f height "$tmp")
if [ "$h" -gt 3600 ]; then
  vips crop "$tmp" "$2[Q=75,strip]" 0 0 "$(vipsheader -f width "$tmp")" 3600
else
  vips copy "$tmp" "$2[Q=75,strip]"
fi
rm -f "$tmp"
