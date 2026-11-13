# ตัดพื้นหลังของไอเท็ม/ตัวละคร (GrabCut) ให้เป็นภาพโปร่งใส สำหรับสวมซ้อนบนตัวละคร
import os, sys
import cv2, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
OUT = sys.argv[1]
R = '/home/user/timemanagement/design/game/'
exec(open('/tmp/claude-0/game/slice.py').read().split("def sq")[0].split("OUT=sys.argv[1]")[1].replace("OUT=sys.argv[1]",""))  # S, L
def grab(pil, inset=0.05, iters=6):
    img = cv2.cvtColor(np.array(pil.convert('RGB')), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w*inset), int(h*inset), int(w*(1-2*inset)), int(h*(1-2*inset)))
    bg = np.zeros((1,65)); fg = np.zeros((1,65))
    cv2.grabCut(img, mask, rect, bg, fg, iters, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    # เก็บเฉพาะก้อนใหญ่สุด + อุดรู
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = np.where(lab == k, 255, 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5,5), np.uint8))
    m = cv2.GaussianBlur(m, (3,3), 0)
    rgba = np.dstack([cv2.cvtColor(img, cv2.COLOR_BGR2RGB), m])
    im = Image.fromarray(rgba, 'RGBA')
    bb = im.getbbox()
    return im.crop(bb) if bb else im
def clear_lens(path):
    im = Image.open(path).convert('RGBA'); a = np.array(im).astype(np.int32)
    bgc = np.array([252,245,230]); d = np.linalg.norm(a[...,:3]-bgc, axis=2)
    a[...,3] = np.where(d < 34, 0, a[...,3]); Image.fromarray(a.astype(np.uint8),'RGBA').save(path, quality=90, method=6)
os.makedirs(OUT + '/items', exist_ok=True); os.makedirs(OUT + '/characters', exist_ok=True)
for ch, (fn, lay) in S.items():
    im = Image.open(R + fn).convert('RGB'); cfg = L[lay]; n = 0
    for (y0, y1) in cfg['rows']:
        for ci, cx in enumerate(cfg['cx']):
            n += 1
            hw = cfg['hw'][ci] if isinstance(cfg['hw'], list) else cfg['hw']
            c = grab(im.crop((cx-hw, y0, cx+hw, y1)))
            c.thumbnail((300, 300), Image.LANCZOS)
            c.save(f'{OUT}/items/{ch}-{n:02d}.webp', quality=90, method=6)
for gid in ('harry-08','dumbledore-06'): clear_lens(f'{OUT}/items/{gid}.webp')
# contact sheets บนพื้นตาหมากรุก
def sheet(paths, name, cols, cell):
    rows = (len(paths)+cols-1)//cols
    s = Image.new('RGB', (cols*cell, rows*cell), (60,60,70))
    for i, p in enumerate(paths):
        im = Image.open(p).convert('RGBA'); im.thumbnail((cell-8, cell-8)); s.paste(im, ((i%cols)*cell+4, (i//cols)*cell+4), im)
    s.save(name)
for ch in S: sheet([f'{OUT}/items/{ch}-{i:02d}.webp' for i in range(1,11)], f'{OUT}/cs-{ch}.png', 5, 200)
