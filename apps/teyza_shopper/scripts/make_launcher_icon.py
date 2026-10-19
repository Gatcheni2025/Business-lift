"""Create TEYZA branded Android launcher assets from deterministic vector geometry.
Colours match the Teyza green/teal brand; no external image URLs at build time.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math
root=Path(__file__).resolve().parents[1]/"android"/"app"/"src"/"main"/"res"
resolutions={"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}

def draw_icon(width, foreground_only=False):
    im=Image.new("RGBA",(width,width),(0,0,0,0))
    d=ImageDraw.Draw(im)
    if not foreground_only:
        for y in range(width):
            f=y/max(1,width-1)
            base=(int(0+4*f),int(171-96*f),int(120-54*f),255)
            d.line((0,y,width,y),fill=base)
        # subtle lower right dark curve
        d.ellipse((-width*.3,width*.57,width*1.55,width*1.55),
                  fill=(0,75,65,65))
    # Bold forward-slanted white T, safe inside adaptive-icon mask.
    scale=width/512
    pts=[(105,144),(427,144),(400,210),(292,210),
         (250,388),(163,388),(209,210),(92,225)]
    d.polygon([(round(x*scale),round(y*scale)) for x,y in pts],fill=(255,255,255,255))
    return im

for density,size in resolutions.items():
    target=root/("mipmap-"+density)
    target.mkdir(parents=True,exist_ok=True)
    draw_icon(size).save(target/"ic_launcher.png",optimize=True)

foreground=root/"drawable-nodpi"
foreground.mkdir(parents=True,exist_ok=True)
draw_icon(432,foreground_only=True).save(foreground/"ic_launcher_foreground.png",optimize=True)

colors=root/"values"
colors.mkdir(parents=True,exist_ok=True)
(colors/"teyza_launcher_colors.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '<color name="teyza_icon_background">#078E66</color>\n</resources>\n',
    encoding="utf-8")

adaptive=root/"mipmap-anydpi-v26"
adaptive.mkdir(parents=True,exist_ok=True)
(adaptive/"ic_launcher.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    ' <background android:drawable="@color/teyza_icon_background" />\n'
    ' <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
    '</adaptive-icon>\n',encoding="utf-8")
print("Generated TEYZA Android launcher icons in five densities + adaptive icon")
