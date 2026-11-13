import cv2, numpy as np, os, sys
from PIL import Image
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
SRC='/home/user/timemanagement/apps/web/public/game/companions/'
def cut(pil, inset=0.03):
    img=cv2.cvtColor(np.array(pil.convert('RGB')),cv2.COLOR_RGB2BGR); h,w=img.shape[:2]
    mask=np.zeros((h,w),np.uint8); rect=(int(w*inset),int(h*inset),int(w*(1-2*inset)),int(h*(1-2*inset)))
    bg=np.zeros((1,65));fg=np.zeros((1,65))
    cv2.grabCut(img,mask,rect,bg,fg,8,cv2.GC_INIT_WITH_RECT)
    m=np.where((mask==1)|(mask==3),255,0).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(m)
    k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); m=np.where(lab==k,255,0).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
    inv=cv2.bitwise_not(m); ff=inv.copy(); hh,ww=m.shape; fm=np.zeros((hh+2,ww+2),np.uint8)
    cv2.floodFill(ff,fm,(0,0),0)  # พื้นที่ด้านนอกที่ต่อกับขอบ
    holes=(ff>0).astype(np.uint8)*255  # ที่เหลือ = รูในตัวสัตว์ (เช่น ตา) → อุด
    m=cv2.bitwise_or(m,holes); m=cv2.GaussianBlur(m,(3,3),0)
    im=Image.fromarray(np.dstack([cv2.cvtColor(img,cv2.COLOR_BGR2RGB),m]),'RGBA'); return im.crop(im.getbbox())
names=['harry','hermione','ron','dumbledore','draco','hagrid']; tiles=[]
for n in names:
    c=cut(Image.open(SRC+n+'.webp')); c.thumbnail((420,420),Image.LANCZOS); c.save(f'{OUT}/{n}.webp',quality=90,method=6); tiles.append(c); print(n,c.size)
s=Image.new('RGB',(1200,800),(60,60,70))
for i,c in enumerate(tiles):
    t=c.copy(); t.thumbnail((390,390)); s.paste(t,((i%3)*400+5,(i//3)*400+5),t)
s.save(f'{OUT}/sheet.png')
