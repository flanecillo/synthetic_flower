import "./style.css";
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

// ─────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────
const SPLAT_URL = "/models/2kPotSOG.sog";

// Radio de órbita (distancia cámara → origen)
const ORBIT_RADIUS = 7;
const ZOOM_MIN = ORBIT_RADIUS * 0.3; 
const ZOOM_MAX = ORBIT_RADIUS; 
const ZOOM_SPEED_WHEEL = 0.4;
const ZOOM_SPEED_PINCH = 0.01;

// Rango de órbita en radianes
const MAX_AZ = THREE.MathUtils.degToRad(25); // horizontal ±25°
const MAX_EL = THREE.MathUtils.degToRad(12); // vertical   ±12°

// Altura base de la cámara
const BASE_Y = 0;

// Suavizado (lerp por frame)
const CAM_LERP = 0.06;

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const app = document.querySelector("#app");

app.innerHTML = `
  <div class="loading-screen" id="loadingScreen">
    <div class="loading-box">
      <div class="loading-bar-bg">
        <div class="loading-bar" id="loadingBar"></div>
      </div>
      <div class="loading-label" id="loadingLabel">Cargando…</div>
    </div>
  </div>
  <div class="fade-overlay" id="fadeOverlay"></div>
`;

const loadingScreen = document.getElementById("loadingScreen");
const loadingBar = document.getElementById("loadingBar");
const loadingLabel = document.getElementById("loadingLabel");
const fadeOverlay = document.getElementById("fadeOverlay");

// ─────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a18);

// ─────────────────────────────────────────────
// Cámara
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(0, BASE_Y, ORBIT_RADIUS);
camera.lookAt(0, 0, 0);
scene.add(camera);

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.classList.add("webgl");
app.appendChild(renderer.domElement);

const sparkRenderer = new SparkRenderer({ three: THREE, renderer });
scene.add(sparkRenderer);

// ─────────────────────────────────────────────
// Cargar el Gaussian
// ─────────────────────────────────────────────
const splatMesh = new SplatMesh({
  url: SPLAT_URL,
  onProgress: (p) => {
    const pct = Math.round(p * 100);
    loadingBar.style.width = `${pct}%`;
    loadingLabel.textContent = `Cargando… ${pct}%`;
  },
  onLoad: () => {
    loadingBar.style.width = "100%";
    loadingLabel.textContent = "Listo";
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
      fadeOverlay.style.opacity = "0";
    }, 300);
  },
});

splatMesh.rotateX(Math.PI);
splatMesh.translateZ(-1);
splatMesh.translateY(1);
splatMesh.translateX(-0.6);
scene.add(splatMesh);

// ─────────────────────────────────────────────
// Estado orbital de la cámara
//
// azimuth: ángulo horizontal alrededor de Y
// elevation: ángulo vertical
// Ambos en radianes, 0 = posición neutral (frente al florero)
// ─────────────────────────────────────────────
let targetAz = 0;
let targetEl = 0;
let currentAz = 0;
let currentEl = 0;

// Zoom — radio actual de la órbita
let targetRadius = ZOOM_MAX;
let currentRadius = ZOOM_MAX;

function setCameraFromAngles(az, el, r) {
  const x = r * Math.sin(az) * Math.cos(el);
  const y = BASE_Y + r * Math.sin(el);
  const z = r * Math.cos(az) * Math.cos(el);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

// ─────────────────────────────────────────────
// MOUSE PARALLAX (desktop)
// ─────────────────────────────────────────────
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

let mouseNX = 0;
let mouseNY = 0;

if (!isMobile) {
  window.addEventListener("mousemove", (e) => {
    mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNY = (e.clientY / window.innerHeight) * 5 - 2.5; // rango vertical más amplio
  });

  // Zoom con scroll
  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? ZOOM_SPEED_WHEEL : -ZOOM_SPEED_WHEEL;
      targetRadius = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, targetRadius + delta),
      );
    },
    { passive: false },
  );
}

// Zoom con pinch (móvil)
let _lastPinchDist = null;

window.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      _lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  },
  { passive: true },
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length !== 2 || _lastPinchDist === null) return;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    const delta = (_lastPinchDist - dist) * ZOOM_SPEED_PINCH;
    targetRadius = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetRadius + delta));
    _lastPinchDist = dist;
  },
  { passive: true },
);

window.addEventListener("touchend", () => {
  _lastPinchDist = null;
});

