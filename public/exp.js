'use strict';
// =====================================================================
//  UMWELT · El Jardín de Frankenstein
//  Vuelo 3D Infinito (FPV) + Enjambre Colaborativo + Macro Street View
// =====================================================================

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const fmt = v => (v == null ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };

// ============================ PARÁMETROS Y SALIDAS ===================
const T = {}, LAST = {}, P = {
  camPitch: 0, camRoll: 0,
  zoom: 1.05, colorExotico: 0, necrosis: 0, desfaseMult: 1,
  volPalpito: 0, volAbeja: 0, volMalaAbeja: 0, volMaquina: 0,
  filtroHz: 8500
};

const tgt = (id, g, label, min, max, def, o = {}) => { T[id] = { id, g, label, min, max, def, ...o }; };
const setT = (id, v) => { LAST[id] = v; if (T[id] && T[id].apply) T[id].apply(v); };

tgt('vuelo.inclinacion.x', 'Vuelo 3D', 'giro de cabeza / alabeo (roll %)', -40, 40, 0, { apply: v => { P.camRoll = v; } });
tgt('vuelo.inclinacion.y', 'Vuelo 3D', 'cabeceo / picada (pitch %)', -30, 30, 0, { apply: v => { P.camPitch = v; } });
tgt('vuelo.zoom', 'Vuelo 3D', 'inmersión macro vs satélite', 0.65, 2.6, 1.05, { apply: v => { P.zoom = v; } });
tgt('polen.desfase', 'Polinización', 'multiplicador de dispersión', 1, 5, 1, { apply: v => { P.desfaseMult = v; } });
tgt('flor.color_exotico', 'Polinización', 'espectro ultravioleta (°)', 0, 360, 0, { apply: v => { P.colorExotico = v; } });
tgt('flor.necrosis', 'Polinización', 'asfixia por exceso de contacto', 0, 1, 0, { apply: v => { P.necrosis = v; } });

tgt('audio.palpito', 'Audio', 'pálpito celular inicial', 0, 1, 0, { apply: v => { P.volPalpito = v; setGain('palpito', v); } });
tgt('audio.abeja', 'Audio', 'vuelo armónico natural', 0, 1, 0, { apply: v => { P.volAbeja = v; setGain('abeja', v); } });
tgt('audio.mala_abeja', 'Audio', 'zumbido estresado (por rigidez)', 0, 1, 0, { apply: v => { P.volMalaAbeja = v; setGain('mala_abeja', v); } });
tgt('audio.maquina', 'Audio', 'colmena mecánica (latido artificial)', 0, 1, 0, { apply: v => { P.volMaquina = v; setGain('maquina', v); } });
tgt('audio.filtro', 'Audio', 'filtro ambiental del ecosistema (Hz)', 200, 12000, 8500, { log: true, apply: v => { P.filtroHz = v; if (A.filt) A.filt.frequency.setTargetAtTime(v, A.ctx.currentTime, 0.05); } });

// ============================ ECOSISTEMA SONORO ======================
const AUDIO_DEFS = {
  bosque: { url: 'audio_bee/bosque.m4a', fallback: 'audio_bee/bosque.wav', loop: true, baseVol: 0.95 },
  palpito: { url: 'audio_bee/palpito.m4a', fallback: 'audio_bee/palpito.wav', loop: true, baseVol: 0.85 },
  abeja: { url: 'audio_bee/abeja.m4a', fallback: 'audio_bee/abeja.wav', loop: true, baseVol: 1.0 },
  mala_abeja: { url: 'audio_bee/mala_abeja.mp3', loop: true, baseVol: 0.88 },
  maquina: { url: 'audio_bee/maquina.mp3', loop: true, baseVol: 0.8 },
  alarma: { url: 'audio_bee/alarma.wav', loop: false, baseVol: 0.95 },
  robot: { url: 'audio_bee/robot.mp3', loop: false, baseVol: 0.9 },
  pago: { url: 'audio_bee/pago.mp3', loop: false, baseVol: 0.95 },
};

const A = { ctx: null, bufs: {}, nodes: {}, gains: {}, filt: null, pan: null, master: null, comp: null, an: null };

function setGain(name, vol, tc = 0.06) {
  if (A.ctx && A.gains[name]) {
    const target = clamp(vol * (AUDIO_DEFS[name]?.baseVol || 1), 0, 1);
    A.gains[name].gain.setTargetAtTime(target, A.ctx.currentTime, tc);
    const badge = $(`#b-${name}`);
    if (badge) badge.classList.toggle('active', target > 0.04);
  }
}

async function loadBuffer(name, def) {
  try {
    let res = await fetch(def.url);
    if (!res.ok && def.fallback) res = await fetch(def.fallback);
    const buf = await A.ctx.decodeAudioData(await res.arrayBuffer());
    A.bufs[name] = buf;
    return buf;
  } catch (err) {
    console.warn(`Audio ${name} no cargó:`, err);
    return null;
  }
}

function playTrigger(name) {
  if (!A.ctx || !A.bufs[name]) return;
  try {
    const s = A.ctx.createBufferSource();
    s.buffer = A.bufs[name];
    const g = A.ctx.createGain();
    g.gain.value = AUDIO_DEFS[name].baseVol || 0.9;
    s.connect(g);
    g.connect(A.filt || A.master || A.ctx.destination);
    s.start();
    const badge = $(`#b-${name}`);
    if (badge) {
      badge.classList.add('active');
      setTimeout(() => badge.classList.remove('active'), 750);
    }
  } catch {}
}

async function initSoundscape() {
  if (A.ctx) { if (A.ctx.state === 'suspended') await A.ctx.resume(); return; }
  const c = (A.ctx = new (window.AudioContext || window.webkitAudioContext)());
  A.filt = c.createBiquadFilter(); A.filt.type = 'lowpass'; A.filt.frequency.value = P.filtroHz;
  A.pan = c.createStereoPanner();
  A.master = c.createGain(); A.master.gain.value = 0.9;
  A.comp = c.createDynamicsCompressor();
  A.an = c.createAnalyser(); A.an.fftSize = 1024;

  A.filt.connect(A.pan);
  A.pan.connect(A.master);
  A.master.connect(A.comp);
  A.comp.connect(A.an);
  A.comp.connect(c.destination);

  $('#audioBtn').textContent = 'Cargando ecosistema…';
  await Promise.all(Object.entries(AUDIO_DEFS).map(([k, def]) => loadBuffer(k, def)));

  for (const [k, def] of Object.entries(AUDIO_DEFS)) {
    if (!def.loop || !A.bufs[k]) continue;
    const s = c.createBufferSource();
    s.buffer = A.bufs[k];
    s.loop = true;
    const g = c.createGain();
    g.gain.value = k === 'bosque' ? def.baseVol : 0;
    s.connect(g);
    if (k === 'bosque') {
      g.connect(A.master);
    } else {
      g.connect(A.filt);
    }
    s.start();
    A.nodes[k] = s;
    A.gains[k] = g;
  }
  
  const bBadge = $('#b-bosque');
  if (bBadge) bBadge.classList.add('active');
  $('#audioBtn').textContent = '🍃 Ecosistema Acústico: Activo';
  $('#audioBtn').classList.remove('primary');
}

let audioInited = false;
async function ensureAudio() {
  if (audioInited && A.ctx && A.ctx.state === 'running') return;
  try {
    if (!A.ctx) {
      await initSoundscape();
    } else if (A.ctx.state === 'suspended') {
      await A.ctx.resume();
    }
    audioInited = true;
  } catch (err) {
    console.warn('Audio auto-resume:', err);
  }
}

// Activar audio automáticamente con el primer gesto en cualquier parte de la ventana
window.addEventListener('pointerdown', ensureAudio, { passive: true });
window.addEventListener('click', ensureAudio, { passive: true });
window.addEventListener('keydown', ensureAudio, { passive: true });

$('#audioBtn').onclick = () => { ensureAudio(); };

