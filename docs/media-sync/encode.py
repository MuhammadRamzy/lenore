# Yesterday's established pipeline (scratchpad/convert.py), unchanged settings:
# EXIF orientation, flatten on white, shrink-only to 1600 (photos) / 2400 (posters),
# WebP q85 method 6; 600 px thumbnail WebP q80. No upscaling; aspect ratio kept.
import io, hashlib
from PIL import Image, ImageOps
def encode(path, slot):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
    side = 1600 if slot == "photo" else 2400
    big = im.copy(); big.thumbnail((side, side), Image.LANCZOS)
    small = im.copy(); small.thumbnail((600, 600), Image.LANCZOS)
    a, b = io.BytesIO(), io.BytesIO()
    big.save(a, "WEBP", quality=85, method=6); small.save(b, "WEBP", quality=80, method=6)
    return a.getvalue(), b.getvalue(), big.size, small.size
sha = lambda b: hashlib.sha256(b).hexdigest()
