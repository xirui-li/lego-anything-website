/* Desktop chapter landmarks. Scroll progress controls rotation and crossfades. */
const host = document.querySelector('#architecture-scene');
const desktop = window.matchMedia('(min-width: 901px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const chapters = [
  { section: 'paper-cover', model: 'eiffel', rotationOffset: Math.PI * 0.4 },
  { section: 'overview', model: 'opera', rotationOffset: -Math.PI * 0.4 },
  { section: 'workflow', model: 'pisa' },
  { section: 'benchmark', model: 'colosseum', rotationOffset: -Math.PI * 0.4 },
  { section: 'benchmark-results', model: 'colosseum', poster: 'colosseum-results', rotationOffset: -Math.PI * 0.4 },
  { section: 'plugin', model: 'acropolis', rotationOffset: -Math.PI * 0.8 },
  { section: 'plugin-method', model: 'acropolis', poster: 'acropolis-method', rotationOffset: -Math.PI * 0.8 },
  { section: 'world', model: 'skyscraper', rotationOffset: -Math.PI * 1.2 },
  { section: 'explorer', model: 'taj', rotationOffset: -Math.PI * 3.2 },
  { section: 'citation', model: 'westminster', rotationOffset: -Math.PI * 3.6 },
];
let controller;
let loading = false;
let posterFrame = 0;

function chapterPosition() {
  const navHeight = document.querySelector('.site-header').offsetHeight;
  const anchors = chapters.map(chapter =>
    document.getElementById(chapter.section).getBoundingClientRect().top + window.scrollY - navHeight);
  for (let i = 0; i < anchors.length - 1; i++) {
    if (window.scrollY <= anchors[i + 1]) {
      return i + Math.max(0, Math.min(1, (window.scrollY - anchors[i]) / (anchors[i + 1] - anchors[i])));
    }
  }
  return chapters.length - 1;
}

function updatePoster() {
  posterFrame = 0;
  if (!host || !desktop.matches) return;
  const chapter = chapters[Math.round(chapterPosition())];
  const image = host.querySelector('.architecture-poster');
  const path = `assets/architecture-${chapter.poster || chapter.model}.webp`;
  if (image.getAttribute('src') !== path) image.src = path;
  host.dataset.chapter = chapter.section;
  if (!controller || host.dataset.renderer === 'poster') host.dataset.model = chapter.model;
}
function schedulePoster() {
  if (!posterFrame && desktop.matches) posterFrame = requestAnimationFrame(updatePoster);
}

async function start() {
  if (!host || !desktop.matches || loading) return;
  updatePoster();
  if (controller) return controller.resume();
  loading = true;
  try {
    const [THREE, { createArchitectures }] = await Promise.all([
      import('./assets/vendor/three/three.module.min.js'),
      import('./architecture-model.js'),
    ]);
    if (!desktop.matches) return;
    controller = createController(THREE, createArchitectures);
  } catch {
    host.dataset.renderer = 'poster';
  } finally {
    loading = false;
  }
}

