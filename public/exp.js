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
  bosque: { url: 'audio_bee/bosque.m4a', fallback: 'audio_bee/bosque.flac', loop: true, baseVol: 0.45 },
  palpito: { url: 'audio_bee/palpito.m4a', fallback: 'audio_bee/palpito.wav', loop: true, baseVol: 0.9 },
  abeja: { url: 'audio_bee/abeja.m4a', fallback: 'audio_bee/abeja.wav', loop: true, baseVol: 0.85 },
  mala_abeja: { url: 'audio_bee/mala_abeja.mp3', loop: true, baseVol: 0.85 },
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
    g.connect(A.filt);
    s.start();
    A.nodes[k] = s;
    A.gains[k] = g;
  }
  
  const bBadge = $('#b-bosque');
  if (bBadge) bBadge.classList.add('active');
  $('#audioBtn').textContent = 'Ecosistema Acústico Activo';
  $('#audioBtn').classList.remove('primary');
}

$('#audioBtn').onclick = initSoundscape;

// Audición interactiva de sonidos desde el Cajón 2
document.querySelectorAll('#soundBadges .sound-badge').forEach(badge => {
  badge.onclick = async () => {
    if (!A.ctx) await initSoundscape();
    const snd = badge.dataset.snd;
    if (!snd) return;
    if (AUDIO_DEFS[snd]?.loop) {
      setGain(snd, 1.0, 0.05);
      setTimeout(() => {
        if (!mouseIsDown) setGain(snd, snd === 'bosque' ? AUDIO_DEFS.bosque.baseVol : 0, 0.5);
      }, 2600);
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
  // Mosaico botánico continuo y simétrico para eliminar cualquier borde
  const pat = bgx.createPattern(floriImg, 'repeat');
  bgx.fillStyle = pat;
  bgx.fillRect(0, 0, baseCv.width, baseCv.height);
  // Capa sepia fría marchita en reposo
  bgx.fillStyle = 'rgba(4, 10, 6, 0.48)';
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

// Pintado Orgánico Suave por el Enjambre
function swarmDepositPollen(targetWorldX, targetWorldY, isNecrosis) {
  if (!floriImg.complete) return;
  
  lgx.save();
  const rad = 22 + Math.random() * 26;
  const grad = lgx.createRadialGradient(targetWorldX, targetWorldY, 2, targetWorldX, targetWorldY, rad);

  if (isNecrosis) {
    lgx.globalCompositeOperation = 'source-over';
    grad.addColorStop(0, 'rgba(12, 4, 3, 0.45)');
    grad.addColorStop(0.7, 'rgba(12, 4, 3, 0.2)');
    grad.addColorStop(1, 'rgba(12, 4, 3, 0)');
    lgx.fillStyle = grad;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad, 0, Math.PI * 2);
    lgx.fill();
  } else {
    lgx.globalCompositeOperation = 'lighter';
    lgx.globalAlpha = 0.085;
    lgx.beginPath();
    lgx.arc(targetWorldX, targetWorldY, rad, 0, Math.PI * 2);
    lgx.clip();
    
    // Mosaico botánico continuo para no estirar la imagen
    const pat = lgx.createPattern(floriImg, 'repeat');
    lgx.fillStyle = pat;
    lgx.fillRect(targetWorldX - rad, targetWorldY - rad, rad * 2, rad * 2);
    totalBlooms++;
  }
  lgx.restore();

  const coverage = Math.min(100, Math.round((totalBlooms / 1500) * 100));
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
  setGain('abeja', 0.9);
}

// Polinizadores activos
function getActivePollinators() {
  const list = [];
  
  for (const dev of Object.values(tacto.devices)) {
    if (!dev.online) continue;
    const isDown = (dev.ch['touch.down'] || 0) >= 0.5;
    if (isDown) {
      list.push({
        id: dev.id, name: dev.name,
        tx: dev.ch['touch.x'] ?? 0.5,
        ty: dev.ch['touch.y'] ?? 0.5,
        td: dev.ch['touch.d'] || 40,
        tn: dev.ch['touch.n'] || 1,
        gy: dev.ch['ang.g'],
        gx: dev.ch['ang.b'],
        isDown: true
      });
    }
  }

  // Ratón de laptop (si está habilitado)
  if ($('#mouseDev').checked && !isClimax) {
    if (mouseIsDown) {
      list.push({
        id: 'raton', name: 'laptop',
        tx: mouseCoords.x, ty: mouseCoords.y,
        td: isRightClick ? 95 : 42,
        tn: simulatedFingers,
        isDown: true
      });
    } else if (mouseInside) {
      // Ratón sobrevolando (curiosidad del enjambre sin pintar)
      list.push({
        id: 'raton_hover', name: 'guía',
        tx: mouseCoords.x, ty: mouseCoords.y,
        td: 20,
        tn: 1,
        isDown: false
      });
    }
  }

  return list;
}

// ============================ BUCLE 3D Y PERSPECTIVA ==================
let curCamRoll = 0, curCamPitch = 0;
function update3DWorld(now) {
  syncCanvasSizes();

  // Suavizado cinemático con inercia aérea sin mareo
  curCamRoll += (P.camRoll - curCamRoll) * 0.05;
  curCamPitch += (P.camPitch - curCamPitch) * 0.05;

  const isMacro = P.zoom > 1.4;
  const isSatellite = P.zoom < 0.9;
  $('#stageWrap').classList.toggle('macro-active', isMacro);

  if (isMacro) {
    $('#statChroma').textContent = `Macro Street View (UV ${Math.round(P.colorExotico)}°)`;
  } else if (isSatellite) {
    $('#statChroma').textContent = 'Perspectiva Satelital';
  } else {
    $('#statChroma').textContent = 'Vuelo FPV Natural';
  }

  // Perspectiva 3D con descenso natural
  const rotX = isSatellite ? 12 : (isMacro ? 16 + curCamPitch * 0.15 : 20 + curCamPitch * 0.2);
  const rotZ = -curCamRoll * 0.2;
  const transX = -curCamRoll * 2.5;
  const transY = -curCamPitch * 1.5 + (isMacro ? (P.zoom - 1.4) * 90 : 0);
  const scale = P.zoom;

  groundPlane.style.transform = `rotateX(${rotX}deg) rotateZ(${rotZ}deg) translate3d(${transX}px, ${transY}px, 0) scale(${scale})`;

  // Ciclo cromático autónomo en fase de clímax irreversible
  if (isClimax) autonomousHue = (autonomousHue + 0.6) % 360;
  const uvHue = isClimax ? autonomousHue : (P.colorExotico + (isMacro ? (P.zoom - 1.3) * 110 : 0)) % 360;
  const sat = isSatellite ? 70 : 100 + (isMacro ? (P.zoom - 1.2) * 130 : 0);
  const bri = isSatellite ? 75 : 100 + (isMacro ? (P.zoom - 1.35) * 25 : 0);
  lifeCv.style.filter = `hue-rotate(${uvHue}deg) saturate(${sat}%) brightness(${bri}%)`;

  // Renderizar Partículas del Enjambre
  pgx.clearRect(0, 0, partCv.width, partCv.height);
  const pollinators = getActivePollinators();
  const onlineCount = Object.keys(tacto.devices).filter(k => tacto.devices[k].online).length;
  $('#statPeers').textContent = String(Math.max(1, onlineCount + ($('#mouseDev').checked ? 1 : 0)));

  const isSwarming = pollinators.length > 0 || isClimax;

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

      // SOLO depositar polen si el usuario está tocando / presionando activamente
      if (targetIsDown && dist < 85 && Math.random() > 0.38 && !isClimax) {
        const isNecrotic = P.necrosis > 0.6 || isRightClick;
        const wx = (b.x / partCv.width) * lifeCv.width;
        const wy = (b.y / partCv.height) * lifeCv.height;
        swarmDepositPollen(wx, wy, isNecrotic);
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

    const rad = b.size * (0.8 + 0.4 / b.z) * (isMacro ? 1.5 : 1);
    const alpha = clamp(0.25 + (1 / b.z) * 0.45, 0.15, 0.9);

    pgx.beginPath();
    pgx.arc(b.x, b.y, rad, 0, Math.PI * 2);
    const hue = b.charge > 0 ? (uvHue + 55) % 360 : (b.z > 1.5 ? 55 : 45);
    pgx.fillStyle = `hsla(${hue}, 95%, ${b.charge > 0 ? '75%' : '60%'}, ${alpha})`;
    pgx.fill();
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

// Selector de vista rápida
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    if (view === 'satellite') {
      simulatedZoom = 0.75;
      P.zoom = 0.75;
    } else if (view === 'fpv') {
      simulatedZoom = 1.05;
      P.zoom = 1.05;
    } else if (view === 'macro') {
      simulatedZoom = 1.85;
      P.zoom = 1.85;
    }
  };
});

stage.addEventListener('wheel', e => {
  e.preventDefault();
  simulatedZoom = clamp(simulatedZoom - e.deltaY * 0.0018, 0.65, 2.6);
  P.zoom = simulatedZoom;
  document.querySelectorAll('.view-btn').forEach(b => {
    const v = b.dataset.view;
    b.classList.toggle('active', 
      (v === 'satellite' && P.zoom < 0.9) ||
      (v === 'macro' && P.zoom > 1.4) ||
      (v === 'fpv' && P.zoom >= 0.9 && P.zoom <= 1.4)
    );
  });
}, { passive: false });

stage.addEventListener('pointerdown', e => {
  if (!$('#mouseDev').checked || isClimax) return;
  mouseIsDown = true;
  isRightClick = e.button === 2 || e.shiftKey || e.altKey;
  stage.setPointerCapture(e.pointerId);
  const r = stage.getBoundingClientRect();
  mouseCoords.x = clamp((e.clientX - r.left) / r.width);
  mouseCoords.y = clamp((e.clientY - r.top) / r.height);
});

stage.addEventListener('pointermove', e => {
  if (!$('#mouseDev').checked) return;
  mouseInside = true;
  const r = stage.getBoundingClientRect();
  const nx = (e.clientX - r.left) / r.width - 0.5;
  const ny = (e.clientY - r.top) / r.height - 0.5;
  mouseCoords.x = clamp((e.clientX - r.left) / r.width);
  mouseCoords.y = clamp((e.clientY - r.top) / r.height);
  
  // Rotación suave sin giros descontrolados
  if (!isClimax) {
    P.camRoll = nx * 14;
    P.camPitch = ny * 10;
  }
});

stage.addEventListener('pointerleave', () => {
  mouseInside = false;
  if (!isClimax) {
    P.camRoll = 0;
    P.camPitch = 0;
  }
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
let touchDownTime = 0;

function processGestures() {
  const pollinators = getActivePollinators();
  const touchingPollinators = pollinators.filter(p => p.isDown);
  const activeCount = touchingPollinators.length;

  if (activeCount > 0 && !isClimax) {
    if (lastTouchCount === 0) {
      touchDownTime = performance.now();
      alarmFired = false;
      if (A.ctx) setGain('palpito', 1.0, 0.04);
    }

    let sumFingers = 0;
    let anyNecrosis = false;

    // Calcular velocidad para detectar rigidez vs soltura
    const p1 = touchingPollinators[0];
    const dPos = Math.hypot(p1.tx - touchPrevX, p1.ty - touchPrevY);
    touchSpeed = touchSpeed * 0.75 + (dPos / (1 / 60)) * 0.25;
    touchPrevX = p1.tx; touchPrevY = p1.ty;

    for (const p of touchingPollinators) {
      sumFingers += p.tn;
      if (p.td > 78) anyNecrosis = true;
      // Solo aplicar giroscopio si proviene de un teléfono MQTT real
      if (p.id !== 'raton' && p.id !== 'raton_hover') {
        if (p.gy != null) P.camRoll = clamp(p.gy * 0.7, -25, 25);
        if (p.gx != null) P.camPitch = clamp((p.gx - 35) * 0.6, -20, 20);
      }
    }

    // Audio adaptativo:
    // Movimiento rápido/suave = abeja armónica
    // Movimiento lento/rígido/estático = mala abeja (irritada)
    if (touchSpeed < 0.08) {
      setGain('mala_abeja', 0.95, 0.08);
      setGain('abeja', 0.05, 0.1);
      $('#statTension').textContent = 'Abeja Irritada';
    } else {
      setGain('abeja', 0.9, 0.08);
      setGain('mala_abeja', 0.0, 0.1);
      $('#statTension').textContent = 'Armonía';
    }

    // Si el contacto persiste más de 1.8 segundos, la colmena mecánica empieza a zumbar
    const elapsed = (performance.now() - touchDownTime) / 1000;
    if (elapsed > 1.8) {
      const volMaq = Math.min(0.85, (elapsed - 1.8) * 0.35);
      setGain('maquina', volMaq, 0.1);
    } else {
      setGain('maquina', 0, 0.1);
    }

    if (sumFingers >= 4) {
      setGain('mala_abeja', 1.0, 0.08);
      $('#statTension').textContent = 'HISTERIA COLECTIVA';
    }

    if (anyNecrosis && !alarmFired) {
      playTrigger('alarma');
      alarmFired = true;
      $('#statTension').textContent = 'SOBRECARGA';
    }

    if (sumFingers >= 3 && lastTouchCount < 3) playTrigger('robot');
  }

  // Al soltar todos los contactos
  if (activeCount === 0 && lastTouchCount > 0 && !isClimax) {
    playTrigger('pago');
    setGain('palpito', 0, 0.2);
    setGain('abeja', 0, 0.2);
    setGain('mala_abeja', 0, 0.2);
    setGain('maquina', 0, 0.3);
    $('#statTension').textContent = 'Armonía';
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

function newMap(inn = 'touch.down', out = 'audio.palpito', o = {}) {
  const c = CHN[inn] || Tacto.CHANNELS[0];
  const t = T[out] || Object.values(T)[0];
  return { id: nextId++, on: true, in: c.name, inMin: c.min, inMax: c.max, out: t.id, outMin: t.min, outMax: t.max, curve: 'lineal', invert: false, smooth: 0.3, ...o };
}

function starter() {
  nextId = 1;
  maps = [
    newMap('touch.down', 'audio.palpito', { outMin: 0, outMax: 1, smooth: 0.1 }),
    newMap('ang.g', 'vuelo.inclinacion.x', { inMin: -45, inMax: 45, outMin: -40, outMax: 40, smooth: 0.3 }),
    newMap('ang.b', 'vuelo.inclinacion.y', { inMin: -25, inMax: 65, outMin: -25, outMax: 25, smooth: 0.3 }),
    newMap('touch.dist', 'vuelo.zoom', { inMin: 0.1, inMax: 1.2, outMin: 0.7, outMax: 2.6, smooth: 0.2 }),
    newMap('touch.dist', 'flor.color_exotico', { inMin: 0.1, inMax: 1.0, outMin: 0, outMax: 260, smooth: 0.15 }),
    newMap('touch.d', 'flor.necrosis', { inMin: 30, inMax: 90, outMin: 0, outMax: 1, smooth: 0.2 }),
    newMap('touch.f', 'audio.mala_abeja', { inMin: 0.1, inMax: 0.9, outMin: 0, outMax: 1, smooth: 0.3 }),
    newMap('touch.x', 'polen.desfase', { inMin: 0, inMax: 1, outMin: 1, outMax: 4, smooth: 0.2 })
  ];
}

try {
  maps = JSON.parse(ls('umwelt.exp.maps') || 'null') || [];
  maps = maps.filter(m => CHN[m.in] && T[m.out]);
  nextId = Math.max(0, ...maps.map(m => m.id)) + 1;
} catch { maps = []; }
if (!maps.length) starter();

const save = () => ls('umwelt.exp.maps', JSON.stringify(maps));

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

// ============================ QR, SALA Y PANTALLA COMPLETA ============
const qrLib = () => window.qrcode ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  s.onload = ok; s.onerror = no; document.head.appendChild(s);
});

async function updateJoin() {
  const CFG = window.TACTO_CONFIG || {}, Q = new URLSearchParams(location.search);
  let base = CFG.phoneUrl || null, local = false;
  try {
    const i = await (await fetch('info', { cache: 'no-store' })).json();
    if (i.baseUrl) { base = CFG.phoneUrl || i.baseUrl + '/'; local = true; }
  } catch {}
  if (!base) base = new URL('./', location.href).href;
  let u = base + (base.includes('?') ? '&' : '?') + 'sala=' + tacto.sala;
  if (!local || Q.get('broker')) u += '&broker=' + encodeURIComponent(tacto.broker || Tacto.PUBLIC_BROKER);
  $('#phoneUrl').textContent = u;
  $('#lblSala').textContent = tacto.sala;
  if (local) { $('#qr').src = 'qr.svg?u=' + encodeURIComponent(u); $('#qr').hidden = false; return; }
  try {
    await qrLib();
    const q = window.qrcode(0, 'M'); q.addData(u); q.make();
    $('#qr').src = q.createDataURL(4, 4); $('#qr').hidden = false;
  } catch { $('#qr').hidden = true; }
}

$('#salaNueva').onclick = () => {
  tacto.cambiarSala(Tacto.nuevaSala());
  updateJoin();
};

const fsBtn = $('#fsBtn');
fsBtn.onclick = () => {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  fsEl ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
       : (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
};

// ============================ BUCLE PRINCIPAL =========================
renderRows();
updateJoin();
tacto.connect().then(() => {
  $('#brokerInfo').textContent = tacto.broker.replace(/^wss?:\/\//, '');
  updateJoin();
}).catch(e => { $('#estado').textContent = '● ' + (e.message || 'sin conexión'); });

let frame = 0;
(function mainLoop(now) {
  evalMaps();
  processGestures();
  update3DWorld(now);

  if (++frame % 4 === 0) {
    updateMeters();
    const onlineDevs = Object.keys(tacto.devices).filter(k => tacto.devices[k].online).length;
    const isMouseReady = $('#mouseDev').checked;
    $('#waiting').hidden = isMouseReady || onlineDevs > 0;
  }
  requestAnimationFrame(mainLoop);
})(performance.now());

window.__umwelt = { tacto, A, P, T, flowerSpots, SWARM };