// Audición interactiva de sonidos desde el Cajón 2 (prueba aislada)
document.querySelectorAll('#soundBadges .sound-badge').forEach(badge => {
  badge.onclick = async () => {
    if (!A.ctx) await initSoundscape();
    const snd = badge.dataset.snd;
    if (!snd) return;
    if (AUDIO_DEFS[snd]?.loop) {
      // Apagar temporalmente otros bucles para escuchar claramente la capa seleccionada
      for (const [k, def] of Object.entries(AUDIO_DEFS)) {
        if (def.loop && k !== snd) setGain(k, 0, 0.04);
      }
      setGain(snd, 1.0, 0.04);
      setTimeout(() => {
        if (!mouseIsDown) {
          setGain(snd, snd === 'bosque' ? AUDIO_DEFS.bosque.baseVol : 0, 0.4);
          setGain('bosque', AUDIO_DEFS.bosque.baseVol, 0.4);
        }
      }, 3000);
    } else {
      playTrigger(snd);
    }
  };
});

// ============================ CAMPO INFINITO Y VÓRTICE ================
const stage = $('#stageWrap');
const groundPlane = $('#groundPlane');
const baseCv = $('#meadowBase'), bgx = baseCv.getContext('2d');
const lifeCv = $('#meadowLife'), lgx = lifeCv.getContext('2d');
const partCv = $('#particlesCanvas'), pgx = partCv.getContext('2d');
const hudCv = $('#hudCanvas'), hgx = hudCv.getContext('2d');
const scCv = $('#scope'), scg = scCv.getContext('2d'), scopeWave = new Uint8Array(1024);

// Sincronizar resolución de los lienzos con el contenedor sin deformación
function syncCanvasSizes() {
  const w = stage.clientWidth || 1280;
  const h = stage.clientHeight || 720;
  if (partCv.width !== w || partCv.height !== h) {
    partCv.width = w; partCv.height = h;
    hudCv.width = w; hudCv.height = h;
  }
}
window.addEventListener('resize', syncCanvasSizes);

const TILE_W = 800;
const TILE_H = 300; // Aspect ratio exacto: 800 / 300 = 2.6667 (idéntico a flori.png: 2048 / 768)

const fullColorCv = document.createElement('canvas');
fullColorCv.width = baseCv.width;
fullColorCv.height = baseCv.height;
const fgx = fullColorCv.getContext('2d');

// Pincel difuminado reutilizable para colorear el campo con bordes suaves orgánicos
const patchCv = document.createElement('canvas');
patchCv.width = 256;
patchCv.height = 256;
const pgx2 = patchCv.getContext('2d');

const floriImg = new Image();
floriImg.crossOrigin = 'anonymous';
floriImg.src = 'imagen/flori.png';
floriImg.onload = () => {
  renderInfiniteMeadowBase();
  renderFullColorMeadow();
};
if (floriImg.complete) {
  renderInfiniteMeadowBase();
  renderFullColorMeadow();
}

function renderInfiniteMeadowBase() {
  if (!floriImg.complete) return;
  bgx.clearRect(0, 0, baseCv.width, baseCv.height);

  const cols = Math.ceil(baseCv.width / TILE_W);
  const rows = Math.ceil(baseCv.height / TILE_H);

  // Mosaico botánico continuo y simétrico en espejo: CERO costuras ni líneas divisorias
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bgx.save();
      const x = c * TILE_W;
      const y = r * TILE_H;

      // Alternar reflejo horizontal y vertical para continuidad perfecta en los límites
      const flipX = (c % 2 === 1);
      const flipY = (r % 2 === 1);

      bgx.translate(flipX ? x + TILE_W : x, flipY ? y + TILE_H : y);
      bgx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      bgx.drawImage(floriImg, 0, 0, TILE_W, TILE_H);
      bgx.restore();
    }
  }

  // Viñeta atmosférica suave en los extremos para fundir el campo con el horizonte 3D
  const cx = baseCv.width / 2, cy = baseCv.height / 2;
  const grad = bgx.createRadialGradient(cx, cy, baseCv.width * 0.38, cx, cy, baseCv.width * 0.68);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.7, 'rgba(3, 8, 5, 0.2)');
  grad.addColorStop(1, 'rgba(3, 8, 5, 0.75)');
  bgx.fillStyle = grad;
  bgx.fillRect(0, 0, baseCv.width, baseCv.height);
}

// Renderiza el prado EXACTO a todo color (fuente pura para colorear al tocar)
function renderFullColorMeadow() {
  if (!floriImg.complete) return;
  fgx.clearRect(0, 0, fullColorCv.width, fullColorCv.height);

  const cols = Math.ceil(fullColorCv.width / TILE_W);
  const rows = Math.ceil(fullColorCv.height / TILE_H);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fgx.save();
      const x = c * TILE_W;
      const y = r * TILE_H;

      const flipX = (c % 2 === 1);
      const flipY = (r % 2 === 1);

      fgx.translate(flipX ? x + TILE_W : x, flipY ? y + TILE_H : y);
      fgx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      fgx.drawImage(floriImg, 0, 0, TILE_W, TILE_H);
      fgx.restore();
    }
  }
}

// Reiniciar campo
function resetField() {
  lgx.clearRect(0, 0, lifeCv.width, lifeCv.height);
  flowerSpots.length = 0;
  totalBlooms = 0;
  isClimax = false;
  $('#climaxModal').classList.remove('active');
  $('#statCoverage').textContent = '0%';
  $('#statDrift').textContent = '+0 px';
  if (A.ctx) {
    setGain('palpito', 0, 0.2);
    setGain('maquina', 0, 0.2);
    setGain('mala_abeja', 0, 0.2);
    setGain('abeja', 0, 0.2);
  }
  const btn = $('#resetFieldBtn');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '🍂 Prado marchitado';
    btn.style.color = '#ef4444';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = '';
    }, 1200);
  }
}
$('#resetFieldBtn').onclick = resetField;
$('#modalResetBtn').onclick = resetField;

// 140 partículas del enjambre: abejas / luciérnagas doradas y luminosas
const SWARM = Array.from({ length: 140 }, () => ({
  x: Math.random() * 1280,
  y: Math.random() * 720,
  z: 0.5 + Math.random() * 2.0,
  vx: (Math.random() - 0.5) * 1.5,
  vy: (Math.random() - 0.5) * 1.5,
  orbitAngle: Math.random() * Math.PI * 2,
  speed: 0.8 + Math.random() * 1.2,
  size: 3.5 + Math.random() * 4.0,
  charge: 0
}));

const flowerSpots = [];
let totalBlooms = 0;
let isClimax = false;
let autonomousHue = 0;

function getDisplacement(touchX, touchY, factorMult = 1) {
  const px = ((touchX * lifeCv.width) % lifeCv.width + lifeCv.width) % lifeCv.width;
  const py = ((touchY * lifeCv.height) % lifeCv.height + lifeCv.height) % lifeCv.height;

  let nearest = null, minDist = 999999;
  for (const s of flowerSpots) {
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < minDist) { minDist = d; nearest = s; }
  }

  let attempts = 1;
  if (nearest && minDist < 180) {
    nearest.attempts++;
    nearest.lastTime = performance.now();
    attempts = nearest.attempts;
  } else {
    flowerSpots.push({ x: px, y: py, attempts: 1, lastTime: performance.now() });
    if (flowerSpots.length > 80) flowerSpots.shift();
  }

  // 5. Repetición en la misma zona: Desfase exponencial de la floración
  const angle = Math.sin(touchX * 18 + touchY * 11) * Math.PI * 2;
  const distance = Math.min(560, 18 * Math.pow(1.68, attempts - 1) * factorMult);
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance * 0.55;

  return {
    worldX: ((px + dx) % lifeCv.width + lifeCv.width) % lifeCv.width,
    worldY: ((py + dy) % lifeCv.height + lifeCv.height) % lifeCv.height,
    distance, attempts
  };
}

