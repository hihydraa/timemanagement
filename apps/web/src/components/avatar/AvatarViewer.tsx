import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  hairFit,
  bodyUrl,
  hairUrl,
  outfitUrl,
  type BodyId,
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

/**
 * ไฟล์ทรงผมมีชุดบอดี้ติดมาด้วย (เป็นตัวละครทั้งตัว) จึงตัด mesh ที่แตะพื้น (เท้า) ออก
 * (ใช้หลัง normalize แล้ว: เท้า y=0 ถึงหัว y=2 → ตัด mesh ที่ min.y < 0.2 ซึ่งเป็นบอดี้ ไม่ใช่ทรงผม)
 */
function keepHeadMeshes(root: THREE.Object3D, cutY: number) {
  const meshes: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });
  for (const m of meshes) {
    const b = new THREE.Box3().setFromObject(m, true);
    if (b.min.y < cutY) m.removeFromParent();
  }
}

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
    hairGroup: THREE.Group | null;
  } | null>(null);

  // สร้างฉาก/กล้อง/renderer ครั้งเดียว
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

    sceneRef.current = { scene, renderer, camera, main: null, hairGroup: null };
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

      // ตัวหลัก: ชุดเต็มตัวแทนตัวละคร (ถ้าเลือกชุด)
      const mainGltf = await load(outfit ? outfitUrl(outfit) : bodyUrl(body));
      if (!isCurrent()) return;
      if (ctx.main) ctx.scene.remove(ctx.main);
      if (ctx.hairGroup) ctx.scene.remove(ctx.hairGroup);
      ctx.hairGroup = null;
      const main = new THREE.Group();
      main.add(mainGltf.scene.clone(true));
      normalize(main);
      ctx.scene.add(main);
      ctx.main = main;

      // ทรงผม: ปรับขนาดไฟล์ทรงผมด้วยวิธีเดียวกับตัวละคร (สูง 2, เท้า y=0) แล้วตัดเฉพาะส่วนหัว
      if (!outfit && hair) {
        const hairGltf = await load(hairUrl(hair));
        if (!isCurrent()) return;
        const inner = new THREE.Group();
        inner.add(hairGltf.scene.clone(true));
        normalize(inner);
        keepHeadMeshes(inner, 0.2);
        const f = hairFit(body, hair);
        // จุดหมุนการปรับขนาดอยู่ที่ (0,1.5,0): p' = s*p + (1-s)*1.5 + dy
        const outer = new THREE.Group();
        outer.position.set(0, (1 - f.s) * 1.5 + f.dy, 0);
        outer.scale.setScalar(f.s);
        outer.add(inner);
        ctx.scene.add(outer);
        ctx.hairGroup = outer;
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

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} role="img" aria-label="ตัวละคร 3D" />;
}
