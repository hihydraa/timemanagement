import os, sys
from PIL import Image
R='./'  # รันจาก design/game/
OUT=sys.argv[1]  # python3 slice.py <โฟลเดอร์ปลายทาง>
CREAM=(252,245,230)
S={
 'harry':('Harry\'s chibi wardrobe and Hedwig.png','A'),
 'hermione':('Hermione\'s Magical Wardrobe and Crookshanks.png','A'),
 'ron':('Dobby’s Ron Collection with Scabbers-1.png','B'),
 'dumbledore':('Dobby’s Dumbledore Collection with Fawkes-3.png','D'),
 'draco':('Draco Collection with Owl Companion-4.png','E'),
 'hagrid':('Dobby Hagrid Collection_ Ten Items and Fang-2.png','C'),
}
# (cx per column), (y0,y1) per row, half width
L={
 'A':dict(cx=[128,344,555,757,965],rows=[(350,590),(712,930)],hw=[96,96,90,86,96],comp={'harry':(120,1045,490,1395),'hermione':(50,1050,510,1405)}),
 'B':dict(cx=[125,345,557,765,972],rows=[(372,625),(792,1025)],hw=96,comp={'ron':(485,1150,1040,1405)}),
 'C':dict(cx=[135,370,602,836,1070],rows=[(292,530),(652,860)],hw=108,comp={'hagrid':(440,960,1160,1285)}),
 'D':dict(cx=[138,378,618,835,1068],rows=[(280,535),(672,870)],hw=[108,108,92,108,108],comp={'dumbledore':(150,1000,810,1285)}),
 'E':dict(cx=[135,385,612,835,1060],rows=[(285,530),(680,910)],hw=108,comp={'draco':(235,995,520,1295)}),
}
def sq(im,size,bg=CREAM):
    im=im.convert('RGB'); w,h=im.size; s=max(w,h)
    c=Image.new('RGB',(s,s),bg); c.paste(im,((s-w)//2,(s-h)//2))
    return c.resize((size,size),Image.LANCZOS)
os.makedirs(OUT+'/items',exist_ok=True);os.makedirs(OUT+'/companions',exist_ok=True);os.makedirs(OUT+'/characters',exist_ok=True)
for ch,(fn,lay) in S.items():
    im=Image.open(R+fn).convert('RGB'); cfg=L[lay]
    n=0
    for (y0,y1) in cfg['rows']:
        for ci,cx in enumerate(cfg['cx']):
            n+=1
            hw=cfg['hw'][ci] if isinstance(cfg['hw'],list) else cfg['hw']
            sq(im.crop((cx-hw,y0,cx+hw,y1)),320).save(f'{OUT}/items/{ch}-{n:02d}.webp',quality=88)
    x0,y0,x1,y1=cfg['comp'][ch]
    c=im.crop((x0,y0,x1,y1)); c.thumbnail((640,640),Image.LANCZOS); c.save(f'{OUT}/companions/{ch}.webp',quality=88)
chars=Image.open(R+"Dobby's Six Chibi Character Choices.png").convert('RGB')
CH={'harry':(75,185,378,645),'hermione':(380,195,805,648),'ron':(815,195,1115,648),'dumbledore':(50,700,395,1205),'draco':(400,725,680,1130),'hagrid':(690,700,1180,1230)}
for k,b in CH.items():
    c=chars.crop(b); c.thumbnail((560,560),Image.LANCZOS); c.save(f'{OUT}/characters/{k}.webp',quality=90)
# contact sheets
def sheet(paths,name,cols,cell):
    rows=(len(paths)+cols-1)//cols
    s=Image.new('RGB',(cols*cell,rows*cell),(255,255,255))
    for i,p in enumerate(paths):
        im=Image.open(p).convert('RGB'); im.thumbnail((cell-4,cell-4)); s.paste(im,((i%cols)*cell+2,(i//cols)*cell+2))
    s.save(name)
for ch in S: sheet([f'{OUT}/items/{ch}-{i:02d}.webp' for i in range(1,11)],f'{OUT}/cs-{ch}.png',5,220)
sheet([f'{OUT}/companions/{c}.webp' for c in S],f'{OUT}/cs-comp.png',3,330)
sheet([f'{OUT}/characters/{c}.webp' for c in CH],f'{OUT}/cs-chars.png',3,330)
