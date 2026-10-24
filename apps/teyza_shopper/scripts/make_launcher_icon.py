"""Generate native Android launcher icons from the shared TEYZA Y-sprout vector.

Never downloads images at build time. Standard PNGs include the deep-teal
background; the adaptive foreground contains only the colourful sprout, so
Android round and squircle masks do not cut off the growing petals.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image
import cairosvg

root = Path(__file__).resolve().parents[1]
source = root / "assets" / "brand" / "teyza-sprout-icon.svg"
res = root / "android" / "app" / "src" / "main" / "res"
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96,
         "xxhdpi": 144, "xxxhdpi": 192}

def vector_image(svg_markup: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg_markup.encode("utf-8"),
                          output_width=size, output_height=size)
    return Image.open(BytesIO(png)).convert("RGBA")

content = source.read_text(encoding="utf-8")
for density, pixels in sizes.items():
    target = res / ("mipmap-" + density)
    target.mkdir(parents=True, exist_ok=True)
    image = vector_image(content, pixels)
    image.save(target / "ic_launcher.png", optimize=True)

# The coloured icon background is supplied by Android itself.
foreground_markup = content.replace(
    '<rect width="512" height="512" rx="112" fill="url(#square)"/>', ""
).replace(
    '<circle cx="256" cy="238" r="185" fill="#FFFFFF" opacity=".052"/>', ""
)
foreground = res / "drawable-nodpi"
foreground.mkdir(parents=True, exist_ok=True)
vector_image(foreground_markup, 432).save(
    foreground / "ic_launcher_foreground.png", optimize=True
)

colors = res / "values"
colors.mkdir(parents=True, exist_ok=True)
(colors / "teyza_launcher_colors.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    ' <color name="teyza_icon_background">#003F4A</color>\n'
    '</resources>\n', encoding="utf-8"
)
adaptive = res / "mipmap-anydpi-v26"
adaptive.mkdir(parents=True, exist_ok=True)
(adaptive / "ic_launcher.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    ' <background android:drawable="@color/teyza_icon_background" />\n'
    ' <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
    '</adaptive-icon>\n', encoding="utf-8"
)
print("TEYZA Y-sprout launcher: five densities and adaptive icon ready")

# Apple supplies its own mask. Every iOS icon is square, RGB and opaque.
ios_icons = root / "ios/Runner/Assets.xcassets/AppIcon.appiconset"
contents = ios_icons / "Contents.json"
if contents.exists():
    import json
    metadata = json.loads(contents.read_text())
    for item in metadata["images"]:
        points = float(item["size"].split("x")[0])
        scale = float(item["scale"].rstrip("x"))
        pixels = round(points * scale)
        image = vector_image(content, pixels)
        opaque = Image.new("RGB", (pixels, pixels), "#003F4A")
        opaque.paste(image, mask=image.getchannel("A"))
        filename = item.get("filename") or f"Icon-{pixels}.png"
        item["filename"] = filename
        opaque.save(ios_icons / filename, optimize=True)
    contents.write_text(json.dumps(metadata, indent=2) + "\n")
    print("TEYZA iOS AppIcon: all required sizes, no alpha channel")