// Pintado Orgánico y Fecundación Viva por el Enjambre
function swarmDepositPollen(targetWorldX, targetWorldY, isNecrosis, radMult = 1.0) {
  if (!floriImg.complete) return;
  
  lgx.save();
  // Radio delicado y proporcionado para control visual fino
  const rad = (18 + Math.random() * 10) * radMult;

  if (isNecrosis) {
    // 6. touch.d (yema plana / presión): Necrosis por sobrecarga (asfixia y oscurecimiento)
    lgx.globalCompositeOperation = 'source-over';
    const grad = lgx.createRadialGradient(targetWorldX, targetWorldY, 2, targetWorldX, targetWorldY, rad * 1.5);
    grad.addColorStop(0, 'rgba(10, 3, 2, 0.96)');
    grad.addColorStop(0.55, 'rgba(40, 12, 6, 0.85)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lgx.fillStyle = grad;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad * 1.5, 0, Math.PI * 2);
    lgx.fill();
  } else {
    // 2 & 4. Fecundación Viva: COLOREAR Y REANIMAR el campo durmiente exactamente en su lugar
    const size = Math.ceil(rad * 2);
    if (patchCv.width < size) { patchCv.width = size; patchCv.height = size; }

    pgx2.clearRect(0, 0, size, size);

    // Calcular límites para extraer con total seguridad del mosaico a color
    const sx = Math.max(0, targetWorldX - rad);
    const sy = Math.max(0, targetWorldY - rad);
    const ex = Math.min(fullColorCv.width, targetWorldX + rad);
    const ey = Math.min(fullColorCv.height, targetWorldY + rad);
    const sw = ex - sx;
    const sh = ey - sy;

    if (sw > 0 && sh > 0) {
      const dx = sx - (targetWorldX - rad);
      const dy = sy - (targetWorldY - rad);

      // 1. Extraer la porción exacta a todo color del mosaico (alineada píxel por píxel con el fondo)
      pgx2.globalCompositeOperation = 'source-over';
      pgx2.drawImage(fullColorCv, sx, sy, sw, sh, dx, dy, sw, sh);

      // 2. Aplicar máscara radial difuminada para que el florecimiento sea suave y sin bordes duros
      pgx2.globalCompositeOperation = 'destination-in';
      const grad = pgx2.createRadialGradient(rad, rad, 0, rad, rad, rad);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.85)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      pgx2.fillStyle = grad;
      pgx2.beginPath();
      pgx2.arc(rad, rad, rad, 0, Math.PI * 2);
      pgx2.fill();

      // 3. Estampar el florecimiento vivo sobre el lienzo de vida exactamente en sus coordenadas
      lgx.globalCompositeOperation = 'source-over';
      lgx.drawImage(patchCv, 0, 0, size, size, targetWorldX - rad, targetWorldY - rad, size, size);

      // 4. Sutil halo bioluminiscente de polen en el núcleo de fecundación
      lgx.globalCompositeOperation = 'screen';
      const halo = lgx.createRadialGradient(targetWorldX, targetWorldY, 0, targetWorldX, targetWorldY, rad * 1.35);
      halo.addColorStop(0, 'rgba(255, 248, 190, 0.35)');
      halo.addColorStop(0.5, 'rgba(230, 255, 61, 0.12)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lgx.fillStyle = halo;
      lgx.beginPath();
      lgx.arc(targetWorldX, targetWorldY, rad * 1.35, 0, Math.PI * 2);
      lgx.fill();

      totalBlooms++;
    }
  }
  lgx.restore();

  const coverage = Math.min(100, Math.round((totalBlooms / 700) * 100));
  $('#statCoverage').textContent = coverage + '%';
  if (coverage >= 80 && !isClimax) {
    triggerClimax();
  }
}

function triggerClimax() {
  isClimax = true;
  $('#climaxModal').classList.add('active');
  playTrigger('alarma');
  setTimeout(() => playTrigger('robot'), 800);
  setGain('palpito', 0.85);
  setGain('maquina', 0.85);
  setGain('abeja', 0.95);
}

// Polinizadores activos
function getActivePollinators() {
  const list = [];
  const realPhones = Object.values(tacto.devices).filter(d => d.online && d.id !== 'raton');

  for (const dev of realPhones) {
    const isDown = (dev.ch['touch.down'] || 0) >= 0.5;
    list.push({
      id: dev.id,
      name: dev.name || 'teléfono',
      tx: dev.ch['touch.x'] ?? 0.5,
      ty: dev.ch['touch.y'] ?? 0.5,
      td: dev.ch['touch.d'] || (isDown ? 45 : 25),
      tn: dev.ch['touch.n'] || (isDown ? 1 : 0),
      gy: dev.ch['ang.g'],
      gx: dev.ch['ang.b'],
      isDown
    });
  }
  return list;
}

// ============================ BUCLE 3D Y PERSPECTIVA ==================
let curCamRoll = 0, curCamPitch = 0;
let lastPhonePollenTime = 0, lastPhonePollenX = 0, lastPhonePollenY = 0;
let lastMousePollenTime = 0, lastMousePollenX = 0, lastMousePollenY = 0;

function update3DWorld(now) {
  syncCanvasSizes();

  // Control de vuelo continuo exclusivo desde teléfonos móviles (Tacto + Giroscopio)
  let hasPhoneActive = false;
  let targetRoll = 0, targetPitch = 0;
  const realPhones = Object.values(tacto.devices).filter(d => d.online && d.id !== 'raton');

  for (const dev of realPhones) {
    hasPhoneActive = true;
    const isDown = (dev.ch['touch.down'] || 0) >= 0.5;
    const tx = dev.ch['touch.x'] ?? 0.5;
    const ty = dev.ch['touch.y'] ?? 0.5;

    // Navegación de vuelo gobernada exclusivamente por giroscopio del móvil
    const gy = dev.ch['ang.g'];
    const gx = dev.ch['ang.b'];
    if (gy != null && gx != null) {
      const gyroRoll = clamp(gy * 0.95, -50, 50);
      const gyroPitch = clamp((gx - 35) * 0.85, -40, 40);
      targetRoll += gyroRoll;
      targetPitch += gyroPitch;
    }

    // Zoom táctil desde el teléfono con 2 dedos (Pellizco In / Out bidireccional calibrado)
    const td = dev.ch['touch.dist'];
    if (td != null && (dev.ch['touch.n'] || 0) === 2) {
      // td <= 0.12 (juntos) -> Panorámica / Zoom Out (0.70)
      // td ~ 0.28 (normal)  -> Vuelo FPV (1.15)
      // td >= 0.50 (abierto)-> Zoom In / Macro UV (2.40)
      const normDist = clamp((td - 0.08) / 0.42, 0, 1);
      const targetZoom = 0.70 + Math.pow(normDist, 1.25) * 1.85;
      P.zoom += (targetZoom - P.zoom) * 0.18;
      simulatedZoom = P.zoom;
    }
  }

  // La orientación de vuelo y la fecundación están exclusivamente reservadas a los teléfonos
  if (!isClimax) {
    if (hasPhoneActive) {
      P.camRoll = clamp(targetRoll / Math.max(1, realPhones.length), -60, 60);
      P.camPitch = clamp(targetPitch / Math.max(1, realPhones.length), -45, 45);
    } else {
      P.camRoll = 0;
      P.camPitch = 0;
    }
  }

  // Suavizado cinemático con inercia aérea viva
  curCamRoll += (P.camRoll - curCamRoll) * 0.085;
  curCamPitch += (P.camPitch - curCamPitch) * 0.085;

  // 1. Modulación de paneo estéreo (izq/der) y afinación general con la inclinación del móvil
  if (A.pan && A.ctx) {
    A.pan.pan.setTargetAtTime(clamp(curCamRoll / 35, -1, 1), A.ctx.currentTime, 0.08);
  }
  if (A.nodes['abeja'] && A.nodes['abeja'].playbackRate && A.ctx) {
    A.nodes['abeja'].playbackRate.setTargetAtTime(clamp(1.0 + curCamPitch * 0.006, 0.85, 1.25), A.ctx.currentTime, 0.08);
  }

  // 7. touch.dist / Zoom: Barrido del filtro acústico y mutación al Espectro UV
  const sweepHz = clamp(3200 + (P.zoom - 0.7) * 4800, 1600, 15000);
  if (A.filt && A.ctx) {
    A.filt.frequency.setTargetAtTime(sweepHz, A.ctx.currentTime, 0.08);
  }

  // Perspectivas según Zoom (Fuente única de verdad):
  // Zoom Out (< 0.95): Panorámica satelital
  // Zoom Normal (0.95 - 1.55): Vuelo FPV Natural
  // Zoom In (>= 1.55): Espectro UV (Abeja / Revelación)
  const isUV = P.zoom >= 1.55;
  const isSatellite = P.zoom < 0.95;
  $('#stageWrap').classList.toggle('uv-active', isUV);
  P.colorExotico = isUV ? 220 : 0;

  // Sincronizar botones de vista
  document.querySelectorAll('.view-btn').forEach(b => {
    const v = b.dataset.view;
    if (v === 'satellite') b.classList.toggle('active', isSatellite);
    if (v === 'fpv') b.classList.toggle('active', !isSatellite && !isUV);
    if (v === 'uv') b.classList.toggle('active', isUV);
  });

  if (isUV) {
    $('#statChroma').textContent = 'Espectro UV (Abeja)';
  } else if (isSatellite) {
    $('#statChroma').textContent = 'Panorámica General';
  } else {
    $('#statChroma').textContent = 'Vuelo FPV Natural';
  }

  // Perspectiva 3D con alabeo y cabeceo dinámico
  const rotX = isSatellite ? 14 : 22 + curCamPitch * 0.45;
  const rotZ = -curCamRoll * 0.45;
  const transX = -curCamRoll * 5.2;
  const transY = -curCamPitch * 3.5;
  const scale = P.zoom;

  groundPlane.style.transform = `rotateX(${rotX}deg) rotateZ(${rotZ}deg) translate3d(${transX}px, ${transY}px, 0) scale(${scale})`;

  // Filtro cromático: en clímax irreversible o en vista UV
  if (isClimax) {
    autonomousHue = (autonomousHue + 0.6) % 360;
    lifeCv.style.filter = `hue-rotate(${autonomousHue}deg) saturate(130%) brightness(115%)`;
  } else if (isUV) {
    lifeCv.style.filter = `hue-rotate(220deg) saturate(180%) brightness(120%)`;
  } else {
    lifeCv.style.filter = 'none';
  }

  // Renderizar Partículas del Enjambre
  pgx.clearRect(0, 0, partCv.width, partCv.height);
  const pollinators = getActivePollinators();
  const onlinePhones = Object.values(tacto.devices).filter(k => k.online && k.id !== 'raton');
  $('#statPeers').textContent = String(onlinePhones.length);

  const isSwarming = pollinators.length > 0 || isClimax;

  // Fecundación continua directa por teléfonos móviles tocando la pantalla (ritmo suave y controlado)
  if (!isClimax) {
    for (const pol of pollinators) {
      if (pol.isDown && pol.id !== 'raton') {
        const sx = pol.tx * partCv.width;
        const sy = pol.ty * partCv.height;
        const cx = lifeCv.width / 2;
        const cy = lifeCv.height / 2;
        // Posición en el plano 3D con desplazamiento cinemático de vuelo
        const wx = cx + (sx - partCv.width / 2) / P.zoom + curCamRoll * 4;
        const wy = cy + (sy - partCv.height / 2) / P.zoom + curCamPitch * 3;
        
        // Ritmo controlado: máximo cada 85ms o tras recorrer al menos 12px para evitar descontrol
        if (now - lastPhonePollenTime > 85 || Math.hypot(wx - lastPhonePollenX, wy - lastPhonePollenY) > 12) {
          lastPhonePollenTime = now;
          lastPhonePollenX = wx;
          lastPhonePollenY = wy;
          swarmDepositPollen(wx, wy, pol.td > 70, 1.0);
        }
      }
    }
    // Soporte para pruebas de escritorio con el ratón
    if (mouseIsDown) {
      const cx = lifeCv.width / 2;
      const cy = lifeCv.height / 2;
      const wx = cx + (mouseCoords.x * partCv.width - partCv.width / 2) / P.zoom;
      const wy = cy + (mouseCoords.y * partCv.height - partCv.height / 2) / P.zoom;
      if (now - lastMousePollenTime > 85 || Math.hypot(wx - lastMousePollenX, wy - lastMousePollenY) > 12) {
        lastMousePollenTime = now;
        lastMousePollenX = wx;
        lastMousePollenY = wy;
        swarmDepositPollen(wx, wy, isRightClick, 1.0);
      }
    }
  }

  for (let i = 0; i < SWARM.length; i++) {
    const b = SWARM[i];

    if (isSwarming) {
      let targetCenterScreenX = partCv.width / 2;
      let targetCenterScreenY = partCv.height / 2;
      let targetIsDown = false;

      if (isClimax) {
        targetCenterScreenX = partCv.width / 2 + Math.cos(now * 0.0025 + i) * (partCv.width * 0.35);
        targetCenterScreenY = partCv.height / 2 + Math.sin(now * 0.0025 + i) * (partCv.height * 0.28);
      } else {
        const pol = pollinators[i % pollinators.length];
        targetIsDown = pol.isDown;
        const disp = getDisplacement(pol.tx, pol.ty, P.desfaseMult);
        targetCenterScreenX = (disp.worldX / lifeCv.width) * partCv.width;
        targetCenterScreenY = (disp.worldY / lifeCv.height) * partCv.height;
      }

      // Distribución orbital viva para que las 140 abejas dancen alrededor del polinizador
      const angleOffset = (i / SWARM.length) * Math.PI * 2;
      const swarmRadius = targetIsDown ? (20 + (i % 6) * 16) : (50 + (i % 8) * 22);
      const targetScreenX = targetCenterScreenX + Math.cos(now * 0.003 + angleOffset) * swarmRadius;
      const targetScreenY = targetCenterScreenY + Math.sin(now * 0.003 + angleOffset) * (swarmRadius * 0.65);

      const dx = targetScreenX - b.x;
      const dy = targetScreenY - b.y;
      const dist = Math.hypot(dx, dy);

      const force = clamp(260 / (dist + 20), 0.2, 3.2);
      b.vx += (dx / (dist || 1)) * force * 0.32;
      b.vy += (dy / (dist || 1)) * force * 0.32;
      // Vórtice espiral de colmena
      b.vx += (-dy / (dist || 1)) * (isClimax ? 2.8 : 1.6);
      b.vy += (dx / (dist || 1)) * (isClimax ? 2.8 : 1.6);
      b.vx *= 0.94;
      b.vy *= 0.94;

      // Cargar la abeja de polen luminoso al danzar cerca del foco (sin inundar el prado)
      if (targetIsDown && dist < 120) {
        b.charge = 1;
      }
    } else {
      b.orbitAngle += 0.016 * b.speed;
      b.vx += Math.cos(b.orbitAngle) * 0.12 - curCamRoll * 0.008;
      b.vy += Math.sin(b.orbitAngle) * 0.09 - curCamPitch * 0.008;
      b.vx *= 0.96;
      b.vy *= 0.96;
    }

    b.x += b.vx;
    b.y += b.vy;

    // Envolver de forma dinámica en toda la pantalla sin cortes
    if (b.x < -40) b.x += partCv.width + 80;
    if (b.x > partCv.width + 40) b.x -= partCv.width + 80;
    if (b.y < -40) b.y += partCv.height + 80;
    if (b.y > partCv.height + 40) b.y -= partCv.height + 80;

    const rad = b.size * (0.9 + 0.35 / b.z) * (P.zoom > 1.35 ? 1.4 : 1.0);
    const alpha = clamp(0.45 + (1 / b.z) * 0.45, 0.3, 0.95);

    pgx.save();
    pgx.beginPath();
    pgx.arc(b.x, b.y, rad, 0, Math.PI * 2);
    const hue = b.charge > 0 ? (autonomousHue + 55) % 360 : (b.z > 1.4 ? 52 : 46);
    pgx.fillStyle = `hsla(${hue}, 98%, ${b.charge > 0 ? '78%' : '65%'}, ${alpha})`;
    pgx.shadowBlur = b.charge > 0 ? 16 : 9;
    pgx.shadowColor = `hsla(${hue}, 100%, 70%, 0.8)`;
    pgx.fill();
    pgx.restore();
    b.charge *= 0.92;
  }

  // RENDERIZAR HUD Y NIEBLA DE HORIZONTE
  hgx.clearRect(0, 0, hudCv.width, hudCv.height);

  // Niebla Atmosférica en el Horizonte
  const fog = hgx.createLinearGradient(0, 0, 0, hudCv.height * 0.38);
  fog.addColorStop(0, 'rgba(3, 6, 4, 0.92)');
  fog.addColorStop(0.6, 'rgba(3, 6, 4, 0.45)');
  fog.addColorStop(1, 'rgba(3, 6, 4, 0)');
  hgx.fillStyle = fog;
  hgx.fillRect(0, 0, hudCv.width, hudCv.height * 0.38);

  // Viñeta óptica periférica
  const gradVig = hgx.createRadialGradient(hudCv.width / 2, hudCv.height / 2, hudCv.width * 0.36, hudCv.width / 2, hudCv.height / 2, hudCv.width * 0.55);
  gradVig.addColorStop(0, 'rgba(0,0,0,0)');
  gradVig.addColorStop(1, 'rgba(3, 6, 4, 0.5)');
  hgx.fillStyle = gradVig;
  hgx.fillRect(0, 0, hudCv.width, hudCv.height);

  // Haz de desfase para polinizadores activos que estén tocando
  const touchingPollinators = pollinators.filter(p => p.isDown);
  for (const pol of touchingPollinators) {
    const disp = getDisplacement(pol.tx, pol.ty, P.desfaseMult);
    const targetScreenX = (disp.worldX / lifeCv.width) * hudCv.width;
    const targetScreenY = (disp.worldY / lifeCv.height) * hudCv.height;
    const cx = hudCv.width / 2 + curCamRoll * 2.5;
    const cy = hudCv.height / 2 + curCamPitch * 1.8;

    hgx.beginPath();
    hgx.moveTo(cx, cy);
    const midX = (cx + targetScreenX) / 2 + Math.sin(now * 0.012) * 25;
    const midY = (cy + targetScreenY) / 2 - 20;
    hgx.quadraticCurveTo(midX, midY, targetScreenX, targetScreenY);
    hgx.strokeStyle = 'rgba(230, 255, 61, 0.65)';
    hgx.lineWidth = 1.6;
    hgx.setLineDash([5, 4]);
    hgx.lineDashOffset = -now * 0.035;
    hgx.stroke();
    hgx.setLineDash([]);

    hgx.beginPath();
    hgx.arc(targetScreenX, targetScreenY, 8 + Math.sin(now * 0.02) * 3, 0, Math.PI * 2);
    hgx.fillStyle = pol.td > 78 ? 'rgba(244, 63, 94, 0.85)' : 'rgba(230, 255, 61, 0.9)';
    hgx.fill();

    hgx.font = '11px monospace';
    hgx.fillStyle = '#e6ff3d';
    hgx.fillText(`${pol.name}: +${Math.round(disp.distance)}px`, targetScreenX + 12, targetScreenY + 4);
    $('#statDrift').textContent = `+${Math.round(disp.distance)} px`;
  }

  // Retícula visible en pantalla para cada teléfono conectado (indica exactamente dónde toca el usuario)
  for (const pol of pollinators) {
    if (pol.id === 'raton' || pol.id === 'raton_hover') continue;
    const directX = pol.tx * hudCv.width;
    const directY = pol.ty * hudCv.height;

    hgx.save();
    hgx.beginPath();
    hgx.arc(directX, directY, pol.isDown ? 24 : 12, 0, Math.PI * 2);
    hgx.fillStyle = pol.isDown ? 'rgba(74, 222, 128, 0.35)' : 'rgba(230, 255, 61, 0.15)';
    hgx.fill();

    hgx.beginPath();
    hgx.arc(directX, directY, pol.isDown ? 12 : 6, 0, Math.PI * 2);
    hgx.fillStyle = pol.isDown ? '#4ade80' : '#e6ff3d';
    hgx.shadowBlur = pol.isDown ? 14 : 6;
    hgx.shadowColor = pol.isDown ? '#4ade80' : '#e6ff3d';
    hgx.fill();

    hgx.font = 'bold 12px system-ui, sans-serif';
    hgx.fillStyle = '#ffffff';
    hgx.shadowBlur = 4;
    hgx.shadowColor = '#000000';
    hgx.fillText(`🐝 ${pol.name}${pol.isDown ? ' (fecundando)' : ''}`, directX + 16, directY + 4);
    hgx.restore();
  }

  // Osciloscopio acústico
  if (A.an) {
    scg.clearRect(0, 0, scCv.width, scCv.height);
    A.an.getByteTimeDomainData(scopeWave);
    scg.strokeStyle = '#e6ff3d';
    scg.lineWidth = 1.4;
    scg.beginPath();
    for (let i = 0; i < scCv.width; i++) {
      const v = (scopeWave[(i * 2) % 1024] - 128) / 128;
      const y = scCv.height / 2 + v * (scCv.height / 2 - 4);
      i === 0 ? scg.moveTo(i, y) : scg.lineTo(i, y);
    }
    scg.stroke();
  }
}

// ============================ CLIENTE TACTO Y SALAS ===================
const tacto = new Tacto();
const CHN = Object.fromEntries(Tacto.CHANNELS.map(c => [c.name, c]));

function updateLobbyBrokerStatus(status, errorMsg) {
  const dot = $('#lobbyMqttDot');
  if (!dot) return;
  if (status === 'conectado') {
    const brokerShort = tacto.broker ? tacto.broker.replace(/^wss?:\/\//, '').split('.')[0] : 'en línea';
    dot.textContent = `● En línea (${brokerShort})`;
    dot.style.color = '#4ade80';
  } else if (status === 'reconectando') {
    dot.textContent = '● Reconectando…';
    dot.style.color = '#facc15';
  } else if (status === 'error') {
    dot.textContent = '● Error: ' + (errorMsg || 'sin conexión');
    dot.style.color = '#ef4444';
  } else {
    dot.textContent = '● Conectando…';
    dot.style.color = '#eab308';
  }
}

tacto.on('estado', s => {
  const e = $('#estado');
  if (e) {
    e.className = 'dot ' + (s === 'conectado' ? 'on' : 'warn');
    e.textContent = '● ' + s;
  }
  updateLobbyBrokerStatus(s);
});
tacto.on('error', e => {
  const el = $('#estado');
  if (el) {
    el.className = 'dot warn';
    el.textContent = '● ' + (e.message || 'error');
  }
  updateLobbyBrokerStatus('error', e.message);
});

// ============================ CONTROLES DE ESCRITORIO =================
const mouseCoords = { x: 0.5, y: 0.5 };
let simulatedFingers = 1;
let simulatedZoom = 1.05;
let isRightClick = false;
let mouseIsDown = false;
let mouseInside = false;

stage.addEventListener('contextmenu', e => e.preventDefault());

// Selector de vista en pantalla grande
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.onclick = () => {
    const view = btn.dataset.view;
    if (view === 'satellite') {
      simulatedZoom = 0.75;
      P.zoom = 0.75;
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(6500, A.ctx.currentTime, 0.15);
    } else if (view === 'fpv') {
      simulatedZoom = 1.15;
      P.zoom = 1.15;
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(8500, A.ctx.currentTime, 0.15);
    } else if (view === 'uv') {
      simulatedZoom = 2.15;
      P.zoom = 2.15;
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(11800, A.ctx.currentTime, 0.15);
    }
  };
});

