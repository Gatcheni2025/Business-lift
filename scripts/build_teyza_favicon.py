"""Create a standard multi-resolution ICO from the existing TEYZA Y-sprout SVG.

This is an optional browser compatibility asset; SVG remains the primary icon.
"""
from io import BytesIO
from pathlib import Path
import cairosvg
from PIL import Image


def create_favicon(svg_path: Path) -> bytes:
    if not svg_path.is_file():
        raise FileNotFoundError(f"TEYZA icon not found: {svg_path}")
    svg_data = svg_path.read_bytes()
    png = cairosvg.svg2png(
        bytestring=svg_data,
        output_width=256,
        output_height=256,
    )
    with Image.open(BytesIO(png)) as raster:
        image = raster.convert("RGBA")
        output = BytesIO()
        image.save(
            output,
            format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        )
    ico = output.getvalue()
    if len(ico) < 300 or ico[:4] != b"\\x00\\x00\\x01\\x00":
        raise ValueError("Failed to render Windows-compatible TEYZA favicon.ico")
    return ico
