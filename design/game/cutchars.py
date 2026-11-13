import cv2, numpy as np, os, sys
from PIL import Image
R='/home/user/timemanagement/design/game/'
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
CH={'harry':(75,185,378,645),'hermione':(380,195,805,648),'ron':(815,195,1115,648),'dumbledore':(50,700,395,1205),'draco':(400,725,680,1215),'hagrid':(690,700,1180,1230)}
chars=Image.open(R+"Dobby's Six Chibi Character Choices.png").convert('RGB')
def cut(pil):
    img=cv2.cvtColor(np.array(pil),cv2.COLOR_RGB2BGR); h,w=img.shape[:2]
    mask=np.full((h,w),cv2.GC_PR_BGD,np.uint8)
    b=int(min(h,w)*0.02); mask[:b,:]=cv2.GC_BGD; mask[-b:,:]=cv2.GC_BGD; mask[:,:b]=cv2.GC_BGD; mask[:,-b:]=cv2.GC_BGD
    edge=np.concatenate([img[:b].reshape(-1,3),img[-b:].reshape(-1,3),img[:,:b].reshape(-1,3),img[:,-b:].reshape(-1,3)]).astype(np.float32)
    bgc=np.median(edge,axis=0)
    dist=np.linalg.norm(img.astype(np.float32)-bgc,axis=2)
    cand=(dist<10).astype(np.uint8)
    n,lab=cv2.connectedComponents(cand)
    touch=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    sure_bg=np.isin(lab,list(touch))
    mask[sure_bg]=cv2.GC_BGD
    mask[~sure_bg & (dist>22)]=cv2.GC_PR_FGD
    mask[int(h*0.12):int(h*0.62), int(w*0.42):int(w*0.58)]=cv2.GC_FGD  # เฉพาะหัว-ลำตัว (ขาให้โมเดลสีตัดสินเอง)
    bg=np.zeros((1,65));fg=np.zeros((1,65))
    cv2.grabCut(img,mask,None,bg,fg,8,cv2.GC_INIT_WITH_MASK)
    m=np.where((mask==1)|(mask==3),255,0).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(m)
    k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); m=np.where(lab==k,255,0).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8)); m=cv2.GaussianBlur(m,(3,3),0)
    im=Image.fromarray(np.dstack([cv2.cvtColor(img,cv2.COLOR_BGR2RGB),m]),'RGBA'); return im.crop(im.getbbox())
tiles=[]
for k,b in CH.items():
    c=cut(chars.crop(b)); c.thumbnail((640,640),Image.LANCZOS); c.save(f'{OUT}/{k}.webp',quality=92,method=6); tiles.append(c); print(k,c.size)
s=Image.new('RGB',(990,660),(60,60,70))
for i,c in enumerate(tiles):
    t=c.copy(); t.thumbnail((322,322)); s.paste(t,((i%3)*330+4,(i//3)*330+4),t)
s.save(f'{OUT}/sheet.png')
