/*  Escuadra, compás y G en relieve tallado — R∴L∴S∴ Cibeles N° 176
 *  Se carga de forma diferida y solo si el equipo lo soporta.
 *  Si algo falla, el SVG de póster se queda en su lugar y nadie se entera.
 *
 *  v3 (relieve): la pieza se "talla" en un mapa de alturas pintado por código
 *  (compás con arista central, escuadra con filete y gallones, y la G sola al
 *  centro), que desplaza una malla densa y da sus normales.
 *  La luz rasante barre la talla al aparecer; en reposo la pieza oscila poco y
 *  sigue al puntero, como una placa colgada.                                   */

import * as THREE from './three.module.min.js';

const canvas = document.getElementById('emblema3d');
const poster = document.querySelector('.emblem .poster');
if (!canvas) throw new Error('sin lienzo');

const ORO = 0xffc85e;   // reflectancia del oro (no el #c9a227 de la paleta: lo apaga)

/* ---------- render ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0;

const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camara.position.set(0, 0, 7.4);

/* ---------- entorno HDR ----------
   El oro sólo devuelve lo que tiene alrededor y necesita valores por encima de
   blanco (Float) para brillar. Paneles rectangulares + cirios, sobre penumbra vino. */
function entorno() {
  const W = 256, H = 128, d = new Float32Array(W * H * 4);
  const paneles = [
    { x: .22, y: .28, w: .05, h: .22, c: [1, .95, .86], i: 9 },
    { x: .50, y: .10, w: .22, h: .04, c: [1, .93, .80], i: 6 },
    { x: .78, y: .34, w: .04, h: .18, c: [1, .80, .52], i: 4 },
  ];
  const focos = [
    { x: .06, y: .56, r: .22, c: [.9, .42, .52], i: 1.0 },
    { x: .52, y: .95, r: .34, c: [.8, .24, .34], i: .8 },
    { x: .18, y: .09, r: .04, c: [1, .97, .90], i: 30 },
    { x: .64, y: .12, r: .035, c: [1, .93, .80], i: 24 },
  ];
  const sm = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    let r = .02, g = .008, b = .011;
    for (const p of paneles) {
      const du = Math.min(Math.abs(u - p.x), 1 - Math.abs(u - p.x));
      const k = (1 - sm(p.w * .6, p.w, du)) * (1 - sm(p.h * .6, p.h, Math.abs(v - p.y))) * p.i;
      r += p.c[0] * k; g += p.c[1] * k; b += p.c[2] * k;
    }
    for (const f of focos) {
      const du = Math.min(Math.abs(u - f.x), 1 - Math.abs(u - f.x)) * 2;
      const q = Math.hypot(du, v - f.y) / f.r;
      if (q < 1) { const k = (1 - q) * (1 - q) * f.i; r += f.c[0] * k; g += f.c[1] * k; b += f.c[2] * k; }
    }
    const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 1;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace; t.needsUpdate = true;
  return t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
escena.environment = pmrem.fromEquirectangular(entorno()).texture;
pmrem.dispose();

/* Luz rasante: la talla se lee por sus sombras. Es la protagonista. */
const rasante = new THREE.DirectionalLight(0xfff0d8, 2.6); escena.add(rasante); escena.add(rasante.target);
const relleno = new THREE.DirectionalLight(0xffc27a, 0.45); relleno.position.set(3.5, -2, 3); escena.add(relleno);

/* ---------- talla: mapa de alturas ----------
   Diseño en un lienzo de 1000 x 1100; el mapa real es más chico (ESC) para que
   cargue rápido. Cada capa se rasteriza como máscara, se suaviza (bisel) y se
   suma (relieve) o se resta (grabado) a la altura.                            */
const DW = 1000, DH = 1100, ESC = matchMedia('(max-width: 820px)').matches ? 0.42 : 0.52;
const MW = Math.round(DW * ESC), MH = Math.round(DH * ESC);
const N = MW * MH;
const altura = new Float32Array(N), silueta = new Float32Array(N);
const lienzo = document.createElement('canvas'); lienzo.width = MW; lienzo.height = MH;
const cx = lienzo.getContext('2d', { willReadFrequently: true });

function mascara(dibujar) {
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, MW, MH);
  cx.setTransform(ESC, 0, 0, ESC, 0, 0);
  cx.fillStyle = cx.strokeStyle = '#fff';
  cx.lineCap = cx.lineJoin = 'round';
  dibujar(cx);
  const px = cx.getImageData(0, 0, MW, MH).data, m = new Float32Array(N);
  for (let i = 0; i < N; i++) m[i] = px[i * 4 + 3] / 255;
  return m;
}
// desenfoque de caja separable, 2 pasadas ≈ gaussiano
function suavizar(m, r) {
  r = Math.max(1, Math.round(r * ESC));
  const tmp = new Float32Array(N);
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let y = 0; y < MH; y++) {
      let s = 0; const o = y * MW;
      for (let x = -r; x <= r; x++) s += m[o + Math.min(MW - 1, Math.max(0, x))];
      for (let x = 0; x < MW; x++) {
        tmp[o + x] = s / (2 * r + 1);
        s += m[o + Math.min(MW - 1, x + r + 1)] - m[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < MW; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(MH - 1, Math.max(0, y)) * MW + x];
      for (let y = 0; y < MH; y++) {
        m[y * MW + x] = s / (2 * r + 1);
        s += tmp[Math.min(MH - 1, y + r + 1) * MW + x] - tmp[Math.max(0, y - r) * MW + x];
      }
    }
  }
  return m;
}
const elevar  = (nivel, bisel, dib) => { const m = suavizar(mascara(dib), bisel); for (let i = 0; i < N; i++) altura[i] = Math.max(altura[i], m[i] * nivel); return m; };
const sumar   = (h, bisel, dib)     => { const m = suavizar(mascara(dib), bisel); for (let i = 0; i < N; i++) altura[i] += m[i] * h; };
const grabar  = (h, bisel, dib)     => { const m = suavizar(mascara(dib), bisel); for (let i = 0; i < N; i++) altura[i] -= m[i] * h; };
const contorno = dib => { const m = mascara(dib); for (let i = 0; i < N; i++) silueta[i] = Math.max(silueta[i], m[i]); };