stage.addEventListener('wheel', e => {
  e.preventDefault();
  simulatedZoom = clamp(simulatedZoom - e.deltaY * 0.0018, 0.65, 3.2);
  P.zoom = simulatedZoom;
}, { passive: false });

stage.addEventListener('pointerdown', e => {
  ensureAudio().catch(() => {});
  if (e.target.closest('#viewSwitcher') || e.target.closest('#climaxModal') || e.target.closest('button')) return;
  mouseIsDown = true;
  isRightClick = (e.button === 2);
  const r = stage.getBoundingClientRect();
  mouseCoords.x = clamp((e.clientX - r.left) / (r.width || 1));
  mouseCoords.y = clamp((e.clientY - r.top) / (r.height || 1));
  const cx = lifeCv.width / 2;
  const cy = lifeCv.height / 2;
  const wx = cx + (mouseCoords.x * partCv.width - partCv.width / 2) / P.zoom;
  const wy = cy + (mouseCoords.y * partCv.height - partCv.height / 2) / P.zoom;
  swarmDepositPollen(wx, wy, isRightClick, 1.25);
});

stage.addEventListener('pointermove', e => {
  if (!mouseIsDown) return;
  const r = stage.getBoundingClientRect();
  mouseCoords.x = clamp((e.clientX - r.left) / (r.width || 1));
  mouseCoords.y = clamp((e.clientY - r.top) / (r.height || 1));
});

