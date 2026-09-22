/*  Escuadra y compás en oro pulido — R∴L∴S∴ Cibeles N° 176
 *  Se carga de forma diferida y solo si el equipo lo soporta.
 *  Si algo falla, el SVG de póster se queda en su lugar y nadie se entera.        */

import * as THREE from './three.module.min.js';

const canvas = document.getElementById('emblema3d');
const poster = document.querySelector('.emblem .poster');
if (!canvas) throw new Error('sin lienzo');

/* En un flujo PBR el color base de un metal ES su reflectancia, no su tinte
   aparente. El oro físico ronda (1.00, 0.77, 0.34); usar el #c9a227 de la
   paleta lo apaga hasta parecer bronce sucio. El tono vino de la página
   vuelve por el entorno, que es lo que la pieza refleja.                    */
const ORO       = 0xffc85e;
const ORO_CLARO = 0xffdb92;

/* ---------- render ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace     = THREE.SRGBColorSpace;
renderer.toneMapping          = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure  = 0;              // arranca a oscuras: la pieza emerge

const escena  = new THREE.Scene();
const camara  = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camara.position.set(0, 0, 7.4);

/* ---------- entorno HDR ----------
   Un metal no tiene color propio: sólo devuelve lo que hay alrededor. Por eso
   el realismo se juega aquí y no en las luces. Y tiene que ser HDR: un mapa
   armado sobre un canvas es LDR, tope 1.0, y sin valores por encima de blanco
   el oro nunca saca reflejos — se queda en bronce apagado. Esto pinta un
   recinto en penumbra a mano, en punto flotante, con cirios de intensidad 30–45
   que son los que trazan el filo brillante al girar la pieza.               */
function entorno() {
  const W = 256, H = 128;
  const datos = new Float32Array(W * H * 4);
  const focos = [
    { x: .27, y: .17, r: .30, c: [1, .94, .82], i: 13 },   // foco principal, alto
    { x: .70, y: .26, r: .24, c: [1, .80, .52], i: 4.5 },  // segundo foco ámbar
    { x: .93, y: .44, r: .20, c: [1, .70, .42], i: 2.0 },  // rebote del muro
    { x: .06, y: .54, r: .22, c: [.9, .42, .52], i: 1.1 }, // rebote del muro opuesto
    { x: .52, y: .95, r: .34, c: [.8, .24, .34], i: .9 },  // piso vino
    { x: .18, y: .09, r: .055, c: [1, .97, .90], i: 45 },  // cirios
    { x: .43, y: .07, r: .045, c: [1, .96, .88], i: 38 },
    { x: .64, y: .12, r: .050, c: [1, .93, .80], i: 30 },
    { x: .86, y: .10, r: .040, c: [1, .95, .85], i: 26 },
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      let r = .014, g = .005, b = .009;                     // penumbra base
      for (const f of focos) {
        const dx = Math.abs(u - f.x);
        const du = Math.min(dx, 1 - dx) * 2;                // la horizontal da la vuelta
        const d  = Math.hypot(du, v - f.y) / f.r;
        if (d < 1) { const k = (1 - d) * (1 - d) * f.i; r += f.c[0] * k; g += f.c[1] * k; b += f.c[2] * k; }
      }
      const i = (y * W + x) * 4;
      datos[i] = r; datos[i + 1] = g; datos[i + 2] = b; datos[i + 3] = 1;
    }
  }
  const t = new THREE.DataTexture(datos, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.mapping    = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;                // ya viene en lineal
  t.needsUpdate = true;
  return t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
const mapa  = pmrem.fromEquirectangular(entorno()).texture;
escena.environment = mapa;
pmrem.dispose();

const luzClave = new THREE.DirectionalLight(0xfff1d6, 0.9); luzClave.position.set( 3.2,  4.2,  5.0); escena.add(luzClave);
const luzBorde = new THREE.DirectionalLight(0xffc768, 0.7); luzBorde.position.set(-4.0, -1.2, -2.6); escena.add(luzBorde);

/* ---------- materiales ---------- */
const pulido = new THREE.MeshStandardMaterial({ color: ORO,       metalness: 1, roughness: 0.12, envMapIntensity: 1.0 });
const satin  = new THREE.MeshStandardMaterial({ color: 0xeaad45,  metalness: 1, roughness: 0.28, envMapIntensity: 0.95 });
const brillo = new THREE.MeshStandardMaterial({ color: ORO_CLARO, metalness: 1, roughness: 0.06, envMapIntensity: 1.15 });

/* ---------- piezas ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const EJE_Y = V(0, 1, 0), EJE_Z = V(0, 0, 1);

// vara cónica: las piernas del compás
function vara(a, b, r1, r2, mat) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, L, 26), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(EJE_Y, d.clone().normalize());
  return m;
}
// listón de sección rectangular con canto biselado: los brazos de la escuadra.
// El bisel es lo que separa un metal creíble de una caja de videojuego: es
// donde nace el reflejo lineal que el ojo lee como "borde maquinado".
function liston(a, b, ancho, grueso, mat) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const hw = ancho / 2, hg = grueso / 2, r = Math.min(hw, hg) * 0.5;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hg);
  s.lineTo( hw - r, -hg); s.quadraticCurveTo( hw, -hg,  hw, -hg + r);
  s.lineTo( hw,  hg - r); s.quadraticCurveTo( hw,  hg,  hw - r,  hg);
  s.lineTo(-hw + r,  hg); s.quadraticCurveTo(-hw,  hg, -hw,  hg - r);
  s.lineTo(-hw, -hg + r); s.quadraticCurveTo(-hw, -hg, -hw + r, -hg);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: L, bevelEnabled: true, bevelSize: 0.013, bevelThickness: 0.013,
    bevelSegments: 2, curveSegments: 6
  });
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(EJE_Z, d.clone().normalize());
  return m;
}

const emblema = new THREE.Group();

/* ESCUADRA — ángulo recto abajo, brazos a 45°, ligeramente detrás */
const zE = -0.22;
const vertice = V(0, -1.52, zE);
[[-1.52, 0.0], [1.52, 0.0]].forEach(([x, y]) => {
  emblema.add(liston(vertice, V(x, y, zE), 0.28, 0.16, satin));
});
emblema.add(new THREE.Mesh(new THREE.SphereGeometry(0.145, 22, 18), satin).translateY(-1.52).translateZ(zE));

/* COMPÁS — pivote arriba, piernas al frente */
const zC = 0.22;
const pivote = V(0, 1.52, zC);
[[-1.06, -1.12], [1.06, -1.12]].forEach(([x, y]) => {
  const punta = V(x, y, zC);
  emblema.add(vara(pivote, punta, 0.135, 0.058, pulido));
  const d = new THREE.Vector3().subVectors(punta, pivote).normalize();
  const cono = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.26, 20), pulido);
  cono.position.copy(punta).addScaledVector(d, 0.1);
  cono.quaternion.setFromUnitVectors(EJE_Y, d);
  emblema.add(cono);
});
// Cabeza articulada. Ojo con la forma: un disco plano y pulido de cara a la
// cámara refleja lo que hay DETRÁS del observador, o sea la nada, y sale
// negro. Una superficie curva siempre encuentra un cirio que devolver.
const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), brillo);
cabeza.scale.set(1, 0.92, 0.62);
cabeza.position.copy(pivote);
emblema.add(cabeza);
const corona = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.055, 16, 40), pulido);
corona.position.copy(pivote);
emblema.add(corona);
emblema.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), brillo).translateY(1.86).translateZ(zC));

