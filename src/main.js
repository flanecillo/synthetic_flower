import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import gsap from "gsap";

// ─────────────────────────────────────────────
// URL del jardín — cambia esto a tu ruta real
// ─────────────────────────────────────────────
const GARDEN_URL = "https://jardin17.vercel.app/";

// ─────────────────────────────────────────────
// Distancia para mostrar el botón "Visitar Jardín"
// ─────────────────────────────────────────────
const PROXIMITY_THRESHOLD = 6.0;

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="loading-screen" id="loadingScreen">
    <div class="loading-box">
      <p class="loading-title">Cargando maqueta</p>
      <div class="loading-bar-bg">
        <div class="loading-bar" id="loadingBar"></div>
      </div>
      <div class="loading-percent" id="loadingPercent">0%</div>
    </div>
  </div>

  <aside class="ui-panel">
    <h1>Cuatro Cuartos</h1>
    <p>
      Demo base para visualizar una maqueta 3D en web.
      Esta versión está pensada como punto de partida.
    </p>
    <div class="ui-help">
      <div><strong>Mouse:</strong> clic izquierdo rota</div>
      <div><strong>Mouse:</strong> clic derecho mueve</div>
      <div><strong>Rueda:</strong> zoom</div>
    </div>
  </aside>

  <button class="visit-btn" id="visitBtn">🌿 Visitar Jardín</button>

  <div class="fade-overlay" id="fadeOverlay"></div>