stage.addEventListener('pointerleave', () => {
  mouseInside = false;
  mouseIsDown = false;
});

stage.addEventListener('pointerup', () => {
  if (mouseIsDown) {
    mouseIsDown = false;
    isRightClick = false;
  }
});

window.addEventListener('keydown', e => {
  if (e.key === '1') simulatedFingers = 1;
  else if (e.key === '2') simulatedFingers = 2;
  else if (e.key === '3') {
    simulatedFingers = 3;
    playTrigger('robot');
  } else if (e.key.toLowerCase() === 'r') {
    resetField();
  }
});

// ============================ LÓGICA COLECTIVA DE GESTOS ==============
let lastTouchCount = 0, lastSumFingers = 0, alarmFired = false;
let touchPrevX = 0.5, touchPrevY = 0.5, touchSpeed = 0;
let touchDownTime = 0, lastMoveTime = 0;

function processGestures() {
  const pollinators = getActivePollinators();
  const touchingPollinators = pollinators.filter(p => p.isDown);
  const activeCount = touchingPollinators.length + (mouseIsDown ? 1 : 0);
  const now = performance.now();
  let currentSumFingers = 0;

  if (activeCount > 0 && !isClimax) {
    if (lastTouchCount === 0) {
      touchDownTime = now;
      lastMoveTime = now;
      alarmFired = false;
      if (A.ctx) setGain('palpito', 1.0, 0.04);
    }

    let sumFingers = mouseIsDown ? 1 : 0;
    let anyNecrosis = isRightClick;

    // Calcular velocidad para detectar desplazamiento fluido vs rigidez en un punto
    const p1 = touchingPollinators[0] || { tx: mouseCoords.x, ty: mouseCoords.y, tn: 1, td: isRightClick ? 90 : 45 };
    const dPos = Math.hypot(p1.tx - touchPrevX, p1.ty - touchPrevY);
    touchSpeed = touchSpeed * 0.75 + (dPos / (1 / 60)) * 0.25;
    touchPrevX = p1.tx; touchPrevY = p1.ty;

    if (dPos > 0.003) {
      lastMoveTime = now;
    }

    const timeStill = (now - lastMoveTime) / 1000;
    const isRigid = timeStill > 0.9; // Más de 0.9 segundos presionando quieto en el mismo punto

    for (const p of touchingPollinators) {
      sumFingers += p.tn;
      if (p.td > 78) anyNecrosis = true;
    }
    currentSumFingers = sumFingers;

    const isStress = anyNecrosis || sumFingers >= 4 || isRigid;

    // AUDIO ADAPTATIVO & RESPUESTA GESTUAL:
    // ESTADO 1: ARMÓNICO (Abeja normal zumbando nítida y presente)
    // ESTADO 2: ESTRÉS (Mala abeja irritada y agresiva, con temblor de cámara e inestabilidad)
    if (isStress) {
      setGain('mala_abeja', 0.95, 0.06);
      setGain('abeja', 0.08, 0.08);

      // 3. La flor vibra con temblor e inestabilidad (estrés cinemático)
      curCamRoll += (Math.random() - 0.5) * 2.4;
      curCamPitch += (Math.random() - 0.5) * 2.0;

      if (anyNecrosis) {
        $('#statTension').textContent = 'SOBRECARGA (Necrosis)';
        $('#statTension').style.color = 'var(--err)';
      } else if (sumFingers >= 4) {
        $('#statTension').textContent = 'HISTERIA COLECTIVA';
        $('#statTension').style.color = 'var(--err)';
      } else {
        $('#statTension').textContent = 'Abeja Irritada (Temblor / Rigidez)';
        $('#statTension').style.color = 'var(--warn)';
      }
    } else {
      // 4. Movimiento fluido / rápido: Vuelo armónico continuo y estelas de pétalos
      setGain('abeja', 0.95, 0.06);
      setGain('mala_abeja', 0.0, 0.08);
      $('#statTension').textContent = 'Armonía (Vuelo Fluido)';
      $('#statTension').style.color = 'var(--ok)';

      // Modulación orgánica del tono de vuelo de la abeja con la velocidad
      if (A.nodes['abeja'] && A.nodes['abeja'].playbackRate && A.ctx) {
        const rate = clamp(0.94 + dPos * 4.2, 0.90, 1.25);
        A.nodes['abeja'].playbackRate.setTargetAtTime(rate, A.ctx.currentTime, 0.08);
      }
    }

    // 5. Repetición en la misma zona / contacto persistente: Colmena mecánica despierta
    const elapsed = (now - touchDownTime) / 1000;
    if (elapsed > 1.4) {
      const volMaq = Math.min(0.90, (elapsed - 1.4) * 0.4);
      setGain('maquina', volMaq, 0.1);
      setGain('palpito', Math.max(0.1, 1 - (elapsed - 1.4) * 0.5), 0.1);
    } else {
      setGain('maquina', 0, 0.1);
    }

    // 6. touch.d grande / fuerza: Disparo de alarma y necrosis
    if (anyNecrosis && !alarmFired) {
      playTrigger('alarma');
      alarmFired = true;
    }

    // 8. touch.n >= 3: Falla de traducción / robot.mp3 + glitch visual de contraste
    if (sumFingers >= 3) {
      if (lastSumFingers < 3) {
        playTrigger('robot');
        const wrap = $('#stageWrap');
        if (wrap) {
          wrap.classList.add('glitch-active');
          setTimeout(() => wrap.classList.remove('glitch-active'), 650);
        }
        const banner = $('#glitchBanner');
        if (banner) {
          banner.classList.add('active');
          setTimeout(() => banner.classList.remove('active'), 1400);
        }
      }
      $('#statTension').textContent = `🤖 FALLA DE TRADUCCIÓN (${sumFingers} dedos)`;
      $('#statTension').style.color = 'var(--err)';
    }
  }

  const statFingersEl = $('#statFingers');
  if (statFingersEl) statFingersEl.textContent = String(currentSumFingers);
  lastSumFingers = currentSumFingers;

  // 9. Soltar contacto (touch.down = 0): Levantar los dedos del teléfono
  // Disparo (One-shot) pago.mp3 seguido del silencio/atenuación transaccional de bosque.flac
  if (activeCount === 0 && lastTouchCount > 0 && !isClimax) {
    playTrigger('pago');
    setGain('bosque', 0.06, 0.3);
    setTimeout(() => { if (A.ctx) setGain('bosque', AUDIO_DEFS.bosque.baseVol, 1.8); }, 1500);
    setGain('palpito', 0, 0.15);
    setGain('abeja', 0, 0.15);
    setGain('mala_abeja', 0, 0.15);
    setGain('maquina', 0, 0.25);
    $('#statTension').textContent = 'Armonía (En Espera)';
    $('#statTension').style.color = 'var(--ok)';
  }

  lastTouchCount = activeCount;
}

