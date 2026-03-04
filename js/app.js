import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* =========================================================
   Scene
   ========================================================= */

const canvas   = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 1);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);

const CAM_START = new THREE.Vector3(0, 0, 12);
const CAM_END   = new THREE.Vector3(5, 4, 5);
camera.position.copy(CAM_START);

const controls       = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enableZoom    = false;
controls.enablePan     = false;
controls.enabled       = false;

/* =========================================================
   Lighting
   ========================================================= */

scene.add(new THREE.AmbientLight(0xffffff, 1.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 8, 4);
scene.add(dirLight);

/* =========================================================
   Rounded-rect plane geometry (shared)
   ========================================================= */

const CELL = 0.82;

function roundedPlaneGeo(w, h, r, segs = 6) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);

  const geo  = new THREE.ShapeGeometry(s, segs);
  const pos  = geo.attributes.position;
  const uv   = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  return geo;
}

const planeGeo = roundedPlaneGeo(CELL, CELL, 0.045);

/* =========================================================
   Cube data
   ========================================================= */

const HALF   = 1.5;
const OFFSET = 0.001;
const loader = new THREE.TextureLoader();
const cubeGrp = new THREE.Group();
scene.add(cubeGrp);

// Frosted glass core
const coreMat = new THREE.MeshPhysicalMaterial({
  color:              new THREE.Color(42 / 255, 42 / 255, 42 / 255),
  transmission:       1.0,
  roughness:          0.85,
  thickness:          1.5,
  ior:                1.5,
  attenuationColor:   new THREE.Color(42 / 255, 42 / 255, 42 / 255),
  attenuationDistance: 0.3,
  transparent:        true,
  opacity:            0,
});
const coreMesh = new THREE.Mesh(new THREE.BoxGeometry(2.99, 2.99, 2.99), coreMat);
coreMesh.renderOrder = -1;        // draw before image planes
coreMat.depthWrite   = false;     // never occlude tiles behind it
coreMesh.visible     = false;     // hidden until needed
cubeGrp.add(coreMesh);

const FACES = [
  { dir: [ 0, 0, 1], right: [ 1,0, 0], up: [0,1, 0], label: 'f' },
  { dir: [ 0, 0,-1], right: [-1,0, 0], up: [0,1, 0], label: 'b' },
  { dir: [ 1, 0, 0], right: [ 0,0,-1], up: [0,1, 0], label: 'r' },
  { dir: [-1, 0, 0], right: [ 0,0, 1], up: [0,1, 0], label: 'l' },
  { dir: [ 0, 1, 0], right: [ 1,0, 0], up: [0,0,-1], label: 'u' },
  { dir: [ 0,-1, 0], right: [ 1,0, 0], up: [0,0, 1], label: 'd' },
];

const planes = [];

FACES.forEach(face => {
  const normal = new THREE.Vector3(...face.dir);
  const right  = new THREE.Vector3(...face.right);
  const up     = new THREE.Vector3(...face.up);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const seed = `${face.label}${row}${col}`;
      const tex  = loader.load(`https://picsum.photos/seed/${seed}/300/300`);
      tex.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide,
        transparent: true, opacity: 0,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      const pos  = normal.clone().multiplyScalar(HALF + OFFSET)
        .add(right.clone().multiplyScalar(col - 1))
        .add(up.clone().multiplyScalar(1 - row));

      mesh.position.copy(pos);
      mesh.lookAt(pos.clone().add(normal));
      mesh.visible = false;

      cubeGrp.add(mesh);

      planes.push({
        mesh, mat,
        cubePos:   pos.clone(),
        cubeQuat:  mesh.quaternion.clone(),
        startPos:  new THREE.Vector3(),
        startQuat: new THREE.Quaternion(),   // identity → face camera
      });
    }
  }
});

/* =========================================================
   Start positions — scattered off-screen ring
   ========================================================= */

function srand(s) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

planes.forEach((p, i) => {
  const angle = srand(i * 31 + 17) * Math.PI * 2;
  const dist  = 9 + srand(i * 23 + 5) * 6;
  p.startPos.set(
    Math.cos(angle) * dist,
    Math.sin(angle) * dist,
    (srand(i * 7 + 11) - 0.5) * 4,
  );
});

/* =========================================================
   Stagger order — spatial cascade (front-top → back-bottom)
   ========================================================= */

const sorted = planes
  .map((p, i) => ({ i, score: p.cubePos.z * 1.5 + p.cubePos.y + p.cubePos.x * 0.5 }))
  .sort((a, b) => b.score - a.score);

const TILE_SPAN    = 0.22;          // each tile animates over 22 % of scroll
const INTRO_PAD    = 0.06;          // tiles don't start until intro fades
const STAGGER_END  = 1.0 - TILE_SPAN;
const STAGGER_RANGE = STAGGER_END - INTRO_PAD;

