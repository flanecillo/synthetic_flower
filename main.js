import "./style.css";
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

// ─────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────
const SPLAT_URL = "/models/2kSOG_rotated.sog";

// Cuánto rota la cámara con el mouse (radianes máximos)
const MOUSE_PARALLAX_MAX = 0.18;

// Suavizado del mouse (0 = sin suavizado, 1 = nunca llega)
const MOUSE_LERP = 0.06;

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
const loadingBar    = document.getElementById("loadingBar");
const loadingLabel  = document.getElementById("loadingLabel");
const fadeOverlay   = document.getElementById("fadeOverlay");

// ─────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a18);

// ─────────────────────────────────────────────
// Cámara — posición fija, solo rota
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);
camera.position.set(0, 0, 7);
camera.lookAt(0, 0, 0);
scene.add(camera);

// Quaternion base (posición neutral de la cámara)
const baseQuaternion = camera.quaternion.clone();

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.classList.add("webgl");
app.appendChild(renderer.domElement);

// SparkRenderer — necesario para renderizar el splat
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
      // Fade in desde negro
      fadeOverlay.style.opacity = "0";
    }, 300);
  },
});
splatMesh.rotateY(-Math.PI/2);
splatMesh.rotateX(Math.PI);
splatMesh.translateZ(-1);
splatMesh.translateY(1);

scene.add(splatMesh);

// ─────────────────────────────────────────────
// Estado de la cámara
// ─────────────────────────────────────────────
// targetQuat es el quaternion hacia el que interpola la cámara
const targetQuat = baseQuaternion.clone();
const _q = new THREE.Quaternion();

// ─────────────────────────────────────────────
// MOUSE PARALLAX (desktop)
// ─────────────────────────────────────────────
let mouseNX = 0; // -1..1 normalizado
let mouseNY = 0;

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

if (!isMobile) {
  window.addEventListener("mousemove", (e) => {
    mouseNX = (e.clientX / window.innerWidth)  * 2 - 1;
    mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
  });
}

function applyMouseParallax() {
  if (isMobile) return;

  // Euler suave basado en posición del cursor
  const yaw   = -mouseNX * MOUSE_PARALLAX_MAX;
  const pitch = -mouseNY * MOUSE_PARALLAX_MAX * 0.6;

  const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
  _q.setFromEuler(euler).premultiply(baseQuaternion);

  targetQuat.slerp(_q, MOUSE_LERP);
}

// ─────────────────────────────────────────────
// GIROSCOPIO (móvil)
// ─────────────────────────────────────────────
let gyroEnabled  = false;
let gyroReady    = false;

const _calibOffset  = new THREE.Quaternion();
const _rawSensorQuat = new THREE.Quaternion();
const _gyroTarget   = new THREE.Quaternion();

// Corrección de espacio: sensor → Three.js
// El sensor entrega el dispositivo como objeto en el mundo real;
// necesitamos convertir a espacio de cámara Three.js.
const SENSOR_CORRECTION = new THREE.Quaternion();
SENSOR_CORRECTION.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

function buildCorrectedQuat(rawQ) {
  _rawSensorQuat.copy(rawQ).multiply(SENSOR_CORRECTION);
}

function calibrate() {
  // _calibOffset = camera.quaternion * rawSensorQuat⁻¹  (left-multiply)
  _calibOffset
    .copy(_rawSensorQuat)
    .invert()
    .premultiply(camera.quaternion);
  _gyroTarget.copy(camera.quaternion);
}

// ── Estrategia 1: AbsoluteOrientationSensor ─
function startAbsoluteOrientationSensor() {
  try {
    const sensor = new AbsoluteOrientationSensor({
      frequency: 60,
      referenceFrame: "device",
    });

    const _q = new THREE.Quaternion();

    sensor.addEventListener("reading", () => {
      _q.set(
        sensor.quaternion[0],
        sensor.quaternion[1],
        sensor.quaternion[2],
        sensor.quaternion[3]
      );
      buildCorrectedQuat(_q);
      if (gyroEnabled) {
        // offset a la izquierda: cancela el azimut correctamente
        _gyroTarget.copy(_calibOffset).multiply(_rawSensorQuat);
      }
    });

    sensor.addEventListener("error", () => {
      startDeviceOrientationFallback();
    });

    sensor.start();
    return true;
  } catch {
    return false;
  }
}

// ── Estrategia 2: deviceorientation (fallback iOS / Firefox) ─
function startDeviceOrientationFallback() {
  const _m = new THREE.Matrix4();
  const _qf = new THREE.Quaternion();

  window.addEventListener("deviceorientation", (e) => {
    const alpha = THREE.MathUtils.degToRad(e.alpha ?? 0);
    const beta  = THREE.MathUtils.degToRad(e.beta  ?? 0);
    const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0);

    _m.makeRotationFromEuler(new THREE.Euler(beta, alpha, -gamma, "ZXY"));
    _qf.setFromRotationMatrix(_m);
    buildCorrectedQuat(_qf);

    if (gyroEnabled) {
      _gyroTarget.copy(_calibOffset).multiply(_rawSensorQuat);
    }
  });
}

async function initSensor() {
  if (gyroReady) return true;

  // iOS necesita permiso explícito
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
  // Al desactivar, el targetQuat queda donde está — suave
}

// ── Botón toggle (solo en móvil) ─────────────
let gyroBtn = null;

if (isMobile) {
  gyroBtn = document.createElement("button");
  gyroBtn.id = "gyroBtn";
  gyroBtn.className = "gyro-btn";
  gyroBtn.textContent = "Activar giroscopio";

  function updateBtnState() {
    gyroBtn.textContent = gyroEnabled
      ? "Desactivar giroscopio"
      : "Activar giroscopio";
    gyroBtn.classList.toggle("active", gyroEnabled);
  }

  gyroBtn.addEventListener("click", async () => {
    const ok = await initSensor();
    if (!ok) return;

    if (!gyroEnabled) {
      enableGyro();
    } else {
      disableGyro();
    }
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
    // Suavizado del giroscopio
    targetQuat.slerp(_gyroTarget, 0.1);
  } else if (!isMobile) {
    applyMouseParallax();
  }

  // Aplicar quaternion a la cámara
  camera.quaternion.copy(targetQuat);

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