// ============================ MATRIZ DE CONEXIONES ====================
const CURVES = { lineal: n => n, suave: n => n * n * (3 - 2 * n), acelerada: n => n * n, rapida: n => Math.sqrt(n) };
const CURVE_LABEL = { lineal: 'lineal', suave: 'suave (S)', acelerada: 'acelerada', rapida: 'rápida' };
let maps = [], nextId = 1, learning = null;
const opt = (v, t) => `<option value="${v}">${t}</option>`;

const OPT_IN = (() => {
  let h = '', g = '';
  for (const c of Tacto.CHANNELS) {
    if (c.group !== g) { if (g) h += '</optgroup>'; g = c.group; h += `<optgroup label="${g}">`; }
    h += opt(c.name, `${c.name} · ${c.label}`);
  }
  return h + '</optgroup>';
})();

const OPT_OUT = (() => {
  let h = '', g = '';
  for (const t of Object.values(T)) {
    if (t.g !== g) { if (g) h += '</optgroup>'; g = t.g; h += `<optgroup label="${g}">`; }
    h += opt(t.id, `${t.id.split('.').slice(1).join('.')} · ${t.label}`);
  }
  return h + '</optgroup>';
})();

function newMap(inn = 'touch.down', out = 'audio.abeja', o = {}) {
  const c = CHN[inn] || Tacto.CHANNELS[0];
  const t = T[out] || Object.values(T)[0];
  return { id: nextId++, on: true, in: c.name, inMin: c.min, inMax: c.max, out: t.id, outMin: t.min, outMax: t.max, curve: 'lineal', invert: false, smooth: 0.3, ...o };
}

