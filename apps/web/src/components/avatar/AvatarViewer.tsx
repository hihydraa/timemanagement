import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  HAIR_PARTS,
  HEAD_CUT_Y,
  OUTFIT_PARTS,
  hairFit,
  bodyUrl,
  hairUrl,
  outfitFit,
  outfitUrl,
  resolveOutfit,
  type BodyId,
  type Fit,
  type HairId,
  type OutfitId,
} from '../../lib/avatarModels';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();
const load = (url: string) => {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
};

/** ปรับขนาด/วางโมเดลให้สูง 2 หน่วย เท้าอยู่ y=0 กึ่งกลาง x,z=0 แล้วคืน matrix ที่ใช้ */
function normalize(root: THREE.Group): THREE.Matrix4 {
  // precise=true: ค่าตำแหน่งในไฟล์เป็นจำนวนเต็มแบบ normalized ต้องถอดค่าก่อนคำนวณขอบเขต
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2 / size.y;
  root.scale.setScalar(s);
  root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  root.updateMatrixWorld(true);
  return root.matrix.clone();
}

/** เก็บเฉพาะ mesh ที่ชื่ออยู่ในรายการ (ไฟล์ทรงผม/ชุดเป็นตัวละครทั้งตัวที่แยกเป็นชิ้น ชิ้นที่เหลือคือหัว/มือ/เท้าของต้นฉบับ) */
function keepParts(root: THREE.Object3D, names: readonly string[]) {
  const drop: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !names.includes(o.name)) drop.push(o);
  });
  for (const m of drop) m.removeFromParent();
}

/** วางชิ้นส่วน (ผม/เสื้อผ้า) ด้วยวิธีเดียวกับตัวละคร (สูง 2, เท้า y=0) แล้วปรับขนาด/ตำแหน่งรอบจุดหมุน (0,1.2,0) */
function placePart(gltf: GLTF, names: readonly string[], fit: Fit): THREE.Group {
  const inner = new THREE.Group();
  inner.add(gltf.scene.clone(true));
  normalize(inner); // ต้อง normalize ทั้งไฟล์ก่อนตัดชิ้น เพื่อให้สเกลเท่ากับตัวละครพื้นฐาน
  keepParts(inner, names);
  inner.traverse((o) => {
    const k = fit.partSx?.[o.name];
    if (k) o.scale.set(o.scale.x * k, o.scale.y, o.scale.z * k);
  });
  const outer = new THREE.Group();
  outer.position.set(0, (1 - fit.s) * PIVOT_Y + fit.dy, fit.dz ?? 0);
  outer.scale.set(fit.s * (fit.sx ?? 1), fit.s, fit.s * (fit.sz ?? fit.sx ?? 1));
  outer.add(inner);
  return outer;
}

const PIVOT_Y = 1.5;

/** ถ่ายภาพตัวละครจากกล้องมุมมาตรฐาน (ไม่ใช่มุมที่ผู้ใช้หมุนไว้) ครอปกึ่งกลางเป็นภาพโปร่งใส */
function takeSnapshot(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const snapCam = camera.clone();
  snapCam.position.set(0, 1.1, 4.2);
  snapCam.lookAt(0, 1, 0);
  snapCam.updateMatrixWorld(true);
  r.render(scene, snapCam); // ต้องดึงภาพทันทีในรอบเดียวกับที่ render ไม่งั้นบัฟเฟอร์ถูกล้าง
  const src = r.domElement;
  const h = src.height;
  const w = Math.min(src.width, Math.round(h * 0.75));
  const out = document.createElement('canvas');
  out.width = 240;
  out.height = Math.round((240 * h) / w);
  const g = out.getContext('2d');
  if (!g) return null;
  g.drawImage(src, Math.round((src.width - w) / 2), 0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/webp', 0.85);
}

/** แสดงตัวละคร 3D: ตัวละคร + ทรงผม, หรือชุดเต็มตัว (ชุดมีหัวของตัวเองจึงไม่ใส่ทรงผมซ้อน) */
export default function AvatarViewer({
  body,
  hair,
  outfit,
  onSnapshot,
}: {
  body: BodyId;
  hair: HairId | null;
  outfit: OutfitId | null;
  /** เรียกทุกครั้งที่โหลดตัวละครครบ พร้อมภาพนิ่ง (data URL) และตัวเลือกที่ถ่ายภาพนั้น */
  onSnapshot?: (
    dataUrl: string,
    sel: { body: BodyId; hair: HairId | null; outfit: OutfitId | null },
  ) => void;
}) {
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    main: THREE.Group | null;
    extras: THREE.Group[];
  } | null>(null);

  // สร้างฉาก/กล้อง/renderer ครั้งเดียว
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.localClippingEnabled = true; // ตัดหัวตัวละครพื้นฐานเมื่อใช้ผมที่มีหน้ามาด้วย
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    camera.position.set(0, 1.1, 4.2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.update();

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    sceneRef.current = { scene, renderer, camera, main: null, extras: [] };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  // เปลี่ยนตัวละคร/ชุด/ทรงผม
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ctx = sceneRef.current;
      if (!ctx) return;
      const isCurrent = () => !cancelled && sceneRef.current === ctx;

      // ตัวละครพื้นฐาน + ผม + เสื้อผ้า ประกอบแยกชิ้น (เลือกอิสระต่อกันเหมือนแต่งตัวในเกม)
      const hairDef = hair ? HAIR_PARTS[hair] : null;
      const outfitId = outfit ? resolveOutfit(outfit) : null;
      const [bodyGltf, hairGltf, outfitGltf] = await Promise.all([
        load(bodyUrl(body)),
        hair ? load(hairUrl(hair)) : null,
        outfitId ? load(outfitUrl(outfitId)) : null,
      ]);
      if (!isCurrent()) return;

      if (ctx.main) ctx.scene.remove(ctx.main);
      for (const g of ctx.extras) ctx.scene.remove(g);
      ctx.extras = [];

      const main = new THREE.Group();
      main.add(bodyGltf.scene.clone(true));
      normalize(main);
      // วัสดุถูกแชร์ระหว่าง clone จึงสร้างสำเนาก่อนใส่ระนาบตัด ไม่งั้นค่านี้ค้างไปยังครั้งถัดไป
      const cut = hairDef?.replacesHead
        ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), HEAD_CUT_Y)]
        : null;
      main.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.Material).clone();
        mat.clippingPlanes = cut;
        m.material = mat;
      });
      ctx.scene.add(main);
      ctx.main = main;

      if (outfitGltf && outfitId) {
        const g = placePart(outfitGltf, OUTFIT_PARTS[outfitId], outfitFit(body, outfitId));
        ctx.scene.add(g);
        ctx.extras.push(g);
      }
      if (hairGltf && hair && hairDef) {
        const g = placePart(hairGltf, hairDef.parts, hairFit(body, hair));
        ctx.scene.add(g);
        ctx.extras.push(g);
      }

      // ถ่ายภาพหลังเฟรมแรกที่วาดโมเดลครบ (เท็กซ์เจอร์อัปโหลดแล้ว)
      if (onSnapshotRef.current) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!isCurrent()) return;
            const url = takeSnapshot(ctx.renderer, ctx.scene, ctx.camera);
            if (url) onSnapshotRef.current?.(url, { body, hair, outfit });
          }),
        );
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [body, hair, outfit]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%' }}
      role="img"
      aria-label="ตัวละคร 3D"
    />
  );
}
