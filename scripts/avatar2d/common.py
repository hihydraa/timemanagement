"""ตัวช่วยเตรียมภาพตัวละคร 2D จากภาพต้นฉบับใน art/ (ใช้ตอนเตรียมภาพเท่านั้น ไม่เข้า bundle)
ต้องมี: numpy pillow scipy opencv-python-headless
"""
import glob
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART = os.path.join(ROOT, 'art')


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'))


def background_mask(rgb, thr=246):
    """True = พื้นหลัง: พิกเซลเกือบขาวที่ต่อกับขอบภาพ (ขาวในตา/ชุดไม่นับ)"""
    near = rgb.min(axis=2) >= thr
    lab, n = ndi.label(near)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    return np.isin(lab, border)


def find_eyes(rgb, fg):
    """คืน ((lx,ly),(rx,ry)) ศูนย์กลางตาซ้าย/ขวาในภาพ (มุมหน้า) หรือ None
    ตา = กลุ่มพิกเซลสีเข้มกลม ๆ ขนาดใหญ่สองกลุ่มที่ระดับเดียวกันในช่วงใบหน้า"""
    h, w = fg.shape
    dark = (rgb.astype(int).sum(axis=2) < 330) & fg
    dark[: int(h * 0.12)] = False
    dark[int(h * 0.55):] = False
    dark = ndi.binary_opening(dark, iterations=2)
    lab, n = ndi.label(dark)
    cands = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        area = len(ys)
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if area < 700 or area > 9000:
            continue
        fill = area / float(bw * bh)
        if bh < bw * 0.7 or bh > bw * 2.2 or fill < 0.45:
            continue
        cands.append((xs.mean(), ys.mean(), area))
    best = None
    for i in range(len(cands)):
        for j in range(i + 1, len(cands)):
            a, b = cands[i], cands[j]
            if abs(a[1] - b[1]) > 25:
                continue
            dx = abs(a[0] - b[0])
            if dx < 80 or dx > 260:
                continue
            ratio = min(a[2], b[2]) / max(a[2], b[2])
            if ratio < 0.6:
                continue
            score = (a[2] + b[2]) * ratio
            if best is None or score > best[0]:
                best = (score, a, b)
    if not best:
        return None
    _, a, b = best
    l, r = (a, b) if a[0] < b[0] else (b, a)
    return (l[0], l[1]), (r[0], r[1])


def saturation(rgb):
    mx = rgb.max(axis=2).astype(float)
    mn = rgb.min(axis=2).astype(float)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)


def lab(rgb):
    return cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(float)


def extract_hair(rgb, fg, eyes, sat_thr='auto'):
    """มาสก์ผม (bool): พิกเซลสีเทาอมน้ำตาล (อิ่มสีต่ำ) ที่ใกล้สีผมมากกว่าสีชุดรัดรูป และต่อกับผมระดับศีรษะ"""
    (lx, ly), (rx, ry) = eyes
    ey = (ly + ry) / 2
    cx = (lx + rx) / 2
    dist = rx - lx
    sat = saturation(rgb)
    h, w = fg.shape
    yy, xx = np.mgrid[0:h, 0:w]
    if sat_thr == 'auto':
        # เกณฑ์แยกผม/ผิวของภาพนี้: กึ่งกลางระหว่างความอิ่มสีของผม (ส่วนบนศีรษะ) กับของผิว (แก้ม)
        hair0 = fg & (sat < 0.36) & (yy < ey - 0.1 * dist)
        cheek = sat[int(ey + 0.3 * dist): int(ey + 0.8 * dist), int(cx - 0.6 * dist): int(cx + 0.6 * dist)]
        if hair0.sum() > 500 and cheek.size:
            sat_thr = float(np.clip((np.median(sat[hair0]) + np.median(cheek)) / 2 + 0.01, 0.36, 0.46))
        else:
            sat_thr = 0.36
    greige = fg & (sat < sat_thr)
    L = lab(rgb)
    head = greige & (yy < ey - 0.1 * dist)
    if head.sum() < 500:
        return np.zeros_like(fg)
    hair_ref = np.median(L[head], axis=0)
    # ชุดรัดรูป: บริเวณท้อง/อก (ใต้คอ) กลางลำตัว
    by0, by1 = int(ey + 2.2 * dist), int(ey + 3.2 * dist)
    bx0, bx1 = int(cx - 0.3 * dist), int(cx + 0.3 * dist)
    belly = greige[by0:by1, bx0:bx1]
    body_ref = np.median(L[by0:by1, bx0:bx1][belly], axis=0) if belly.sum() > 200 else np.array([85, 130, 140.0])
    dh = np.linalg.norm(L - hair_ref, axis=2)
    db = np.linalg.norm(L - body_ref, axis=2)
    hairlike = greige & (dh < db * 0.9 + 4)
    hairlike = ndi.binary_opening(hairlike, iterations=1)
    lab_, n = ndi.label(hairlike)
    if n == 0:
        return hairlike
    seed_ids = np.unique(lab_[head & hairlike])
    seed_ids = seed_ids[seed_ids > 0]
    # เก็บเฉพาะก้อนที่ต่อกับผมระดับศีรษะ และมีขนาดพอ
    keep = np.zeros_like(hairlike)
    sizes = ndi.sum(hairlike, lab_, index=np.arange(n + 1))
    for i in seed_ids:
        if sizes[i] > 3000:
            keep |= lab_ == i
    keep = ndi.binary_closing(keep, iterations=2)
    keep = ndi.binary_fill_holes(keep) & ~(~fg)
    return keep