const tileStart = new Float32Array(planes.length);
sorted.forEach((item, order) => {
  tileStart[item.i] = INTRO_PAD + (order / (planes.length - 1)) * STAGGER_RANGE;
});

/* =========================================================
   Cube-group rotation targets
   ========================================================= */

const cubeQ0 = new THREE.Quaternion();
const cubeQ1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0.62, 0));
const CUBE_ROT_START = 0.12;
const CUBE_ROT_END   = 1.0;

/* =========================================================
   Virtual scroll
   ========================================================= */

const SCROLL_RANGE = 2000;
let scrollTarget  = 0;
let scrollCurrent = 0;

window.addEventListener('wheel', e => {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 40;
  if (e.deltaMode === 2) dy *= innerHeight;
  scrollTarget = Math.max(0, Math.min(SCROLL_RANGE, scrollTarget + dy));
}, { passive: true });

let touchY = 0;
window.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; });
window.addEventListener('touchmove', e => {
  const dy = touchY - e.touches[0].clientY;
  touchY = e.touches[0].clientY;
  scrollTarget = Math.max(0, Math.min(SCROLL_RANGE, scrollTarget + dy * 2.5));
});

/* =========================================================
   Easing helpers
   ========================================================= */

const easeOut3  = t => 1 - (1 - t) ** 3;
const easeIO3   = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2) ** 3 / 2;
const easeOut4  = t => 1 - (1 - t) ** 4;

/* =========================================================
   Intro DOM ref
   ========================================================= */

const introEl = document.getElementById('intro');

/* =========================================================
   Render loop
   ========================================================= */

const _q = new THREE.Quaternion();
let wasAssembled = false;

function tick() {
  requestAnimationFrame(tick);

  /* --- smooth scroll --- */
  scrollCurrent += (scrollTarget - scrollCurrent) * 0.055;
  const gT = Math.max(0, Math.min(1, scrollCurrent / SCROLL_RANGE));

  /* --- intro overlay --- */
  if (introEl) {
    const fade = Math.min(1, gT / 0.07);
    introEl.style.opacity   = 1 - fade;
    introEl.style.transform = `translateY(${-fade * 50}px) scale(${1 + fade * 0.08})`;
    if (fade >= 1) introEl.style.display = 'none';
    else           introEl.style.display = '';
  }

  /* --- per-tile animation --- */
  for (let i = 0; i < planes.length; i++) {
    const p  = planes[i];
    const rawT = Math.max(0, Math.min(1, (gT - tileStart[i]) / TILE_SPAN));

    if (rawT <= 0) { p.mesh.visible = false; continue; }

    p.mesh.visible = true;
    const t = easeOut4(rawT);

    // position
    p.mesh.position.lerpVectors(p.startPos, p.cubePos, t);

    // rotation
    p.mesh.quaternion.slerpQuaternions(p.startQuat, p.cubeQuat, t);

    // opacity — quick fade-in over first 25 %, then switch to opaque for correct depth
    const opacity = Math.min(1, rawT / 0.25);
    if (opacity >= 1 && p.mat.transparent) {
      p.mat.transparent = false;
      p.mat.opacity = 1;
    } else if (opacity < 1) {
      p.mat.transparent = true;
      p.mat.opacity = opacity;
    }

    // scale — pop from 0.4 → 1
    const sc = 0.4 + 0.6 * Math.min(1, rawT / 0.18);
    p.mesh.scale.setScalar(sc);
  }

  /* --- cube group rotation (delayed) --- */
  const rotT = easeIO3(
    Math.max(0, Math.min(1, (gT - CUBE_ROT_START) / (CUBE_ROT_END - CUBE_ROT_START)))
  );
  _q.slerpQuaternions(cubeQ0, cubeQ1, rotT);
  cubeGrp.quaternion.copy(_q);

  /* --- glass core (second half) --- */
  const coreOpacity = 0.4 * easeIO3(Math.max(0, Math.min(1, (gT - 0.45) / 0.55)));
  coreMesh.visible = coreOpacity > 0.001;
  coreMat.opacity  = coreOpacity;

  /* --- camera + orbit --- */
  const assembled = gT > 0.995;

  if (assembled) {
    if (!wasAssembled) {
      camera.position.copy(CAM_END);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.enabled = true;
    }
    controls.update();
  } else {
    if (wasAssembled) controls.enabled = false;
    camera.position.lerpVectors(CAM_START, CAM_END, easeIO3(gT));
    camera.lookAt(0, 0, 0);
  }
  wasAssembled = assembled;

  canvas.style.cursor = assembled ? 'grab' : 'default';
  renderer.render(scene, camera);
}

tick();

/* =========================================================
   Resize
   ========================================================= */

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
