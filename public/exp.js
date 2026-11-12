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

tgt('vuelo.inclinacion.x', 'Vuelo 3D', 'giro de cabeza / alabeo (roll %)', -40, 40, 0, { apply: v => { phoneCamRoll = v; } });
tgt('vuelo.inclinacion.y', 'Vuelo 3D', 'cabeceo / picada (pitch %)', -30, 30, 0, { apply: v => { phoneCamPitch = v; } });
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

const floriImg = new Image();
floriImg.crossOrigin = 'anonymous';
floriImg.src = 'imagen/flori.png';
floriImg.onload = () => {
  renderInfiniteMeadowBase();
};

function renderInfiniteMeadowBase() {
  // Mosaico botánico continuo y luminoso para una visualización natural y viva
  const pat = bgx.createPattern(floriImg, 'repeat');
  bgx.fillStyle = pat;
  bgx.fillRect(0, 0, baseCv.width, baseCv.height);

  // Viñeta periférica atmosférica suave: mantiene el prado central hermoso, vivo y nítido
  const cx = baseCv.width / 2, cy = baseCv.height / 2;
  const grad = bgx.createRadialGradient(cx, cy, baseCv.width * 0.28, cx, cy, baseCv.width * 0.62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.75, 'rgba(3, 8, 5, 0.16)');
  grad.addColorStop(1, 'rgba(3, 8, 5, 0.52)');
  bgx.fillStyle = grad;
  bgx.fillRect(0, 0, baseCv.width, baseCv.height);
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
}
$('#resetFieldBtn').onclick = resetField;
$('#modalResetBtn').onclick = resetField;