function starter() {
  nextId = 1;
  maps = [
    newMap('touch.down', 'audio.palpito', { outMin: 0, outMax: 1, smooth: 0.1 }),
    newMap('touch.down', 'audio.abeja', { outMin: 0, outMax: 1, smooth: 0.1 }),
    newMap('ang.g', 'vuelo.inclinacion.x', { inMin: -45, inMax: 45, outMin: -40, outMax: 40, smooth: 0.3 }),
    newMap('ang.b', 'vuelo.inclinacion.y', { inMin: -25, inMax: 65, outMin: -25, outMax: 25, smooth: 0.3 }),
    newMap('touch.dist', 'vuelo.zoom', { inMin: 0.1, inMax: 1.2, outMin: 0.7, outMax: 2.6, smooth: 0.2 }),
    newMap('touch.dist', 'flor.color_exotico', { inMin: 0.1, inMax: 1.0, outMin: 0, outMax: 260, smooth: 0.15 }),
    newMap('touch.d', 'flor.necrosis', { inMin: 30, inMax: 90, outMin: 0, outMax: 1, smooth: 0.2 }),
    newMap('touch.x', 'polen.desfase', { inMin: 0, inMax: 1, outMin: 1, outMax: 4, smooth: 0.2 })
  ];
}

try {
  maps = JSON.parse(ls('umwelt.exp.maps.v3') || 'null') || [];
  maps = maps.filter(m => CHN[m.in] && T[m.out]);
  nextId = Math.max(0, ...maps.map(m => m.id)) + 1;
} catch { maps = []; }
if (!maps.length) starter();

const save = () => ls('umwelt.exp.maps.v3', JSON.stringify(maps));

function rowEl(m) {
  const d = document.createElement('div');
  d.className = 'row' + (learning && learning.m === m ? ' learning' : '');
  d.innerHTML = `
    <div class="r1">
      <input type="checkbox" class="on" title="activar">
      <select class="in"></select><span>→</span><select class="out"></select>
      <button class="learn" title="Aprender canal">${learning && learning.m === m ? 'mueve…' : 'Aprender'}</button>
      <button class="del" title="Quitar"><svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="r2">
      <span>entrada</span><input type="number" class="inMin" step="any"><span>a</span><input type="number" class="inMax" step="any">
      <span>salida</span><input type="number" class="outMin" step="any"><span>a</span><input type="number" class="outMax" step="any">
    </div>
    <div class="r3">
      <select class="curve"></select>
      <label><input type="checkbox" class="inv"> invertir</label>
      <span>suavizado</span><input type="range" class="smooth" min="0" max="0.95" step="0.05">
    </div>
    <div class="meter"><i class="mi"></i><i class="o mo"></i><span class="val">–</span></div>`;

  const q = s => d.querySelector(s);
  q('.in').innerHTML = OPT_IN; q('.out').innerHTML = OPT_OUT;
  q('.curve').innerHTML = Object.keys(CURVES).map(k => opt(k, CURVE_LABEL[k])).join('');

  q('.on').checked = m.on; q('.in').value = m.in; q('.out').value = m.out;
  q('.curve').value = m.curve; q('.inv').checked = m.invert; q('.smooth').value = m.smooth;
  for (const k of ['inMin', 'inMax', 'outMin', 'outMax']) q('.' + k).value = m[k];

  q('.on').onchange = e => { m.on = e.target.checked; save(); };
  q('.in').onchange = e => { m.in = e.target.value; m.inMin = CHN[m.in].min; m.inMax = CHN[m.in].max; save(); renderRows(); };
  q('.out').onchange = e => { m.out = e.target.value; m.outMin = T[m.out].min; m.outMax = T[m.out].max; save(); renderRows(); };
  q('.curve').onchange = e => { m.curve = e.target.value; save(); };
  q('.inv').onchange = e => { m.invert = e.target.checked; save(); };
  q('.smooth').oninput = e => { m.smooth = +e.target.value; save(); };
  for (const k of ['inMin', 'inMax', 'outMin', 'outMax']) q('.' + k).onchange = e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { m[k] = v; save(); } };
  q('.del').onclick = () => { maps = maps.filter(x => x !== m); save(); renderRows(); };
  q('.learn').onclick = () => { learning = learning && learning.m === m ? null : { m, base: snapshot(), t0: performance.now() }; renderRows(); };

  m._el = d;
  return d;
}

function renderRows() {
  const box = $('#rows');
  box.innerHTML = '';
  if (!maps.length) box.innerHTML = '<div class="empty">Sin conexiones. Pulsa “＋ Nueva conexión” o “Restablecer”.</div>';
  for (const m of maps) box.appendChild(rowEl(m));
}

const snapshot = () => Object.fromEntries(Tacto.CHANNELS.map(c => [c.name, tacto.get(c.name)]));
function checkLearn() {
  if (!learning) return;
  if (performance.now() - learning.t0 > 8000) { learning = null; renderRows(); return; }
  let best = null, bestD = 0.2;
  for (const c of Tacto.CHANNELS) {
    const v = tacto.get(c.name), b = learning.base[c.name];
    if (v == null || b == null) continue;
    const dd = Math.abs(v - b) / (c.max - c.min || 1);
    if (dd > bestD) { bestD = dd; best = c; }
  }
  if (best) {
    learning.m.in = best.name; learning.m.inMin = best.min; learning.m.inMax = best.max;
    learning = null; save(); renderRows();
  }
}

function evalMaps() {
  checkLearn();
  const now = {};
  for (const m of maps) {
    if (!m.on) continue;
    const t = T[m.out], v = tacto.get(m.in);
    if (v == null) { m.inV = null; continue; }
    const span = m.inMax - m.inMin || 1;
    m.inN = clamp((v - m.inMin) / span);
    let n = m.invert ? 1 - m.inN : m.inN;
    n = CURVES[m.curve](n);
    m.s = m.s == null ? n : m.s + (n - m.s) * (1 - m.smooth);
    const o = t.log && m.outMin > 0 && m.outMax > 0
      ? m.outMin * Math.pow(m.outMax / m.outMin, m.s)
      : m.outMin + m.s * (m.outMax - m.outMin);
    m.inV = v; m.outV = o; now[m.out] = o;
  }
  for (const id in now) setT(id, now[id]);
}

function updateMeters() {
  for (const m of maps) {
    if (!m._el) continue;
    m._el.querySelector('.mi').style.width = (m.inV == null ? 0 : m.inN) * 100 + '%';
    m._el.querySelector('.mo').style.width = (m.s == null || m.inV == null ? 0 : m.s) * 100 + '%';
    m._el.querySelector('.val').textContent = m.inV == null ? 'sin datos' : `${fmt(m.inV)} → ${fmt(m.outV)}`;
  }
}

$('#addRow').onclick = () => { maps.push(newMap()); save(); renderRows(); };
$('#starter').onclick = () => { if (confirm('¿Restablecer matriz a la configuración de polinización?')) { starter(); save(); renderRows(); } };
$('#expBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 2, maps }, null, 2)], { type: 'application/json' }));
  a.download = 'umwelt-conexiones.json'; a.click();
};
$('#impBtn').onclick = () => $('#impFile').click();
$('#impFile').onchange = async e => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    maps = (j.maps || []).filter(m => CHN[m.in] && T[m.out]);
    nextId = Math.max(0, ...maps.map(m => m.id)) + 1;
    save(); renderRows();
  } catch { alert('Archivo no válido.'); }
  e.target.value = '';
};

