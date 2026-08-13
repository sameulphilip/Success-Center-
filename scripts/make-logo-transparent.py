from collections import deque
from pathlib import Path

from PIL import Image

src = Path(r"C:\Users\samoi\Desktop\Center ERP\apps\web\public\success-logo.png")
bak = src.with_name("success-logo-original.png")
if not bak.exists():
    bak.write_bytes(src.read_bytes())

img = Image.open(src).convert("RGBA")
w, h = img.size
pix = img.load()


def is_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 10:
        return True
    mx = max(r, g, b)
    mn = min(r, g, b)
    # very dark, low-chroma backdrop only
    return mx <= 28 and (mx - mn) <= 12


visited = [[False] * h for _ in range(w)]
q: deque[tuple[int, int]] = deque()
for x in range(w):
    for y in (0, h - 1):
        q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        q.append((x, y))

while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or visited[x][y]:
        continue
    visited[x][y] = True
    r, g, b, a = pix[x, y]
    if not is_bg(r, g, b, a):
        continue
    pix[x, y] = (0, 0, 0, 0)
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
            q.append((nx, ny))

# clean soft black fringe next to transparency
for x in range(w):
    for y in range(h):
        r, g, b, a = pix[x, y]
        if a == 0:
            continue
        if max(r, g, b) <= 40 and (max(r, g, b) - min(r, g, b)) <= 15:
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] == 0:
                    pix[x, y] = (0, 0, 0, 0)
                    break

img.save(src, optimize=True)
print("saved", src, "size", img.size)

mobile = Path(r"C:\Users\samoi\Desktop\Center ERP\apps\mobile\assets\brand\success-logo.png")
if mobile.exists():
    img.save(mobile, optimize=True)
    print("saved", mobile)
