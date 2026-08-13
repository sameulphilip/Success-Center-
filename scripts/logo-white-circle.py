from pathlib import Path

from PIL import Image, ImageDraw

web = Path(r"C:\Users\samoi\Desktop\Center ERP\apps\web\public\success-logo.png")
original = Path(r"C:\Users\samoi\Desktop\Center ERP\apps\web\public\success-logo-original.png")
mobile = Path(r"C:\Users\samoi\Desktop\Center ERP\apps\mobile\assets\brand\success-logo.png")

# Prefer current transparent asset; fall back to original
base_path = web if web.exists() else original
logo = Image.open(base_path).convert("RGBA")

# Ensure any leftover near-black backdrop is transparent before compositing
pix = logo.load()
w0, h0 = logo.size
for x in range(w0):
    for y in range(h0):
        r, g, b, a = pix[x, y]
        if a and max(r, g, b) <= 28 and (max(r, g, b) - min(r, g, b)) <= 12:
            pix[x, y] = (0, 0, 0, 0)

size = 1024
canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
# slight inset so circle edge is clean when scaled down
pad = 8
draw.ellipse((pad, pad, size - pad - 1, size - pad - 1), fill=(255, 255, 255, 255))

# Fit logo inside the circle with breathing room
inner = int(size * 0.72)
logo_resized = logo.copy()
logo_resized.thumbnail((inner, inner), Image.Resampling.LANCZOS)
lx = (size - logo_resized.width) // 2
ly = (size - logo_resized.height) // 2
canvas.alpha_composite(logo_resized, (lx, ly))

canvas.save(web, optimize=True)
print("saved", web)
if mobile.parent.exists():
    canvas.save(mobile, optimize=True)
    print("saved", mobile)