function createController(THREE, createArchitectures) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0xffffff, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'architecture-canvas';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5.4, 5.4, 7, -7, 0.1, 60);
  camera.position.set(9, 6.3, 11);
  camera.lookAt(0, 0, 0);
  const models = createArchitectures();
  Object.values(models).forEach(model => { model.visible = false; scene.add(model); });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdedede, 2.1));
  const sunlight = new THREE.DirectionalLight(0xffffff, 3.1);
  sunlight.position.set(-4, 9, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -6, right: 6, top: 7, bottom: -7, near: 0.5, far: 27 });
  sunlight.shadow.normalBias = 0.025;
  sunlight.shadow.bias = -0.00012;
  sunlight.shadow.radius = 4;
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(6, 3, -5);
  scene.add(fill);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const brush = shadowCanvas.getContext('2d');
  const gradient = brush.createRadialGradient(64, 64, 13, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(60,60,60,.13)');
  gradient.addColorStop(0.55, 'rgba(60,60,60,.055)');
  gradient.addColorStop(1, 'rgba(60,60,60,0)');
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 128, 128);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 9.1), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
  }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Blend complete renders so latticework and hollow arcades remain correctly occluded.
  // Targets are allocated only on the first transition, and reused thereafter.
  let targetA, targetB;
  const uniforms = { imageA: { value: null }, imageB: { value: null }, blend: { value: 0 } };
  const composite = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 texcoord; void main(){texcoord=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `
      uniform sampler2D imageA;
      uniform sampler2D imageB;
      uniform float blend;
      varying vec2 texcoord;
      void main() {
        vec4 sampleColor=mix(texture2D(imageA,texcoord),texture2D(imageB,texcoord),blend);
        gl_FragColor=vec4(sampleColor.rgb/max(sampleColor.a,0.00001),sampleColor.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
  });
  composite.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial));
  const drawingSize = new THREE.Vector2();
  function ensureTargets() {
    renderer.getDrawingBufferSize(drawingSize);
    if (!targetA) {
      const options = { type: THREE.HalfFloatType, depthBuffer: true };
      targetA = new THREE.WebGLRenderTarget(drawingSize.x, drawingSize.y, options);
      targetB = new THREE.WebGLRenderTarget(drawingSize.x, drawingSize.y, options);
      uniforms.imageA.value = targetA.texture;
      uniforms.imageB.value = targetB.texture;
    }
  }
  function showModel(index, angle) {
    Object.values(models).forEach(model => { model.visible = false; });
    const chapter = chapters[index];
    const model = models[chapter.model];
    model.visible = true;
    model.rotation.y = angle + (chapter.rotationOffset ?? 0);
    ground.position.y = model.userData.groundY;
    // Tall landmarks have a smaller footprint and a correspondingly smaller shadow.
    ground.scale.setScalar(['eiffel', 'pisa', 'skyscraper'].includes(chapter.model) ? 0.66 : 1);
  }
  function draw(position) {
    const index = Math.min(chapters.length - 1, Math.floor(position));
    const next = Math.min(chapters.length - 1, index + 1);
    const sameModel = chapters[index].model === chapters[next].model;
    const mix = reducedMotion.matches || sameModel ? 0 : THREE.MathUtils.smoothstep(position - index, 0.22, 0.78);
    const angle = reducedMotion.matches ? -0.2 : -0.2 + position * Math.PI * 0.4;
    if (mix > 0.001 && mix < 0.999 && next !== index) {
      ensureTargets();
      showModel(index, angle);
      renderer.setRenderTarget(targetA);
      renderer.render(scene, camera);
      showModel(next, angle);
      renderer.setRenderTarget(targetB);
      renderer.render(scene, camera);
      uniforms.blend.value = mix;
      renderer.setRenderTarget(null);
      renderer.render(composite, compositeCamera);
    } else {
      showModel(mix >= 0.999 ? next : index, angle);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
    host.dataset.model = chapters[mix >= 0.5 ? next : index].model;
    host.dataset.blend = mix.toFixed(4);
    host.dataset.angle = angle.toFixed(4);
    host.dataset.position = position.toFixed(4);
    host.dataset.renderer = 'webgl';
    host.classList.add('is-ready');
  }

  let position = chapterPosition();
  let targetPosition = position;
  let frame = 0, lastTime = 0;
  let contextLost = false;
  function setTarget() {
    targetPosition = chapterPosition();
    host.dataset.progress = (targetPosition / (chapters.length - 1)).toFixed(4);
  }
  function active() { return desktop.matches && !document.hidden && !contextLost; }
  function render(time) {
    frame = 0;
    if (!active()) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    if (reducedMotion.matches) position = Math.round(targetPosition);
    else position = THREE.MathUtils.damp(position, targetPosition, 9, delta);
    draw(position);
    if (!reducedMotion.matches && Math.abs(targetPosition - position) > 0.0001) {
      frame = requestAnimationFrame(render);
    } else lastTime = 0;
  }
  function requestRender() { if (!frame && active()) frame = requestAnimationFrame(render); }
  function resize() {
    if (!desktop.matches) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    // Keep both tall towers and broad arenas inside the available column.
    const halfWidth = Math.max(5.5, 4.8 * width / height);
    const halfHeight = halfWidth * height / width;
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    if (targetA) {
      renderer.getDrawingBufferSize(drawingSize);
      targetA.setSize(drawingSize.x, drawingSize.y);
      targetB.setSize(drawingSize.x, drawingSize.y);
    }
    setTarget(); requestRender();
  }
  function onScroll() { if (desktop.matches) { setTarget(); requestRender(); } }
  function pause() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  function resume() { resize(); setTarget(); requestRender(); }
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true; pause();
    host.classList.remove('is-ready'); host.dataset.renderer = 'poster'; updatePoster();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; resume(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
  reducedMotion.addEventListener('change', resume);
  new ResizeObserver(resize).observe(host);
  resize(); setTarget(); position = targetPosition; requestRender();
  return { pause, resume };
}

window.addEventListener('scroll', schedulePoster, { passive: true });
window.addEventListener('resize', schedulePoster);
desktop.addEventListener('change', () => desktop.matches ? start() : controller?.pause());
start();
