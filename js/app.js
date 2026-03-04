import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _font = new FontFace('PP Neue Corp', 'url(fonts/PPNeueCorp-ExtendedUltrabold.otf)', { weight: '800' });
_font.load().then(f => { document.fonts.add(f); }).then(() => {

/* =========================================================
   Scene
   ========================================================= */

const canvas   = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xf5f4f0, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

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
   Three-point lighting
   ========================================================= */

scene.add(new THREE.AmbientLight(0xffffff, 0.9));

const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.1);
keyLight.position.set(5, 8, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xe0e8ff, 0.45);
fillLight.position.set(-4, 2, -3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
rimLight.position.set(0, -4, -5);
scene.add(rimLight);

/* =========================================================
   Rounded-rect sticker geometry (shared, 2D face)
   ========================================================= */

function roundedPlaneGeo(w, h, r, segs = 8) {
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

  const geo = new THREE.ShapeGeometry(s, segs);
  const pos = geo.attributes.position;
  const uv  = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  return geo;
}

/* =========================================================
   Cubie dimensions — like a real Rubik's cube
   ========================================================= */

const CELL         = 0.92;
const DEPTH        = 0.15;
const CUBIE_R      = 0.035;
const STICKER_SIZE = 0.78;
const STICKER_R    = 0.035;
const HALF         = 1.5;

/* =========================================================
   Shared geometries & materials
   ========================================================= */

const cubieGeo   = new RoundedBoxGeometry(CELL, CELL, DEPTH, 3, CUBIE_R);
const stickerGeo = roundedPlaneGeo(STICKER_SIZE, STICKER_SIZE, STICKER_R);

const cubieBodyMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a, roughness: 0.55, metalness: 0.05,
});

const loader  = new THREE.TextureLoader();
const cubeGrp = new THREE.Group();
scene.add(cubeGrp);

/* =========================================================
   Title — "RUBIKS" (PP Frama Black, static full-screen)
   ========================================================= */

const textGrp = new THREE.Group();
scene.add(textGrp);

function srand(s) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const FONT = '"PP Neue Corp"';

function makeLetterPlane(letter, unitHeight) {
  const res = unitHeight > 3 ? 1024 : 512;

  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 10;
  const tctx = tmp.getContext('2d');
  tctx.font = `800 ${res}px ${FONT}`;
  const m = tctx.measureText(letter);

  const ascent  = m.actualBoundingBoxAscent  || res * 0.72;
  const descent = m.actualBoundingBoxDescent || res * 0.02;
  const bboxL   = m.actualBoundingBoxLeft    || 0;
  const bboxR   = m.actualBoundingBoxRight   || m.width;

  const textH  = ascent + descent;
  const textW  = bboxL + bboxR;
  const margin = res * 0.02;
  const cW = Math.ceil(textW + margin * 2);
  const cH = Math.ceil(textH + margin * 2);

  const c = document.createElement('canvas');
  c.width  = cW;
  c.height = cH;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.font = `800 ${res}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(letter, margin + bboxL, margin + ascent);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const planeH = unitHeight;
  const planeW = planeH * (cW / cH);
  const geo    = new THREE.PlaneGeometry(planeW, planeH);

  return { tex, geo, planeW, planeH };
}

const titleMeshes = [];

/* --- "RUBIKS" — one row, auto-sized to fill viewport --- */
{
  const TITLE = 'RUBIKS'.split('');

  const _mc = document.createElement('canvas');
  _mc.width = _mc.height = 10;
  const _mx = _mc.getContext('2d');
  _mx.font = `800 512px ${FONT}`;

  const aspects = TITLE.map(ch => {
    const m = _mx.measureText(ch);
    const asc = m.actualBoundingBoxAscent  || 369;
    const dsc = m.actualBoundingBoxDescent || 10;
    const bL  = m.actualBoundingBoxLeft    || 0;
    const bR  = m.actualBoundingBoxRight   || m.width;
    const mg  = 512 * 0.02;
    return (bL + bR + mg * 2) / (asc + dsc + mg * 2);
  });

  const sumA  = aspects.reduce((s, a) => s + a, 0);
  const _vFov = camera.fov * Math.PI / 180;
  const _visH = 2 * CAM_START.z * Math.tan(_vFov / 2);
  const _visW = _visH * camera.aspect;

  const CHAR_H = Math.min(_visH * 0.95, (_visW * 0.98) / sumA);

  const planes = TITLE.map(ch => makeLetterPlane(ch, CHAR_H));
  const totalW = planes.reduce((s, p) => s + p.planeW, 0);
  let cx = -totalW / 2;

  planes.forEach((p) => {
    cx += p.planeW / 2;

    const mat = new THREE.MeshBasicMaterial({
      map: p.tex, transparent: true, alphaTest: 0.1,
      side: THREE.FrontSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.position.set(cx, 0, 0);
    textGrp.add(mesh);
    titleMeshes.push(mesh);

    cx += p.planeW / 2;
  });
}

/* =========================================================
   Core — dark rounded box visible through gaps
   ========================================================= */

const coreMat = new THREE.MeshStandardMaterial({
  color: 0x111111, roughness: 0.85, metalness: 0.05,
});
const coreMesh = new THREE.Mesh(
  new RoundedBoxGeometry(2.82, 2.82, 2.82, 2, 0.08),
  coreMat,
);
coreMesh.visible = false;
cubeGrp.add(coreMesh);

/* =========================================================
   Build 54 cubies (body + sticker each)
   ========================================================= */

const FACES = [
  { dir: [ 0, 0, 1], right: [ 1,0, 0], up: [0,1, 0], label: 'f' },
  { dir: [ 0, 0,-1], right: [-1,0, 0], up: [0,1, 0], label: 'b' },
  { dir: [ 1, 0, 0], right: [ 0,0,-1], up: [0,1, 0], label: 'r' },
  { dir: [-1, 0, 0], right: [ 0,0, 1], up: [0,1, 0], label: 'l' },
  { dir: [ 0, 1, 0], right: [ 1,0, 0], up: [0,0,-1], label: 'u' },
  { dir: [ 0,-1, 0], right: [ 1,0, 0], up: [0,0, 1], label: 'd' },
];

const cubies = [];

FACES.forEach(face => {
  const normal = new THREE.Vector3(...face.dir);
  const right  = new THREE.Vector3(...face.right);
  const up     = new THREE.Vector3(...face.up);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const seed = `${face.label}${row}${col}`;
      const tex  = loader.load(`https://picsum.photos/seed/${seed}/300/300`);
      tex.colorSpace = THREE.SRGBColorSpace;

      const stickerMat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.35, metalness: 0.02,
      });

      const cubie = new THREE.Group();
      cubie.add(new THREE.Mesh(cubieGeo, cubieBodyMat));

      const sticker = new THREE.Mesh(stickerGeo, stickerMat);
      sticker.position.z = DEPTH / 2 + 0.001;
      cubie.add(sticker);

      const pos = normal.clone().multiplyScalar(HALF)
        .add(right.clone().multiplyScalar(col - 1))
        .add(up.clone().multiplyScalar(1 - row));

      cubie.position.copy(pos);
      cubie.lookAt(pos.clone().add(normal));
      cubie.visible = false;

      cubeGrp.add(cubie);

      cubies.push({
        mesh:      cubie,
        cubePos:   pos.clone(),
        cubeQuat:  cubie.quaternion.clone(),
        startPos:  new THREE.Vector3(),
        startQuat: new THREE.Quaternion(),
      });
    }
  }
});