/* geometría del emblema (en unidades de diseño) */
const PIV = [500, 160], CAB = 92;                     // cabeza del compás
const PUNTA_I = [118, 985], PUNTA_D = [882, 985];     // puntas del compás
const VERT = [500, 1035], BRAZO = 118;                // escuadra: vértice exterior y ancho
const ALA_I = [-10, 525], ALA_D = [1010, 525];        // extremos de la escuadra (salen del marco)
const pierna = (p, ancho0, ancho1) => {
  const dx = p[0] - PIV[0], dy = p[1] - PIV[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  return [[PIV[0] + nx * ancho0, PIV[1] + ny * ancho0], [p[0] + nx * ancho1, p[1] + ny * ancho1],
          [p[0] - nx * ancho1, p[1] - ny * ancho1], [PIV[0] - nx * ancho0, PIV[1] - ny * ancho0]];
};
const poli = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
const linea = (c, a, b, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
// escuadra como dos brazos con canto exterior recto
const brazoI = [ALA_I, VERT, [VERT[0], VERT[1] - BRAZO * 1.414], [ALA_I[0] + BRAZO * 1.414, ALA_I[1]]];
const brazoD = [ALA_D, VERT, [VERT[0], VERT[1] - BRAZO * 1.414], [ALA_D[0] - BRAZO * 1.414, ALA_D[1]]];

/* la G, sola en el centro */
const G = c => { c.font = 'bold 300px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', 500, 640); };

/* silueta (lo que existe de la pieza) */
function dibujarSilueta(c) {
  G(c); poli(c, brazoI); poli(c, brazoD);
  poli(c, pierna(PUNTA_I, 60, 17)); poli(c, pierna(PUNTA_D, 60, 17));
  c.beginPath(); c.arc(PIV[0], PIV[1], CAB, 0, 7); c.fill();
}
contorno(dibujarSilueta);

/* 3) la G, alta y biselada, con un grabado interior que le da filo */
elevar(0.66, 5, G);
grabar(0.07, 2, c => { c.lineWidth = 5; c.font = 'bold 300px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('G', 500, 640); });

/* 4) escuadra: cuerpo, filete interior grabado, gallones al pie */
elevar(0.58, 4, c => { poli(c, brazoI); poli(c, brazoD); });
grabar(0.08, 2, c => {
  // filete paralelo al canto interior
  const f = BRAZO * 1.414 - 38;
  linea(c, [ALA_I[0] + f, ALA_I[1]], [VERT[0], VERT[1] - f], 6);
  linea(c, [ALA_D[0] - f, ALA_D[1]], [VERT[0], VERT[1] - f], 6);
});
sumar(0.13, 2, c => {
  // gallones: fila de hojas en relieve a lo largo de cada brazo, cerca del canto exterior
  for (const lado of [-1, 1]) for (let i = 1; i < 17; i++) {
    const k = i / 17, x = VERT[0] + lado * (ALA_D[0] - VERT[0]) * k, y = VERT[1] + (ALA_D[1] - VERT[1]) * k;
    c.save(); c.translate(x - lado * 22, y - 22); c.rotate(lado * Math.PI / 4);
    c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(15, 0, 0, 26); c.quadraticCurveTo(-15, 0, 0, -26); c.fill(); c.restore();
  }
});
grabar(0.06, 1, c => {
  for (const lado of [-1, 1]) for (let i = 1; i < 17; i++) {
    const k = i / 17, x = VERT[0] + lado * (ALA_D[0] - VERT[0]) * k, y = VERT[1] + (ALA_D[1] - VERT[1]) * k;
    c.save(); c.translate(x - lado * 22, y - 22); c.rotate(lado * Math.PI / 4);
    c.lineWidth = 3; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 20); c.stroke(); c.restore();
  }
});

/* 5) piernas del compás: cuerpo + arista central (sección en tejado) */
elevar(0.74, 4, c => { poli(c, pierna(PUNTA_I, 60, 17)); poli(c, pierna(PUNTA_D, 60, 17)); });
sumar(0.16, 14, c => { linea(c, PIV, PUNTA_I, 22); linea(c, PIV, PUNTA_D, 22); });
// filetes a lo largo de cada pierna
grabar(0.05, 1, c => { for (const P of [PUNTA_I, PUNTA_D]) { const q = pierna(P, 44, 11); linea(c, q[0], q[1], 4); linea(c, q[3], q[2], 4); } });

/* 6) cabeza: disco, anillos grabados, botón central */
elevar(0.8, 6, c => { c.beginPath(); c.arc(PIV[0], PIV[1], CAB, 0, 7); c.fill(); });
grabar(0.1, 2, c => { c.lineWidth = 7; for (const r of [70, 52]) { c.beginPath(); c.arc(PIV[0], PIV[1], r, 0, 7); c.stroke(); } });
sumar(0.1, 4, c => { c.beginPath(); c.arc(PIV[0], PIV[1], 30, 0, 7); c.fill(); });
grabar(0.06, 1, c => { c.lineWidth = 4; c.beginPath(); c.arc(PIV[0], PIV[1], 16, 0, 7); c.stroke(); });

/* texturas derivadas: normales finas, cavidades (oclusión) y recorte */
function texturaDesde(rgba) {
  const t = new THREE.DataTexture(rgba, MW, MH, THREE.RGBAFormat);
  t.flipY = true; t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true; return t;
}
/* Recorte en alta resolución, dibujado directo de los vectores: el canto sale limpio
   (antes salía de la máscara chica y con filtro 'nearest', de ahí el borde aserrado). */
function recorteNitido() {
  const R = 2, c = document.createElement('canvas'); c.width = DW * R / 1.0 | 0; c.height = DH * R | 0;
  const k = c.getContext('2d'); k.setTransform(R, 0, 0, R, 0, 0); k.fillStyle = '#fff'; k.lineJoin = 'round';
  dibujarSilueta(k);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
const nrm = new Uint8Array(N * 4), ao = new Uint8Array(N * 4), alfa = new Uint8Array(N * 4);
{
  const fuerza = 6;
  const amplia = suavizar(Float32Array.from(altura), 14);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    const h = (xx, yy) => altura[Math.min(MH - 1, Math.max(0, yy)) * MW + Math.min(MW - 1, Math.max(0, xx))];
    const dx = (h(x + 1, y) - h(x - 1, y)) * fuerza, dy = (h(x, y + 1) - h(x, y - 1)) * fuerza;
    const l = Math.hypot(dx, dy, 1);
    nrm[i * 4] = (-dx / l * .5 + .5) * 255; nrm[i * 4 + 1] = (dy / l * .5 + .5) * 255; nrm[i * 4 + 2] = (1 / l * .5 + .5) * 255; nrm[i * 4 + 3] = 255;
    const cav = Math.min(1, Math.max(0, (amplia[i] - altura[i]) * 4));   // hondonadas = más oscuras
    const v = (1 - cav * 0.75) * 255;
    ao[i * 4] = ao[i * 4 + 1] = ao[i * 4 + 2] = v; ao[i * 4 + 3] = 255;
    const a = silueta[i] * 255; alfa[i * 4] = alfa[i * 4 + 1] = alfa[i * 4 + 2] = a; alfa[i * 4 + 3] = 255;
  }
}

/* ---------- malla ---------- */
const ALTO = 3.75, ANCHO = ALTO * DW / DH, PROF = 0.07;   // el relieve lo dibuja el mapa de normales; la malla casi plana evita cantos aserrados
const SX = 220, SY = Math.round(SX * DH / DW);
const geo = new THREE.PlaneGeometry(ANCHO, ALTO, SX, SY);
{
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const muestra = (u, v) => {
    const x = Math.min(MW - 1, Math.max(0, u * (MW - 1))), y = Math.min(MH - 1, Math.max(0, (1 - v) * (MH - 1)));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, x1 = Math.min(MW - 1, x0 + 1), y1 = Math.min(MH - 1, y0 + 1);
    const a = altura[y0 * MW + x0], b = altura[y0 * MW + x1], c = altura[y1 * MW + x0], d = altura[y1 * MW + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  for (let i = 0; i < pos.count; i++) pos.setZ(i, muestra(uv.getX(i), uv.getY(i)) * PROF);
  geo.computeVertexNormals();
}
const material = new THREE.MeshPhysicalMaterial({
  color: ORO, metalness: 1, roughness: 0.4,
  normalMap: texturaDesde(nrm), normalScale: new THREE.Vector2(1.25, 1.25),
  aoMap: texturaDesde(ao), aoMapIntensity: 1,
  alphaMap: recorteNitido(), alphaTest: 0.5, alphaToCoverage: true,
  clearcoat: 0.25, clearcoatRoughness: 0.2,
  envMapIntensity: 0.9, side: THREE.DoubleSide
});
const placa = new THREE.Mesh(geo, material);
const emblema = new THREE.Group();
emblema.add(placa);
emblema.position.y = -0.04;
escena.add(emblema);

/* ---------- medidas ---------- */
canvas.classList.add('activo');
const TOPE_DPR = matchMedia('(max-width: 820px)').matches ? 1.75 : 2;
function medir() {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TOPE_DPR));
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  camara.updateProjectionMatrix();
}
medir();
addEventListener('resize', medir, { passive: true });

/* ---------- puntero ---------- */
const objetivo = { x: 0, y: 0 }, actual = { x: 0, y: 0 };
if (matchMedia('(pointer: fine)').matches) {
  addEventListener('pointermove', e => {
    objetivo.x = (e.clientX / innerWidth - 0.5) * 2;
    objetivo.y = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* ---------- ciclo ---------- */
let inicio = null, raf = 0, visible = true, transcurrido = 0, ultimo = 0;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const tramo = (t, a, b) => Math.min(Math.max((t - a) / (b - a), 0), 1);

function cuadro(ahora) {
  raf = requestAnimationFrame(cuadro);
  if (inicio === null) { inicio = ahora; ultimo = ahora; }
  const dt = Math.min((ahora - ultimo) / 1000, 0.05);
  transcurrido += dt; ultimo = ahora;
  const t = transcurrido, s = (ahora - inicio) / 1000;

  // aparición (tiempo real, igual en un equipo lento)
  const luz = easeOut(tramo(s, 0, 2.2));
  renderer.toneMappingExposure = 1.15 * luz;
  canvas.style.opacity = luz.toFixed(3);
  if (poster && luz > 0.25) poster.style.opacity = String(Math.max(0, 1 - (luz - 0.25) / 0.5));

  // la luz rasante barre la talla de derecha a izquierda al entrar y luego respira
  const barrido = easeOut(tramo(s, 0.2, 3.2));
  const ang = 0.15 + (1 - barrido) * 2.4 + Math.sin(t * 0.3) * 0.25;   // ángulo alrededor de la pieza
  rasante.position.set(Math.cos(ang + 2.0) * 6, Math.sin(ang + 2.0) * 6, 2.2);

  // reposo: oscilación corta (es una placa, de canto no tiene grosor) + puntero
  actual.x += (objetivo.x - actual.x) * Math.min(1, dt * 3);
  actual.y += (objetivo.y - actual.y) * Math.min(1, dt * 3);
  const entrada = easeOut(tramo(s, 0, 2.8));
  emblema.rotation.y = -0.5 * (1 - entrada) + Math.sin(t * 0.32) * 0.2 * entrada + actual.x * 0.18;
  emblema.rotation.x = Math.sin(t * 0.22) * 0.05 - 0.02 + actual.y * 0.12;
  emblema.position.y = -0.04 + Math.sin(t * 0.45) * 0.035;
  escena.environmentRotation.y = t * 0.1;

  renderer.render(escena, camara);
}

function arrancar() { if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(cuadro); } }
function parar()    { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
arrancar();

new IntersectionObserver(es => {
  visible = es[0].isIntersecting;
  visible && !document.hidden ? arrancar() : parar();
}, { threshold: 0 }).observe(canvas);
document.addEventListener('visibilitychange', () => {
  !document.hidden && visible ? arrancar() : parar();
});