def grabcut_hair(rgb, fg, eyes, front_hair, iters=5):
    """ผมยาวที่ทอดลงมาหลังตัว: ใช้ GrabCut แยกผมจากชุดรัดรูป โดยตั้งต้นจากผมส่วนหัวที่แน่ใจ"""
    (lx, ly), (rx, ry) = eyes
    ey = (ly + ry) / 2
    cx = (lx + rx) / 2
    dist = rx - lx
    h, w = fg.shape
    sat = saturation(rgb)
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    cand = fg & (sat < 0.36)
    mask[cand] = cv2.GC_PR_BGD
    # ผมที่อาจเป็นได้: พื้นที่ข้างลำตัวและรอบหัว (กรอบกว้างกว่าลำตัว)
    yy, xx = np.mgrid[0:h, 0:w]
    near = cand & (yy < ey + 7.5 * dist)
    mask[near] = cv2.GC_PR_FGD
    mask[ndi.binary_erosion(front_hair, iterations=3)] = cv2.GC_FGD
    # ชุดรัดรูปกลางลำตัวแน่นอน
    body = np.zeros((h, w), bool)
    body[int(ey + 1.6 * dist):, int(cx - 0.45 * dist): int(cx + 0.45 * dist)] = True
    mask[body & cand] = cv2.GC_BGD
    mask[fg & (sat >= 0.42)] = cv2.GC_BGD  # ผิว/ตา/ปาก
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    cv2.grabCut(bgr, mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    out = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    out &= fg
    lab_, n = ndi.label(out)
    if n:
        sizes = ndi.sum(out, lab_, index=np.arange(n + 1))
        ids = np.unique(lab_[front_hair & out])
        ids = ids[ids > 0]
        out = np.isin(lab_, [i for i in ids if sizes[i] > 800])
    return ndi.binary_fill_holes(out)


# ---------------------------------------------------------------- จัดภาพเข้ากรอบมาตรฐาน
SRC = 1024
# ตำแหน่งตามาตรฐาน (จุดกึ่งกลางระหว่างตา) และระยะห่างตา ในกรอบ 1024×1024 — ทุกชิ้นถูกย้าย/ย่อขยายให้ตาตรงนี้
EYE_C = (512.0, 330.0)
EYE_D = 142.0
# กรอบตัดที่ใช้ส่งออก (ในพิกัด 1024) และขนาดไฟล์ผลลัพธ์ (อัตราส่วนเดียวกับกรอบ)
CROP = (112, 24, 912, 1004)  # x0 y0 x1 y1 → 800×980
OUT_W = 400
OUT_H = 490


def register(rgb, alpha, eyes):
    """ย้ายภาพ RGBA เข้ากรอบมาตรฐานด้วยการเลื่อน+ย่อขยายสม่ำเสมอให้ตาทับตำแหน่งมาตรฐาน คืน RGBA (OUT_H×OUT_W)"""
    (lx, ly), (rx, ry) = eyes
    d = rx - lx
    s = EYE_D / d
    cx, cy = (lx + rx) / 2, (ly + ry) / 2
    tx = EYE_C[0] - s * cx - CROP[0]
    ty = EYE_C[1] - s * cy - CROP[1]
    k = OUT_W / (CROP[2] - CROP[0])
    M = np.array([[s * k, 0, tx * k], [0, s * k, ty * k]], np.float64)
    rgba = np.dstack([rgb, alpha])
    # ผสมแบบ premultiplied กันขอบขาว
    pre = rgba.astype(np.float32)
    pre[..., :3] *= pre[..., 3:4] / 255.0
    out = cv2.warpAffine(pre, M, (OUT_W, OUT_H), flags=cv2.INTER_AREA if s * k < 1 else cv2.INTER_LINEAR,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    a = out[..., 3:4]
    rgb_out = np.where(a > 1, out[..., :3] / np.maximum(a / 255.0, 1e-3), 0)
    return np.dstack([np.clip(rgb_out, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8)


def soft_alpha(mask, erode=1, blur=1.2):
    """มาสก์ bool → alpha นุ่ม (หดเข้า 1px กันขอบขาวจากพื้นหลัง)"""
    m = ndi.binary_erosion(mask, iterations=erode) if erode else mask
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), blur)
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)
