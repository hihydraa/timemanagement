#!/usr/bin/env python3
"""สร้างภาพตัวละครสำหรับเว็บจาก art/ (มุมหน้า): ชุด = ตัวเต็มที่ตัดพื้นหลัง, ทรงผม = สกัดเฉพาะผม
ทุกชิ้นถูกจัดเข้ากรอบเดียวกันด้วยตำแหน่งตา จึงซ้อนกันได้ตรง (ดู common.register)
ผลลัพธ์: apps/web/public/avatar2d/{hair,outfit}/<ชื่อ>.webp + src/lib/avatar2dItems.ts (แคตาล็อกที่สร้างอัตโนมัติ)
รัน: python3 scripts/avatar2d/export.py   (ต้องมี numpy pillow scipy opencv-python-headless)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa: E402,F401,F403

PUB = os.path.join(ROOT, 'apps', 'web', 'public', 'avatar2d')

# (โฟลเดอร์ต้นฉบับ, ชื่อไทย, ราคาแต้ม)  — ราคา 0 = ฟรี
HAIR = {
    'f_pixie': ('ผมสั้นพิกซี่', 0, 'สาวน้อย'),
    'f_bob': ('ผมบ็อบ', 0, 'สาวน้อย'),
    'f_space_buns': ('ผมสองมวย', 30, 'สาวน้อย'),
    'f_top_bun': ('ผมมวยกลางหัว', 30, 'สาวน้อย'),
    'f_wavy_shoulder': ('ผมลอนประบ่า', 40, 'สาวน้อย'),
    'f_high_ponytail': ('ผมหางม้าสูง', 40, 'สาวน้อย'),
    'm_side_part': ('ผมเสยข้าง', 0, 'หนุ่มน้อย'),
    'm_comma': ('ผมทรงคอมม่า', 20, 'หนุ่มน้อย'),
    'm_messy_crop': ('ผมครอปยุ่ง', 20, 'หนุ่มน้อย'),
    'm_slicked_back': ('ผมเสยหลัง', 30, 'หนุ่มน้อย'),
    'm_undercut': ('ผมอันเดอร์คัท', 30, 'หนุ่มน้อย'),
    'm_shaggy': ('ผมแชกกี้', 40, 'หนุ่มน้อย'),
    'm_man_bun': ('ผมมวยหนุ่ม', 40, 'หนุ่มน้อย'),
    'm_curly_fade': ('ผมหยิกเฟด', 50, 'หนุ่มน้อย'),
    'm_short_twists': ('ผมทวิสต์สั้น', 50, 'หนุ่มน้อย'),
    'm_spiky': ('ผมตั้งกระเซิง', 50, 'หนุ่มน้อย'),
    'n_blunt_bob': ('บ็อบตรงเอลฟ์', 40, 'เอลฟ์'),
    'n_mushroom': ('ผมทรงเห็ด', 40, 'เอลฟ์'),
    'n_half_shaved': ('ผมโกนครึ่งข้าง', 60, 'เอลฟ์'),
    'n_messy_side_lock': ('ผมปรกข้างยุ่ง', 60, 'เอลฟ์'),
    'n_curly_shag': ('ผมแชกหยิก', 60, 'เอลฟ์'),
    'n_curly_afro': ('ผมอาฟโรหยิก', 70, 'เอลฟ์'),
    'n_wolf_cut': ('ผมวูลฟ์คัท', 70, 'เอลฟ์'),
    'n_shaggy_mullet': ('ผมมัลเล็ตแชกกี้', 70, 'เอลฟ์'),
}
OUTFIT = {
    't_hoodie_joggers': ('ฮู้ดครีม+กางเกงจ๊อกเกอร์', 0, 'ชุดทั่วไป'),
    't_denim_overalls': ('ชุดเอี๊ยมยีนส์', 0, 'ชุดทั่วไป'),
    't_sage_cardigan': ('คาร์ดิแกนเขียวซาจ', 40, 'ชุดทั่วไป'),
    't_starry_pajama': ('ชุดนอนลายดาว', 50, 'ชุดทั่วไป'),
    't_forest_cloak': ('ผ้าคลุมนักเดินป่า', 80, 'ชุดทั่วไป'),
    'h_ghost_poncho': ('ชุดผี', 90, 'ฮาโลวีน'),
    'h_scientist': ('เสื้อกาวน์นักวิทยาศาสตร์', 60, 'ฮาโลวีน'),
    'h_cat_onesie': ('ชุดหมีแมวดำ', 90, 'ฮาโลวีน'),
    'h_skeleton_pajama': ('ชุดนอนโครงกระดูก', 90, 'ฮาโลวีน'),
    'h_pumpkin': ('ชุดฟักทอง', 100, 'ฮาโลวีน'),
    'h_mummy': ('ชุดมัมมี่', 100, 'ฮาโลวีน'),
    'h_werewolf_hoodie': ('ฮู้ดมนุษย์หมาป่า', 110, 'ฮาโลวีน'),
    'h_vampire': ('ชุดแวมไพร์', 120, 'ฮาโลวีน'),
    'h_witch_robe': ('ชุดแม่มด', 120, 'ฮาโลวีน'),
}
SKIP_HAIR = {
    # ผมยาวที่ทอดอยู่หลังตัว/ตาถูกผมบัง: ยังแยกออกจากชุดรัดรูปอัตโนมัติไม่ได้ (ดู docs/AVATAR_2D.md)
    'f_long_straight': 'ผมยาวหลังตัว',
    'f_long_wavy': 'ผมยาวหลังตัว',
    'f_twin_tails': 'ผมแกละยาวหลังตัว',
    'f_braided_pigtails': 'เปียห้อยหน้าตัว',
    'n_low_ponytail': 'หางม้าหลังตัว',
    'n_asymmetric_bob': 'ตาซ้ายถูกผมบัง จัดตำแหน่งไม่ได้',
}


def hair_layer(name):
    f = f'{ART}/Hair/split/{name}/{name}_0_front.png'
    rgb = load_rgb(f)
    fg = ~background_mask(rgb)
    eyes = find_eyes(rgb, fg)
    if eyes is None:
        raise SystemExit(f'หาตาไม่เจอ: {name}')
    m = extract_hair(rgb, fg, eyes)
    return register(rgb, soft_alpha(m), eyes)


def outfit_layer(name):
    f = f'{ART}/dress/split/{name}/{name}_0_front.png'
    rgb = load_rgb(f)
    bg = background_mask(rgb)
    eyes = find_eyes(rgb, ~bg)
    if eyes is None:
        raise SystemExit(f'หาตาไม่เจอ: {name}')
    return register(rgb, soft_alpha(~bg), eyes)


def save(arr, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr).save(path, 'WEBP', quality=88, method=6)
    return os.path.getsize(path)


def main():
    total = 0
    items = []
    for name, (th, price, group) in HAIR.items():
        total += save(hair_layer(name), f'{PUB}/hair/{name}.webp')
        items.append(('hair', name, th, price, group))
    for name, (th, price, group) in OUTFIT.items():
        total += save(outfit_layer(name), f'{PUB}/outfit/{name}.webp')
        items.append(('outfit', name, th, price, group))
    rows = []
    for slot, name, th, price, group in items:
        rows.append(
            f"  {{ id: 'a-{slot}-{name.replace('_', '-')}', slot: '{slot}', th: {json.dumps(th, ensure_ascii=False)}, "
            f"price: {price}, group: {json.dumps(group, ensure_ascii=False)}, file: '{slot}/{name}.webp' }},"
        )
    ts = (
        '/** สร้างอัตโนมัติด้วย scripts/avatar2d/export.py — อย่าแก้มือ (ราคา/ชื่อแก้ที่สคริปต์) */\n'
        "export interface ArtItem {\n  id: string;\n  slot: 'hair' | 'outfit';\n  th: string;\n  price: number;\n  group: string;\n  /** ไฟล์ภายใต้ /avatar2d/ */\n  file: string;\n}\n\n"
        'export const ART_ITEMS: readonly ArtItem[] = [\n' + '\n'.join(rows) + '\n];\n'
    )
    open(f'{ROOT}/src/lib/avatar2dItems.ts', 'w', encoding='utf-8').write(ts)
    print(f'ส่งออก {len(items)} ชิ้น รวม {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