/* =========================================================
   Start positions — scattered off-screen ring
   ========================================================= */

cubies.forEach((c, i) => {
  const angle = srand(i * 31 + 17) * Math.PI * 2;
  const dist  = 9 + srand(i * 23 + 5) * 6;
  c.startPos.set(
    Math.cos(angle) * dist,
    Math.sin(angle) * dist,
    (srand(i * 7 + 11) - 0.5) * 4,
  );
});

/* =========================================================
   Stagger — spatial cascade (front-top → back-bottom)
   ========================================================= */

const sorted = cubies
  .map((c, i) => ({ i, score: c.cubePos.z * 1.5 + c.cubePos.y + c.cubePos.x * 0.5 }))
  .sort((a, b) => b.score - a.score);

const TILE_SPAN     = 0.22;
const INTRO_PAD     = 0.12;
const STAGGER_END   = 1.0 - TILE_SPAN;
const STAGGER_RANGE = STAGGER_END - INTRO_PAD;

const tileStart = new Float32Array(cubies.length);
sorted.forEach((item, order) => {
  tileStart[item.i] = INTRO_PAD + (order / (cubies.length - 1)) * STAGGER_RANGE;
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

const SCROLL_RANGE = 2400;
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
   Easing
   ========================================================= */

const easeOut3 = t => 1 - (1 - t) ** 3;
const easeIO3  = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2) ** 3 / 2;
const easeOut4 = t => 1 - (1 - t) ** 4;
const easeOutBack = t => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/* =========================================================
   Intro DOM (scroll-cue only)
   ========================================================= */

const introEl = document.getElementById('intro');
const hintEl  = document.getElementById('hint');

/* =========================================================
   Render loop
   ========================================================= */

const _q  = new THREE.Quaternion();
const _v  = new THREE.Vector3();
let wasAssembled = false;

function tick() {
  requestAnimationFrame(tick);

  const time = performance.now() / 1000;

  /* smooth scroll */
  scrollCurrent += (scrollTarget - scrollCurrent) * 0.045;
  const gT = Math.max(0, Math.min(1, scrollCurrent / SCROLL_RANGE));

  /* ---- Title — static, hide when cube arrives ---- */
  textGrp.visible = gT < 0.10;

  /* ---- Scroll-cue fade ---- */
  if (introEl) {
    const cueFade = Math.min(1, Math.max(0, (gT - 0.08) / 0.04));
    introEl.style.opacity = String(1 - cueFade);
    if (cueFade >= 1) introEl.style.display = 'none';
    else              introEl.style.display = '';
  }

  /* ---- Per-cubie animation — scale + fly ---- */
  for (let i = 0; i < cubies.length; i++) {
    const c    = cubies[i];
    const rawT = Math.max(0, Math.min(1, (gT - tileStart[i]) / TILE_SPAN));

    if (rawT <= 0) { c.mesh.visible = false; continue; }

    c.mesh.visible = true;
    const t = easeOut4(rawT);

    c.mesh.position.lerpVectors(c.startPos, c.cubePos, t);
    c.mesh.quaternion.slerpQuaternions(c.startQuat, c.cubeQuat, t);

    c.mesh.scale.setScalar(easeOut3(Math.min(1, rawT / 0.12)));
  }

  /* cube group rotation */
  const rotT = easeIO3(
    Math.max(0, Math.min(1, (gT - CUBE_ROT_START) / (CUBE_ROT_END - CUBE_ROT_START)))
  );
  _q.slerpQuaternions(cubeQ0, cubeQ1, rotT);
  cubeGrp.quaternion.copy(_q);

  /* dark core scales in */
  const coreT = easeOut3(Math.max(0, Math.min(1, (gT - 0.10) / 0.30)));
  coreMesh.visible = coreT > 0.01;
  if (coreMesh.visible) coreMesh.scale.setScalar(coreT);

  /* camera + orbit */
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
  if (hintEl) hintEl.classList.toggle('visible', assembled);
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

}); /* end document.fonts.ready */
