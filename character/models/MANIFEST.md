# Character & Hair 3D Models (ไฟล์ต้นฉบับ ยังไม่ optimize)

ไฟล์ .glb ทั้งหมดเก็บผ่าน **Git LFS** (ดู `.gitattributes`) ต้องมี `git lfs` ติดตั้งก่อน clone

## ตัวละครพื้นฐาน (base)

| ไฟล์ | ต้นทาง | หมายเหตุ |
|---|---|---|
| `base/female/base_female.glb` | `character/base_female/` | mesh เดียว ~60 MB |
| `base/male/base_male.glb` | `character/base_male/` | mesh เดียว ~61 MB |
| `base/nonbinary/base_nonbinary.glb` | `character/base_nonbinary/` | mesh เดียว ~60 MB (โฟลเดอร์ต้นทางชื่อ `base_nonbinary`) |
| `base/*/reference/*.png` | โฟลเดอร์เดียวกัน | ภาพอ้างอิงมุมต่าง ๆ (front/back/side) |

## ทรงผมแบบ Separate Part (hair)

| ไฟล์ | ต้นทาง | หมายเหตุ |
|---|---|---|
| `hair/separate-part/hair-cute-girl.glb` | `cute girl 3d model.glb` | 9 mesh (`tripo_part_*`) |
| `hair/separate-part/hair-e1b9-multipart.glb` | `e1b9178...(1).glb` | 11 mesh (`tripo_part_*`) |
| `hair/separate-part/hair-e1b9-single.glb` | `e1b9178....glb` | mesh เดียว |
| `hair/separate-part/hair-elf-boy.glb` | `elf boy 3d model.glb` | 4 mesh (`tripo_part_*`) |
| `hair/separate-part/hair-tripo-58cc9f16.glb` | `tripo_convert_58cc9f16...glb` | 7 mesh + ParentNode |
| `hair/separate-part/hair-tripo-959b8b8b.glb` | `tripo_convert_959b8b8b...glb` | mesh เดียว |

- `e1b9178...(2).glb` ซ้ำกับ `(1)` (sha256 เหมือนกันทุกไบต์) จึงไม่อัพโหลด

## ยังไม่ได้อัพโหลด (ไม่อยู่ในขอบเขตรอบนี้)

- `Hair/Model_Hair/*.glb` (4 ไฟล์ระดับบน) และ `character/3d/hair/f_braided_pigtails.glb`
- ภาพอ้างอิงทรงผมและเสื้อผ้า (`Hair/*.png`, `dress/*.png`, `split/`) และไฟล์ `.glb` เสื้อผ้า (ยังไม่พบไฟล์ 3D ของเสื้อผ้าในโฟลเดอร์ `dress/`)

## ข้อควรรู้ก่อนใช้งานในเว็บ

- Cloudflare Workers static assets จำกัดไฟล์ละ 25 MiB ไฟล์เหล่านี้ใหญ่กว่านั้นมาก ต้องบีบอัด (เช่น gltf-transform: Draco/meshopt + ลดขนาดเท็กซ์เจอร์) ก่อนนำไปแสดงในแอป

## ไฟล์ที่บีบอัดแล้ว (ใช้ในเว็บ)

อยู่ที่ `apps/web/public/models/` สร้างด้วย `@gltf-transform/cli` (optimize) ตั้งค่า: meshopt, เท็กซ์เจอร์ WebP ขนาดสูงสุด 1024 px,
ปิด simplify/join/instance/palette เพื่อคงโครงสร้างชิ้นส่วนผมไว้ (จำนวน node/mesh/primitive ตรงกับต้นฉบับ)

| ไฟล์ | ขนาด (ต้นฉบับ ~60 MB) |
|---|---|
| `base/female.glb`, `base/male.glb`, `base/nonbinary.glb` | ~11 MB |
| `hair/hair-cute-girl.glb`, `hair/hair-e1b9-multipart.glb`, `hair/hair-e1b9-single.glb`, `hair/hair-elf-boy.glb`, `hair/hair-tripo-58cc9f16.glb`, `hair/hair-tripo-959b8b8b.glb` | ~10–12 MB |