`;

// ─────────────────────────────────────────────
// Referencias UI
// ─────────────────────────────────────────────
const loadingScreen = document.getElementById("loadingScreen");
const loadingBar = document.getElementById("loadingBar");
const loadingPercent = document.getElementById("loadingPercent");
const visitBtn = document.getElementById("visitBtn");
const fadeOverlay = document.getElementById("fadeOverlay");

// ─────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// ─────────────────────────────────────────────
// Cámara
// ─────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(6, 5, 8);
scene.add(camera);

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.classList.add("webgl");
app.appendChild(renderer.domElement);

// ─────────────────────────────────────────────
// Controles
// ─────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.48;

// ─────────────────────────────────────────────
// Luces
// ─────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.6);
directionalLight.position.set(8, 12, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.bottom = -15;
scene.add(directionalLight);

// ─────────────────────────────────────────────
// Piso y grid
// ─────────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.22 }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(80, 80, 0x666666, 0x333333);
grid.material.opacity = 0.18;
grid.material.transparent = true;
scene.add(grid);

// ─────────────────────────────────────────────
// Grupo del modelo
// ─────────────────────────────────────────────
const modelGroup = new THREE.Group();
scene.add(modelGroup);

// ─────────────────────────────────────────────
// Puntos de la ventana (coordenadas locales del
// modelo, convertidas de Blender)
//
// Blender → Three.js:  X→X  Y→-Z  Z→Y
//
// Punto exterior (verde): Blender(1.70,  0.25, 4.77) → Three(1.70, 4.77, -0.25)
// Punto interior (rojo):  Blender(1.70, -0.50, 4.77) → Three(1.70, 4.77,  0.50)
// ─────────────────────────────────────────────
const WIN_LOCAL_EXT = new THREE.Vector3(1.7, 4.77, -0.25);
const WIN_LOCAL_INT = new THREE.Vector3(1.7, 4.77, 0.5);

const windowExteriorWorld = new THREE.Vector3();
const windowInteriorWorld = new THREE.Vector3();

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────
function centerAndFitModel(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object3D.position.x -= center.x;
  object3D.position.y -= box.min.y;
  object3D.position.z -= center.z;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDistance = maxDim * 1.8;

  camera.position.set(fitDistance * 0.9, fitDistance * 0.7, fitDistance);
  camera.near = Math.max(0.1, maxDim / 100);
  camera.far = Math.max(1000, maxDim * 20);
  camera.updateProjectionMatrix();

  controls.target.set(0, size.y * 0.35, 0);
  controls.minDistance = Math.max(1, maxDim * 0.25);
  controls.maxDistance = Math.max(20, maxDim * 8);
  controls.update();

  directionalLight.position.set(maxDim * 1.2, maxDim * 1.6, maxDim * 1.2);
}

function enableShadows(object3D) {
  object3D.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.needsUpdate = true;
    }
  });
}

// ─────────────────────────────────────────────
// Loader GLB
// ─────────────────────────────────────────────
const gltfLoader = new GLTFLoader();

gltfLoader.load(
  "/models/CuatroCuartos_compressed.glb",
  (gltf) => {
    const model = gltf.scene;
    enableShadows(model);
    modelGroup.add(model);
    centerAndFitModel(model);

    // Calcular posiciones mundo sin helpers visuales
    const tempObj = new THREE.Object3D();
    model.add(tempObj);

    tempObj.position.copy(WIN_LOCAL_EXT);
    tempObj.updateWorldMatrix(true, false);
    tempObj.getWorldPosition(windowExteriorWorld);

    tempObj.position.copy(WIN_LOCAL_INT);
    tempObj.updateWorldMatrix(true, false);
    tempObj.getWorldPosition(windowInteriorWorld);

    model.remove(tempObj);

    // ── Loading done ──────────────────────────
    loadingBar.style.width = "100%";
    loadingPercent.textContent = "100%";
    setTimeout(() => loadingScreen.classList.add("hidden"), 300);
  },
  (event) => {
    if (event.total) {
      const progress = Math.round((event.loaded / event.total) * 100);
      loadingBar.style.width = `${progress}%`;
      loadingPercent.textContent = `${progress}%`;
    }
  },
  (error) => {
    console.error("Error al cargar el modelo:", error);
    loadingPercent.textContent = "Error al cargar el modelo";
  },
);

// ─────────────────────────────────────────────
// Estado de animación
// ─────────────────────────────────────────────
let isAnimating = false;

// ─────────────────────────────────────────────
// Transición al jardín
// ─────────────────────────────────────────────
function flyToGarden() {
  if (isAnimating) return;
  isAnimating = true;

  visitBtn.classList.remove("visible");

  const currentLook = new THREE.Vector3();
  camera.getWorldDirection(currentLook);
  currentLook.multiplyScalar(5).add(camera.position);

  const lookProxy = {
    x: currentLook.x,
    y: currentLook.y,
    z: currentLook.z,
  };

  const tl = gsap.timeline();

  // ── Fase 0: rotar para apuntar al punto VERDE ──
  tl.to(
    lookProxy,
    {
      x: windowExteriorWorld.x,
      y: windowExteriorWorld.y,
      z: windowExteriorWorld.z,
      duration: 1.4,
      ease: "power2.inOut",
    },
    0,
  );

  // ── Fase 1: mover al punto ROJO mirando al VERDE ──
  tl.to(
    camera.position,
    {
      x: windowInteriorWorld.x,
      y: windowInteriorWorld.y,
      z: windowInteriorWorld.z,
      duration: 2.0,
      ease: "power2.inOut",
      onUpdate: () => camera.lookAt(lookProxy.x, lookProxy.y, lookProxy.z),
    },
    0.3,
  );

  // ── Fase 2: fade out ──
  tl.to(
    fadeOverlay,
    {
      opacity: 1,
      duration: 0.5,
      ease: "power1.in",
      onComplete: () => (window.location.href = GARDEN_URL),
    },
    "-=0.25",
  );
}

visitBtn.addEventListener("click", flyToGarden);

// ─────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ─────────────────────────────────────────────
// Animación principal
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let btnVisible = false;

function tick() {
  const elapsedTime = clock.getElapsedTime();

  directionalLight.position.x += Math.sin(elapsedTime * 0.2) * 0.002;

  // Controls solo cuando no estamos animando
  if (!isAnimating) controls.update();

  // ── Detección de proximidad + posición flotante ──
  if (!isAnimating && windowInteriorWorld.lengthSq() > 0) {
    const dist = camera.position.distanceTo(windowInteriorWorld);
    const shouldShow = dist < PROXIMITY_THRESHOLD;

    if (shouldShow !== btnVisible) {
      btnVisible = shouldShow;
      visitBtn.classList.toggle("visible", shouldShow);
    }

    if (btnVisible) {
      const projected = windowInteriorWorld.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      visitBtn.style.left = `${x}px`;
      visitBtn.style.top = `${y}px`;
    }
  }

  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
}

tick();