// ============================ QR, SALA Y LOBBY OBLIGATORIO ============
const qrLib = () => window.qrcode ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  s.onload = ok; s.onerror = no; document.head.appendChild(s);
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
}

function updateLobbyPlayers() {
  updateLobbyBrokerStatus(tacto.estado);
  const realPhones = Object.values(tacto.devices).filter(d => d.online && d.id !== 'raton');
  const count = realPhones.length;
  const countEl = $('#playerCount');
  const listEl = $('#playerList');
  const startBtn = $('#startGameBtn');

  if (countEl) countEl.textContent = String(count);

  if (listEl) {
    if (count === 0) {
      listEl.innerHTML = '<span class="no-players">Esperando que al menos un teléfono escanee el QR y entre…</span>';
    } else {
      listEl.innerHTML = realPhones.map(d => `
        <div class="player-pill">
          <span class="player-dot"></span>
          <span>🐝 <b>${escapeHtml(d.name || 'Invitado')}</b></span>
          <span class="player-status">(Listo para volar)</span>
        </div>
      `).join('');
    }
  }

  if (startBtn) {
    if (count === 0) {
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      startBtn.textContent = '⏳ Esperando al menos 1 teléfono…';
    } else {
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
      startBtn.textContent = `🚀 INICIAR VUELO DE LA COLMENA (${count} jugador${count > 1 ? 'es' : ''} listo${count > 1 ? 's' : ''})`;
    }
  }
}

// ==================== ONBOARDING CURATORIAL NARRATIVO (PASOS 1 AL 4) ====================
let curOnboardingStep = 1;
function setOnboardingStep(step) {
  curOnboardingStep = step;
  for (let s = 1; s <= 4; s++) {
    const el = $(`#step${s}`);
    if (el) {
      if (s === step) el.classList.add('active');
      else el.classList.remove('active');
    }
  }
}

// Al hacer clic en los pasos 1, 2 o 3, avanza secuencialmente al siguiente
for (let s = 1; s <= 3; s++) {
  const el = $(`#step${s}`);
  if (el) {
    el.onclick = (e) => {
      e.stopPropagation();
      setOnboardingStep(s + 1);
    };
  }
}

const lobbyModal = $('#lobbyModal');
if (lobbyModal) {
  lobbyModal.onclick = (e) => {
    // Si se hace clic en el fondo durante los pasos 1..3, avanza
    if (curOnboardingStep < 4) {
      setOnboardingStep(curOnboardingStep + 1);
    }
  };
}

// Avance también con teclado (Espacio, Enter, Flecha derecha)
window.addEventListener('keydown', e => {
  if (lobbyModal && !lobbyModal.classList.contains('hidden') && curOnboardingStep < 4) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      setOnboardingStep(curOnboardingStep + 1);
    }
  }
});

const startGameBtn = $('#startGameBtn');
if (startGameBtn) {
  startGameBtn.onclick = async (e) => {
    e.stopPropagation();
    if (startGameBtn.disabled) return;
    if (lobbyModal) lobbyModal.classList.add('hidden');
    await ensureAudio();
    const arena = $('#arena');
    if (arena) arena.scrollIntoView({ behavior: 'smooth' });
  };
}

const skipLobbyBtn = $('#skipLobbyBtn');
if (skipLobbyBtn) {
  skipLobbyBtn.onclick = async (e) => {
    e.stopPropagation();
    if (lobbyModal) lobbyModal.classList.add('hidden');
    await ensureAudio();
    const arena = $('#arena');
    if (arena) arena.scrollIntoView({ behavior: 'smooth' });
  };
}

const reopenLobbyBtn = $('#reopenLobbyBtn');
if (reopenLobbyBtn) {
  reopenLobbyBtn.onclick = () => {
    setOnboardingStep(4); // Salta directamente al código QR
    if (lobbyModal) lobbyModal.classList.remove('hidden');
  };
}

async function updateJoin() {
  const CFG = window.TACTO_CONFIG || {}, Q = new URLSearchParams(location.search);
  let base = CFG.phoneUrl || null, local = false;
  try {
    const i = await (await fetch('info', { cache: 'no-store' })).json();
    if (i.baseUrl) { base = CFG.phoneUrl || i.baseUrl + '/'; local = true; }
  } catch {}
  if (!base) base = new URL('index.html', location.href).href;
  let u = base + (base.includes('?') ? '&' : '?') + 'sala=' + tacto.sala;
  const effectiveBroker = tacto.broker || CFG.broker || Q.get('broker') || Tacto.PUBLIC_BROKER;
  u += '&broker=' + encodeURIComponent(effectiveBroker);
  const effectiveUser = CFG.username || Q.get('u');
  const effectivePass = CFG.password || Q.get('p');
  if (effectiveUser) u += '&u=' + encodeURIComponent(effectiveUser);
  if (effectivePass) u += '&p=' + encodeURIComponent(effectivePass);

  // Actualizar textos en panel inferior y en modal pop-up de lobby
  if ($('#phoneUrl')) $('#phoneUrl').textContent = u;
  if ($('#lblSala')) $('#lblSala').textContent = tacto.sala;
  if ($('#lobbySala')) $('#lobbySala').textContent = tacto.sala;

  const lobbyQr = $('#lobbyQr');
  const bottomQr = $('#qr');

  if (local) {
    const qrSrc = 'qr.svg?u=' + encodeURIComponent(u);
    if (bottomQr) { bottomQr.src = qrSrc; bottomQr.hidden = false; }
    if (lobbyQr) { lobbyQr.src = qrSrc; lobbyQr.hidden = false; }
    return;
  }
  try {
    await qrLib();
    const q = window.qrcode(0, 'M'); q.addData(u); q.make();
    const qrData = q.createDataURL(4, 4);
    if (bottomQr) { bottomQr.src = qrData; bottomQr.hidden = false; }
    if (lobbyQr) { lobbyQr.src = qrData; lobbyQr.hidden = false; }
  } catch {
    if (bottomQr) bottomQr.hidden = true;
    if (lobbyQr) lobbyQr.hidden = true;
  }
}

$('#salaNueva').onclick = () => {
  tacto.cambiarSala(Tacto.nuevaSala());
  updateJoin();
  updateLobbyPlayers();
};

tacto.on('dispositivo', () => {
  updateLobbyPlayers();
});
tacto.on('datos', () => {
  updateLobbyPlayers();
});

// ============================ BUCLE PRINCIPAL =========================
renderRows();
updateJoin();
updateLobbyPlayers();
tacto.connect().then(() => {
  $('#brokerInfo').textContent = tacto.broker.replace(/^wss?:\/\//, '');
  updateJoin();
  updateLobbyPlayers();
}).catch(e => { $('#estado').textContent = '● ' + (e.message || 'sin conexión'); });

let frame = 0;
(function mainLoop(now) {
  try {
    evalMaps();
    processGestures();
    update3DWorld(now);

    if (++frame % 4 === 0) {
      updateMeters();
      updateLobbyPlayers();
      const activePhones = Object.values(tacto.devices).filter(k => k.online && k.id !== 'raton');
      if (activePhones.length > 0) {
        $('#waiting').innerHTML = `<b>📱 PRÓTESIS CONECTADA (${activePhones[0].name || 'Teléfono'})</b><span>Giroscopio y tacto activos · Inclina para volar y toca la pantalla para fecundar.</span>`;
        $('#waiting').style.borderColor = 'rgba(74, 222, 128, 0.6)';
        if (!window.__phoneToastDismissed) {
          window.__phoneToastDismissed = true;
          setTimeout(() => { if (activePhones.length > 0) $('#waiting').hidden = true; }, 4500);
        }
      } else {
        window.__phoneToastDismissed = false;
        $('#waiting').innerHTML = `<b>Esperando conexión con teléfonos polinizadores...</b><span>Escanea el QR en pantalla con tu teléfono para activar el giroscopio y tacto.</span>`;
        $('#waiting').style.borderColor = 'var(--line-2)';
        $('#waiting').hidden = false;
      }
    }
  } catch (err) {
    console.error('Frame loop error:', err);
  }
  requestAnimationFrame(mainLoop);
})(performance.now());

window.__umwelt = { tacto, A, P, T, flowerSpots, SWARM };
