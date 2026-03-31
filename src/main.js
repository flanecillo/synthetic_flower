import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const app = document.querySelector('#app')

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
`

const loadingScreen = document.getElementById('loadingScreen')
const loadingBar = document.getElementById('loadingBar')
const loadingPercent = document.getElementById('loadingPercent')

/**
 * Escena
 */
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)

/**
 * Cámara
 */
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.set(6, 5, 8)
scene.add(camera)

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.domElement.classList.add('webgl')
app.appendChild(renderer.domElement)

/**
 * Controles
 */
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 0.8, 0)
controls.minDistance = 1.5
controls.maxDistance = 40
controls.maxPolarAngle = Math.PI * 0.48

/**
 * Luces
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.8)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.6)
directionalLight.position.set(8, 12, 10)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(2048, 2048)
directionalLight.shadow.camera.near = 0.5
directionalLight.shadow.camera.far = 50
directionalLight.shadow.camera.left = -15
directionalLight.shadow.camera.right = 15
directionalLight.shadow.camera.top = 15
directionalLight.shadow.camera.bottom = -15
scene.add(directionalLight)

/**
 * Piso base sutil
 */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ opacity: 0.22 })
)
floor.rotation.x = -Math.PI * 0.5
floor.position.y = -0.001
floor.receiveShadow = true
scene.add(floor)

/**
 * Grid opcional sutil
 */
const grid = new THREE.GridHelper(80, 80, 0x666666, 0x333333)
grid.material.opacity = 0.18
grid.material.transparent = true
scene.add(grid)

/**
 * Grupo del modelo
 */
const modelGroup = new THREE.Group()
scene.add(modelGroup)

/**
 * Utilidades
 */
function centerAndFitModel(object3D) {
  const box = new THREE.Box3().setFromObject(object3D)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  object3D.position.x -= center.x
  object3D.position.y -= box.min.y
  object3D.position.z -= center.z

  const maxDim = Math.max(size.x, size.y, size.z)

  // Ajuste general de cámara según tamaño del modelo
  const fitDistance = maxDim * 1.8
  camera.position.set(fitDistance * 0.9, fitDistance * 0.7, fitDistance)
  camera.near = Math.max(0.1, maxDim / 100)
  camera.far = Math.max(1000, maxDim * 20)
  camera.updateProjectionMatrix()

  controls.target.set(0, size.y * 0.35, 0)
  controls.minDistance = Math.max(1, maxDim * 0.25)
  controls.maxDistance = Math.max(20, maxDim * 8)
  controls.update()

  directionalLight.position.set(maxDim * 1.2, maxDim * 1.6, maxDim * 1.2)
}

function enableShadows(object3D) {
  object3D.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true

      if (child.material) {
        child.material.needsUpdate = true
      }
    }
  })
}

/**
 * Loader GLB
 */
const gltfLoader = new GLTFLoader()

gltfLoader.load(
  '/models/CuatroCuartos_compressed.glb',
  (gltf) => {
    const model = gltf.scene
    enableShadows(model)
    modelGroup.add(model)

    centerAndFitModel(model)

    loadingBar.style.width = '100%'
    loadingPercent.textContent = '100%'

    setTimeout(() => {
      loadingScreen.classList.add('hidden')
    }, 300)
  },
  (event) => {
    if (event.total) {
      const progress = Math.round((event.loaded / event.total) * 100)
      loadingBar.style.width = `${progress}%`
      loadingPercent.textContent = `${progress}%`
    }
  },
  (error) => {
    console.error('Error al cargar el modelo:', error)
    loadingPercent.textContent = 'Error al cargar el modelo'
  }
)

/**
 * Resize
 */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Animación
 */
const clock = new THREE.Clock()

function tick() {
  const elapsedTime = clock.getElapsedTime()

  // Movimiento muy sutil de luz para dar vida, opcional
  directionalLight.position.x += Math.sin(elapsedTime * 0.2) * 0.002

  controls.update()
  renderer.render(scene, camera)
  window.requestAnimationFrame(tick)
}

tick()