// 140 partículas del enjambre
const SWARM = Array.from({ length: 140 }, () => ({
  x: Math.random() * 1280,
  y: Math.random() * 720,
  z: 0.4 + Math.random() * 2.2,
  vx: (Math.random() - 0.5) * 1.2,
  vy: (Math.random() - 0.5) * 1.2,
  orbitAngle: Math.random() * Math.PI * 2,
  speed: 0.7 + Math.random() * 1.2,
  size: 1.4 + Math.random() * 2.2,
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
  if (nearest && minDist < 160) {
    nearest.attempts++;
    nearest.lastTime = performance.now();
    attempts = nearest.attempts;
  } else {
    flowerSpots.push({ x: px, y: py, attempts: 1, lastTime: performance.now() });
    if (flowerSpots.length > 80) flowerSpots.shift();
  }

  const angle = Math.sin(touchX * 18 + touchY * 11) * Math.PI * 2;
  const distance = Math.min(520, 16 * Math.pow(1.68, attempts - 1) * factorMult);
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
  const rad = (32 + Math.random() * 32) * radMult;

  if (isNecrosis) {
    lgx.globalCompositeOperation = 'source-over';
    const grad = lgx.createRadialGradient(targetWorldX, targetWorldY, 2, targetWorldX, targetWorldY, rad * 1.3);
    grad.addColorStop(0, 'rgba(18, 5, 3, 0.92)');
    grad.addColorStop(0.6, 'rgba(45, 12, 6, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lgx.fillStyle = grad;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad * 1.3, 0, Math.PI * 2);
    lgx.fill();
  } else {
    // 1. Halo de polen bioluminiscente en el punto de contacto
    lgx.globalCompositeOperation = 'lighter';
    const halo = lgx.createRadialGradient(targetWorldX, targetWorldY, 0, targetWorldX, targetWorldY, rad * 1.35);
    halo.addColorStop(0, 'rgba(230, 255, 61, 0.65)');
    halo.addColorStop(0.5, 'rgba(74, 222, 128, 0.3)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lgx.fillStyle = halo;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad * 1.35, 0, Math.PI * 2);
    lgx.fill();

    // 2. Flor fotográfica viva: toma cuadrantes de flori.png para que brote una flor hermosa y nítida
    lgx.globalCompositeOperation = 'source-over';
    lgx.globalAlpha = 0.95;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad, 0, Math.PI * 2);
    lgx.clip();
    
    const sliceIndex = Math.floor(Math.random() * 4);
    const sw = (floriImg.width || 2048) / 4;
    const sh = floriImg.height || 768;
    const sx = sliceIndex * sw;
    lgx.drawImage(floriImg, sx, 0, sw, sh, targetWorldX - rad, targetWorldY - rad, rad * 2, rad * 2);

    totalBlooms++;
  }
  lgx.restore();

  const coverage = Math.min(100, Math.round((totalBlooms / 800) * 100));
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

    // Soporte para modo Horizontal (Control de Play) con 2 pulgares:
    // Pulgar izquierdo dirige el timón de vuelo, pulgar derecho fecunda el campo
    let steerX = tx, steerY = ty;
    const t1x = dev.ch['t1.x'], t1y = dev.ch['t1.y'];
    const t2x = dev.ch['t2.x'], t2y = dev.ch['t2.y'];
    const hasTwoFingers = t1x != null && t2x != null;

    if (hasTwoFingers) {
      if (t1x <= t2x) { steerX = t1x; steerY = t1y; }
      else { steerX = t2x; steerY = t2y; }
    }

    if (isDown) {
      const centerTargetX = hasTwoFingers ? 0.25 : 0.5;
      const touchRoll = (steerX - centerTargetX) * 90;
      const touchPitch = (steerY - 0.5) * 65;
      targetRoll += touchRoll;
      targetPitch += touchPitch;
    }

    // Navegación por giroscopio (normalizado automáticamente para posición horizontal o vertical)
    const gy = dev.ch['ang.g'];
    const gx = dev.ch['ang.b'];
    if (gy != null && gx != null) {
      const gyroRoll = clamp(gy * 0.95, -50, 50);
      const gyroPitch = clamp((gx - 35) * 0.85, -40, 40);
      if (isDown) {
        targetRoll += gyroRoll * 0.45;
        targetPitch += gyroPitch * 0.45;
      } else {
        targetRoll += gyroRoll;
        targetPitch += gyroPitch;
      }
    }

    // Zoom táctil desde el teléfono con 2 dedos (pellizco)
    const td = dev.ch['touch.dist'];
    if (td != null && (dev.ch['touch.n'] || 0) >= 2) {
      P.zoom = clamp(0.7 + td * 1.6, 0.65, 3.2);
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

  const isUV = $('#stageWrap').classList.contains('uv-active');
  const isSatellite = P.zoom < 0.9;

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

  // Filtro cromático: solo en clímax irreversible o en vista explícita UV (para no alterar la fotografía original)
  if (isClimax) {
    autonomousHue = (autonomousHue + 0.6) % 360;
    lifeCv.style.filter = `hue-rotate(${autonomousHue}deg) saturate(110%) brightness(105%)`;
  } else if (isUV) {
    lifeCv.style.filter = `hue-rotate(220deg) saturate(135%) brightness(110%)`;
  } else {
    lifeCv.style.filter = 'none';
  }

  // Renderizar Partículas del Enjambre
  pgx.clearRect(0, 0, partCv.width, partCv.height);
  const pollinators = getActivePollinators();
  const onlinePhones = Object.values(tacto.devices).filter(k => k.online && k.id !== 'raton');
  $('#statPeers').textContent = String(onlinePhones.length);

  const isSwarming = pollinators.length > 0 || isClimax;

  // Fecundación continua directa por teléfonos móviles tocando la pantalla
  if (!isClimax) {
    for (const pol of pollinators) {
      if (pol.isDown && pol.id !== 'raton') {
        const sx = pol.tx * partCv.width;
        const sy = pol.ty * partCv.height;
        const cx = lifeCv.width / 2;
        const cy = lifeCv.height / 2;
        const wx = cx + (sx - partCv.width / 2) / P.zoom;
        const wy = cy + (sy - partCv.height / 2) / P.zoom;
        swarmDepositPollen(wx, wy, pol.td > 78, 1.35);
      }
    }
  }

  for (let i = 0; i < SWARM.length; i++) {
    const b = SWARM[i];

    if (isSwarming) {
      let targetScreenX = partCv.width / 2;
      let targetScreenY = partCv.height / 2;
      let targetIsDown = false;

      if (isClimax) {
        targetScreenX = partCv.width / 2 + Math.cos(now * 0.0025 + i) * (partCv.width * 0.35);
        targetScreenY = partCv.height / 2 + Math.sin(now * 0.0025 + i) * (partCv.height * 0.28);
        targetIsDown = false;
      } else {
        const pol = pollinators[i % pollinators.length];
        targetIsDown = pol.isDown;
        const disp = getDisplacement(pol.tx, pol.ty, P.desfaseMult);
        targetScreenX = (disp.worldX / lifeCv.width) * partCv.width;
        targetScreenY = (disp.worldY / lifeCv.height) * partCv.height;
      }

      const dx = targetScreenX - b.x;
      const dy = targetScreenY - b.y;
      const dist = Math.hypot(dx, dy);

      const force = clamp(260 / (dist + 20), 0.2, 3.2);
      b.vx += (dx / (dist || 1)) * force * 0.35;
      b.vy += (dy / (dist || 1)) * force * 0.35;
      // Vórtice espiral de colmena
      b.vx += (-dy / (dist || 1)) * (isClimax ? 3.0 : 1.8);
      b.vy += (dx / (dist || 1)) * (isClimax ? 3.0 : 1.8);
      b.vx *= 0.94;
      b.vy *= 0.94;

      // Depositar polen si el polinizador está presionando y la abeja pasa cerca
      if (targetIsDown && dist < 125 && Math.random() > 0.25 && !isClimax) {
        const isNecrotic = P.necrosis > 0.6 || isRightClick;
        const cx = lifeCv.width / 2;
        const cy = lifeCv.height / 2;
        const wx = cx + (b.x - partCv.width / 2) / P.zoom;
        const wy = cy + (b.y - partCv.height / 2) / P.zoom;
        swarmDepositPollen(wx, wy, isNecrotic, 0.85);
        b.charge = 1;
      }
    } else {
      b.orbitAngle += 0.018 * b.speed;
      b.vx += Math.cos(b.orbitAngle) * 0.1 - curCamRoll * 0.008;
      b.vy += Math.sin(b.orbitAngle) * 0.07 - curCamPitch * 0.008;
      b.vx *= 0.96;
      b.vy *= 0.96;
    }

    b.x += b.vx;
    b.y += b.vy;

    // Envolver de forma dinámica en toda la pantalla sin cortes
    if (b.x < -30) b.x += partCv.width + 60;
    if (b.x > partCv.width + 30) b.x -= partCv.width + 60;
    if (b.y < -30) b.y += partCv.height + 60;
    if (b.y > partCv.height + 30) b.y -= partCv.height + 60;

    const rad = b.size * (0.8 + 0.4 / b.z) * (P.zoom > 1.35 ? 1.5 : 1);
    const alpha = clamp(0.25 + (1 / b.z) * 0.45, 0.15, 0.9);

    pgx.beginPath();
    pgx.arc(b.x, b.y, rad, 0, Math.PI * 2);
    const hue = b.charge > 0 ? (uvHue + 55) % 360 : (b.z > 1.5 ? 55 : 45);
    pgx.fillStyle = `hsla(${hue}, 95%, ${b.charge > 0 ? '75%' : '60%'}, ${alpha})`;
    if ((isUV || P.zoom > 1.35) && b.z < 1.2) {
      pgx.shadowBlur = 12;
      pgx.shadowColor = `hsla(${hue}, 100%, 70%, 0.65)`;
    } else {
      pgx.shadowBlur = 0;
    }
    pgx.fill();
    pgx.shadowBlur = 0;
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

tacto.on('estado', s => {
  const e = $('#estado');
  e.className = 'dot ' + (s === 'conectado' ? 'on' : 'warn');
  e.textContent = '● ' + s;
});
tacto.on('error', e => {
  $('#estado').className = 'dot warn';
  $('#estado').textContent = '● ' + (e.message || 'error');
});

// ============================ CONTROLES DE ESCRITORIO =================
const mouseCoords = { x: 0.5, y: 0.5 };
let simulatedFingers = 1;
let simulatedZoom = 1.05;
let isRightClick = false;
let mouseIsDown = false;
let mouseInside = false;

stage.addEventListener('contextmenu', e => e.preventDefault());

// Selector de vista
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    if (view === 'satellite') {
      simulatedZoom = 0.75;
      P.zoom = 0.75;
      $('#stageWrap').classList.remove('uv-active');
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(6500, A.ctx.currentTime, 0.15);
    } else if (view === 'fpv') {
      simulatedZoom = 1.15;
      P.zoom = 1.15;
      $('#stageWrap').classList.remove('uv-active');
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(8500, A.ctx.currentTime, 0.15);
    } else if (view === 'uv') {
      simulatedZoom = 2.15;
      P.zoom = 2.15;
      $('#stageWrap').classList.add('uv-active');
      P.colorExotico = 220;
      if (A.filt && A.ctx) A.filt.frequency.setTargetAtTime(11800, A.ctx.currentTime, 0.15);
    }
  };
});

stage.addEventListener('wheel', e => {
  e.preventDefault();
  simulatedZoom = clamp(simulatedZoom - e.deltaY * 0.0018, 0.65, 3.2);
  P.zoom = simulatedZoom;
  document.querySelectorAll('.view-btn').forEach(b => {
    const v = b.dataset.view;
    if (v === 'satellite') b.classList.toggle('active', P.zoom < 0.95 && !$('#stageWrap').classList.contains('uv-active'));
    if (v === 'fpv') b.classList.toggle('active', P.zoom >= 0.95 && P.zoom < 1.7 && !$('#stageWrap').classList.contains('uv-active'));
    if (v === 'uv') b.classList.toggle('active', $('#stageWrap').classList.contains('uv-active') || P.zoom >= 1.7);
  });
}, { passive: false });

stage.addEventListener('pointerdown', () => {
  ensureAudio().catch(() => {});
});

stage.addEventListener('pointermove', () => {
  // El ratón de la laptop solo interactúa con la plataforma (vistas, zoom con rueda, botones)
  // La fecundación y el timón de vuelo quedan exclusivamente gobernados por los teléfonos conectados
});

stage.addEventListener('pointerleave', () => {});
stage.addEventListener('pointerup', () => {});

stage.addEventListener('pointerleave', () => {
  mouseInside = false;
  mouseCamRoll = 0;
  mouseCamPitch = 0;
});

stage.addEventListener('pointerup', e => {
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
let lastTouchCount = 0, alarmFired = false;
let touchPrevX = 0.5, touchPrevY = 0.5, touchSpeed = 0;
let touchDownTime = 0, lastMoveTime = 0;

function processGestures() {
  const pollinators = getActivePollinators();
  const touchingPollinators = pollinators.filter(p => p.isDown);
  const activeCount = touchingPollinators.length;
  const now = performance.now();

  if (activeCount > 0 && !isClimax) {
    if (lastTouchCount === 0) {
      touchDownTime = now;
      lastMoveTime = now;
      alarmFired = false;
      if (A.ctx) setGain('palpito', 1.0, 0.04);
    }

    let sumFingers = 0;
    let anyNecrosis = false;

    // Calcular velocidad para detectar desplazamiento fluido vs rigidez en un punto
    const p1 = touchingPollinators[0];
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

    const isStress = anyNecrosis || sumFingers >= 4 || isRigid;

    // AUDIO ADAPTATIVO:
    // ESTADO 1: ARMÓNICO (Abeja normal zumbando nítida y presente)
    // ESTADO 2: ESTRÉS (Mala abeja irritada y agresiva)
    if (isStress) {
      setGain('mala_abeja', 0.95, 0.06);
      setGain('abeja', 0.08, 0.08);

      if (anyNecrosis) {
        $('#statTension').textContent = 'SOBRECARGA (Necrosis)';
        $('#statTension').style.color = 'var(--err)';
      } else if (sumFingers >= 4) {
        $('#statTension').textContent = 'HISTERIA COLECTIVA';
        $('#statTension').style.color = 'var(--err)';
      } else {
        $('#statTension').textContent = 'Abeja Irritada (Rigidez)';
        $('#statTension').style.color = 'var(--warn)';
      }
    } else {
      // Vuelo armónico fluido y continuo
      setGain('abeja', 0.95, 0.06);
      setGain('mala_abeja', 0.0, 0.08);
      $('#statTension').textContent = 'Armonía (Vuelo Activo)';
      $('#statTension').style.color = 'var(--ok)';

      // Modulación orgánica del tono de vuelo de la abeja con la velocidad
      if (A.nodes['abeja'] && A.nodes['abeja'].playbackRate) {
        const rate = clamp(0.94 + dPos * 4.2, 0.90, 1.25);
        A.nodes['abeja'].playbackRate.setTargetAtTime(rate, A.ctx.currentTime, 0.08);
      }
    }

    // Si el contacto persiste más de 1.8 segundos, la colmena mecánica empieza a zumbar
    const elapsed = (now - touchDownTime) / 1000;
    if (elapsed > 1.8) {
      const volMaq = Math.min(0.85, (elapsed - 1.8) * 0.35);
      setGain('maquina', volMaq, 0.1);
    } else {
      setGain('maquina', 0, 0.1);
    }

    if (anyNecrosis && !alarmFired) {
      playTrigger('alarma');
      alarmFired = true;
    }

    if (sumFingers >= 3 && lastTouchCount < 3) playTrigger('robot');
  }

  // Al soltar todos los contactos: apagar abejas suavemente y sonar pago
  if (activeCount === 0 && lastTouchCount > 0 && !isClimax) {
    playTrigger('pago');
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

// Botones del Lobby y Navegación
const lobbyModal = $('#lobbyModal');
const startGameBtn = $('#startGameBtn');
if (startGameBtn) {
  startGameBtn.onclick = async () => {
    if (startGameBtn.disabled) return;
    if (lobbyModal) lobbyModal.classList.add('hidden');
    await ensureAudio();
    const arena = $('#arena');
    if (arena) arena.scrollIntoView({ behavior: 'smooth' });
  };
}

const reopenLobbyBtn = $('#reopenLobbyBtn');
if (reopenLobbyBtn) {
  reopenLobbyBtn.onclick = () => {
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
  if (!local || Q.get('broker')) u += '&broker=' + encodeURIComponent(tacto.broker || Tacto.PUBLIC_BROKER);
  if (CFG.username) u += '&u=' + encodeURIComponent(CFG.username);
  if (CFG.password) u += '&p=' + encodeURIComponent(CFG.password);

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
  requestAnimationFrame(mainLoop);
})(performance.now());

window.__umwelt = { tacto, A, P, T, flowerSpots, SWARM };
