import cv2, numpy as np, sys, os
from PIL import Image
import os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')
SRC=os.path.join(ROOT,'00_base','Gemini_Generated_Image_epy6quepy6quepy6.jpg')  # แผ่นฐาน 6 มุมของแฮร์รี่ (2528x1696)
def base_rgba():
    im=Image.open(SRC).convert('RGB').resize((2048,1373),Image.LANCZOS)
    a=np.array(im); bgr=cv2.cvtColor(a,cv2.COLOR_RGB2BGR)
    d=np.linalg.norm(a.astype(np.float32)-np.array([255,255,255],np.float32),axis=2)
    fg=(d>14).astype(np.uint8)
    # พื้นที่ด้านนอก = ส่วนที่ต่อกับขอบภาพผ่านพื้นหลังขาว
    bgm=(1-fg).astype(np.uint8); n,lab=cv2.connectedComponents(bgm)
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    outside=np.isin(lab,list(edge))
    m=np.where(outside,0,255).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    m=cv2.GaussianBlur(m,(3,3),0)
    return Image.fromarray(np.dstack([a,m]),'RGBA')

# ใช้: python3 layers_front.py <โฟลเดอร์ปลายทาง>
# เลเยอร์ (01_front/*.png) ขนาด 2048x1373 อยู่ตำแหน่งตรงกับแผ่นฐานที่ย่อเหลือ 2048x1373 → ตัดฐานมุมหน้าแล้วครอปทุกชั้นด้วยกรอบเดียวกัน
NAMES={'01':'robe','02':'shirt','03':'vest','04':'tie','05':'shorts','06':'shoes','07':'scarf','08':'glasses','09':'wand','10':'broom','pet':'owl'}
FILES={'01':'01_robe','02':'02_shirt','03':'03_vest','04':'04_tie','05':'05_shorts','06':'06_shoes','07':'07_scarf','08':'08_glasses','09':'09_wand','10':'10_broom','pet':'11_owl'}
if __name__=='__main__':
    out=sys.argv[1]; os.makedirs(out,exist_ok=True)
    b=base_rgba()
    a=np.array(b)[...,3]>20
    n,lab=cv2.connectedComponents(a.astype(np.uint8))
    front=np.isin(lab,[lab[420,330]])  # ตัวละครมุมหน้า = ก้อนที่ครอบจุดกลางลำตัว
    m=np.array(b); m[...,3]=np.where(front,m[...,3],0); front_img=Image.fromarray(m,'RGBA')
    L=os.path.join(ROOT,'01_front')
    layers={k:Image.open(os.path.join(L,FILES[k]+'.png')).convert('RGBA') for k in FILES}
    boxes=[front_img.getbbox()]+[l.getbbox() for l in layers.values()]
    x0=min(b_[0] for b_ in boxes)-10; y0=min(b_[1] for b_ in boxes)-10; x1=max(b_[2] for b_ in boxes)+10; y1=max(b_[3] for b_ in boxes)+10
    crop=(x0,y0,x1,y1); print('crop',crop,(x1-x0,y1-y0))
    front_img.crop(crop).save(f'{out}/base.webp',quality=92,method=6)
    for k,im in layers.items(): im.crop(crop).save(f'{out}/{k}.webp',quality=92,method=6)
    open(f'{out}/meta.json','w').write('{"w":%d,"h":%d}'%(x1-x0,y1-y0))
