#!/usr/bin/env bash
# Build public/img/og-share.{png,jpg} — cream paper + crest watermark + hollow-outline GPP.
set -euo pipefail
cd "$(dirname "$0")/.."

W=1200
H=630
# Nearly edge-to-edge; slight vertical crop on 630px canvas is OK.
PS=860
KERN=-45

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

magick -size "${W}x${H}" xc:'#f7f5f1' \
  \( public/img/about-stamp-figures.png -resize 1180x -channel A -evaluate multiply 0.42 +channel \) \
  -gravity center -compose over -composite \
  \( -size "${W}x${H}" xc: +noise Random -colorspace gray -resize 40% -resize 250% \
     -blur 0x0.2 -evaluate multiply 0.10 -channel A -evaluate set 28% +channel \) \
  -compose overlay -composite \
  "$TMP/base.png"

# Core glyph alpha → dilate → subtract core = thin ring only (Disk:1.5); no letter fill.
magick -size "${W}x${H}" xc:none \
  -font Impact -pointsize "${PS}" -kerning "${KERN}" \
  -gravity center -fill white -annotate +0+0 'GPP' \
  -alpha extract "$TMP/glyph-a.png"
magick "$TMP/glyph-a.png" -morphology Dilate Disk:1.5 "$TMP/outer-a.png"
magick "$TMP/outer-a.png" "$TMP/glyph-a.png" -compose MinusSrc -composite "$TMP/ring-a.png"
magick -size "${W}x${H}" xc:black \
  "$TMP/ring-a.png" -alpha off -compose CopyOpacity -composite \
  "$TMP/outline.png"

magick "$TMP/base.png" \
  "$TMP/outline.png" -gravity center -compose over -composite \
  -strip -depth 8 \
  public/img/og-share.png

magick public/img/og-share.png -quality 90 public/img/og-share.jpg
identify public/img/og-share.png public/img/og-share.jpg