/* punto central */
emblema.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 28, 22), pulido).translateY(-0.02).translateZ(0.42));

emblema.position.y = -0.06;
escena.add(emblema);

/* ---------- medidas ----------
   El lienzo nace con display:none para no ocupar sitio si el 3D nunca llega.
   Hay que mostrarlo antes de medirlo o el buffer sale de 1x1 píxel.          */
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

/* ---------- ciclo ---------- */
let inicio = null, raf = 0, visible = true, transcurrido = 0, ultimo = 0;

function cuadro(ahora) {
  raf = requestAnimationFrame(cuadro);
  if (inicio === null) { inicio = ahora; ultimo = ahora; }
  transcurrido += Math.min((ahora - ultimo) / 1000, 0.05);   // el vaivén no salta tras una pausa
  ultimo = ahora;
  const t = transcurrido;

  // la aparición se mide en tiempo real: debe durar lo mismo en un equipo lento
  const k = Math.min((ahora - inicio) / 2800, 1), e = 1 - Math.pow(1 - k, 3);
  renderer.toneMappingExposure = 1.3 * e;
  canvas.style.opacity = e.toFixed(3);
  if (poster && e > 0.25) poster.style.opacity = String(Math.max(0, 1 - (e - 0.25) / 0.5));

  // giro pendular: una pieza plana en giro completo desaparece de canto media
  // vuelta. El vaivén la mantiene legible y hace que el reflejo la recorra.
  emblema.rotation.y = -1.05 * (1 - e) + Math.sin(t * 0.4) * 0.62;
  emblema.rotation.x = Math.sin(t * 0.26) * 0.1 - 0.05;
  emblema.position.y = -0.06 + Math.sin(t * 0.48) * 0.05;

  renderer.render(escena, camara);
}

function arrancar() { if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(cuadro); } }
function parar()    { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

arrancar();

// no gastar batería con el hero fuera de pantalla ni con la pestaña oculta
new IntersectionObserver(es => {
  visible = es[0].isIntersecting;
  visible && !document.hidden ? arrancar() : parar();
}, { threshold: 0 }).observe(canvas);
document.addEventListener('visibilitychange', () => {
  !document.hidden && visible ? arrancar() : parar();
});