// ─────────────────────────────────────────────
// GIROSCOPIO (móvil)
// ─────────────────────────────────────────────
let gyroEnabled = false;
let gyroReady = false;

// Ángulos crudos que llegan del sensor (en radianes)
let gyroAz = 0;
let gyroEl = 0;

// Offset de calibración (se fija al activar)
let calibAzOffset = 0;
let calibElOffset = 0;

function calibrate() {
  calibAzOffset = gyroAz;
  calibElOffset = gyroEl;
}

// ── Estrategia 1: AbsoluteOrientationSensor ──
function startAbsoluteOrientationSensor() {
  try {
    const sensor = new AbsoluteOrientationSensor({
      frequency: 60,
      referenceFrame: "device",
    });

    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _m = new THREE.Matrix4();

    sensor.addEventListener("reading", () => {
      _q.set(
        sensor.quaternion[0],
        sensor.quaternion[1],
        sensor.quaternion[2],
        sensor.quaternion[3],
      );
      // Corrección sensor → Three.js
      const correction = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0),
      );
      _q.multiply(correction);

      _m.makeRotationFromQuaternion(_q);
      _e.setFromRotationMatrix(_m, "YXZ");

      gyroAz = _e.y;
      gyroEl = _e.x;
    });

    sensor.addEventListener("error", () => startDeviceOrientationFallback());
    sensor.start();
    return true;
  } catch {
    return false;
  }
}

// ── Estrategia 2: deviceorientation (fallback iOS) ──
function startDeviceOrientationFallback() {
  window.addEventListener("deviceorientation", (e) => {
    gyroAz = THREE.MathUtils.degToRad(e.alpha ?? 0);
    gyroEl = THREE.MathUtils.degToRad(e.beta ?? 0);
  });
}

async function initSensor() {
  if (gyroReady) return true;

  if (typeof DeviceOrientationEvent?.requestPermission === "function") {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== "granted") return false;
  }

  if (typeof AbsoluteOrientationSensor !== "undefined") {
    try {
      await Promise.all([
        navigator.permissions.query({ name: "accelerometer" }),
        navigator.permissions.query({ name: "gyroscope" }),
        navigator.permissions.query({ name: "magnetometer" }),
      ]);
      startAbsoluteOrientationSensor();
    } catch {
      startDeviceOrientationFallback();
    }
  } else {
    startDeviceOrientationFallback();
  }

  gyroReady = true;
  return true;
}

function enableGyro() {
  calibrate();
  gyroEnabled = true;
}

function disableGyro() {
  gyroEnabled = false;
  // targetAz/El quedan donde están — sin salto
}

// ── Botón toggle (solo en móvil) ──────────────
if (isMobile) {
  const gyroBtn = document.createElement("button");
  gyroBtn.className = "gyro-btn";
  gyroBtn.textContent = "Activar giroscopio";

  const updateBtnState = () => {
    gyroBtn.textContent = gyroEnabled
      ? "Desactivar giroscopio"
      : "Activar giroscopio";
    gyroBtn.classList.toggle("active", gyroEnabled);
  };

  gyroBtn.addEventListener("click", async () => {
    const ok = await initSensor();
    if (!ok) return;
    gyroEnabled ? disableGyro() : enableGyro();
    updateBtnState();
  });

  app.appendChild(gyroBtn);
}

// ─────────────────────────────────────────────
// Loop de animación
// ─────────────────────────────────────────────
function tick() {
  requestAnimationFrame(tick);

  if (gyroEnabled) {
    // Delta respecto al offset de calibración, limitado al rango
    const deltaAz = gyroAz - calibAzOffset;
    const deltaEl = gyroEl - calibElOffset;
    targetAz = Math.max(-MAX_AZ, Math.min(MAX_AZ, deltaAz));
    targetEl = Math.max(-MAX_EL, Math.min(MAX_EL, deltaEl));
  } else if (!isMobile) {
    // Mouse parallax
    targetAz = mouseNX * MAX_AZ;
    targetEl = -mouseNY * MAX_EL;
  }

  // Lerp suave hacia los ángulos objetivo y el radio
  currentAz += (targetAz - currentAz) * CAM_LERP;
  currentEl += (targetEl - currentEl) * CAM_LERP;
  currentRadius += (targetRadius - currentRadius) * CAM_LERP;

  setCameraFromAngles(currentAz, currentEl, currentRadius);

  sparkRenderer.render(scene, camera);
  renderer.render(scene, camera);
}

tick();

// ─────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
