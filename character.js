import { THREE, GLTFLoader } from './assets/vendor/three-gltf.js';

const modelUrl = new URL('./assets/character.glb?v=3', import.meta.url);
const blinkDuration = 270;

function spring(axis, target, elapsed) {
  const frequency = 13;
  const offset = axis.angle - target;
  const decay = Math.exp(-frequency * elapsed);
  const step = (axis.speed + frequency * offset) * elapsed;
  axis.angle = target + (offset + step) * decay;
  axis.speed = (axis.speed - frequency * step) * decay;
  return Math.abs(axis.angle - target) + Math.abs(axis.speed) > .002;
}

function addEyeAnimation(material) {
  const blink = { value: 0 };
  const gaze = { value: { x: 0, y: 0 } };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.nehsBlink = blink;
    shader.uniforms.nehsGaze = gaze;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_pars_fragment>',
      `#include <map_pars_fragment>
      #ifdef USE_MAP
      uniform float nehsBlink;
      uniform vec2 nehsGaze;
      const vec2 portraitSize = vec2(1122.0, 1402.0);

      vec2 edgeSegment(float x, float start, float end, vec2 a, vec2 b) {
        return mix(a, b, clamp((x - start) / (end - start), 0.0, 1.0));
      }

      // Eyelid landmarks measured in the reference texture, with its origin at the top left.
      vec2 eyeEdges(float x, bool rightEye) {
        vec2 edges = vec2(601.0, 603.0);
        if (rightEye) {
          if (x < 670.0) edges = edgeSegment(x, 650.0, 670.0, vec2(601.0, 603.0), vec2(589.0, 604.0));
          else if (x < 690.0) edges = edgeSegment(x, 670.0, 690.0, vec2(589.0, 604.0), vec2(580.0, 606.0));
          else if (x < 710.0) edges = edgeSegment(x, 690.0, 710.0, vec2(580.0, 606.0), vec2(575.0, 600.0));
          else if (x < 730.0) edges = edgeSegment(x, 710.0, 730.0, vec2(575.0, 600.0), vec2(569.0, 589.0));
          else if (x < 750.0) edges = edgeSegment(x, 730.0, 750.0, vec2(569.0, 589.0), vec2(565.0, 568.0));
          else edges = edgeSegment(x, 750.0, 774.0, vec2(565.0, 568.0), vec2(560.0, 563.0));
        } else {
          if (x < 380.0) edges = edgeSegment(x, 360.0, 380.0, vec2(561.0, 565.0), vec2(565.0, 576.0));
          else if (x < 400.0) edges = edgeSegment(x, 380.0, 400.0, vec2(565.0, 576.0), vec2(569.0, 590.0));
          else if (x < 420.0) edges = edgeSegment(x, 400.0, 420.0, vec2(569.0, 590.0), vec2(574.0, 600.0));
          else if (x < 440.0) edges = edgeSegment(x, 420.0, 440.0, vec2(574.0, 600.0), vec2(580.0, 605.0));
          else if (x < 460.0) edges = edgeSegment(x, 440.0, 460.0, vec2(580.0, 605.0), vec2(591.0, 603.0));
          else edges = edgeSegment(x, 460.0, 482.0, vec2(591.0, 603.0), vec2(601.0, 603.0));
        }
        return edges;
      }

      vec4 samplePortrait(vec2 uv) {
        vec4 original = texture2D(map, uv);
        if (nehsBlink < 0.001 && dot(nehsGaze, nehsGaze) < 0.001) return original;
        vec2 pixel = uv * portraitSize;
        bool rightEye = pixel.x > 561.0;
        vec2 limits = rightEye ? vec2(650.0, 774.0) : vec2(360.0, 482.0);
        if (pixel.x < limits.x || pixel.x > limits.y || pixel.y < 556.0 || pixel.y > 611.0) return original;

        vec2 edges = eyeEdges(pixel.x, rightEye) + vec2(-3.0, 3.0);
        float eyeMask = smoothstep(limits.x, limits.x + 5.0, pixel.x)
          * (1.0 - smoothstep(limits.y - 5.0, limits.y, pixel.x))
          * smoothstep(edges.x, edges.x + 2.0, pixel.y)
          * (1.0 - smoothstep(edges.y - 2.0, edges.y, pixel.y));

        float shutLine = mix(edges.x, edges.y, 0.77);
        vec2 lids = mix(edges, vec2(shutLine), nehsBlink);
        float openness = max(lids.y - lids.x, 1.0);
        float eyeY = mix(edges.x, edges.y, clamp((pixel.y - lids.x) / openness, 0.0, 1.0));

        float irisX = rightEye ? 708.0 : 416.0;
        float irisMask = 1.0 - smoothstep(12.0, 40.0, abs(pixel.x - irisX));
        vec2 iris = vec2(pixel.x, eyeY) - nehsGaze * irisMask;
        vec4 eye = texture2D(map, iris / portraitSize);

        vec4 lid = texture2D(map, vec2(pixel.x, edges.y + 17.0) / portraitSize);
        float lash = 1.0 - smoothstep(0.6, 3.6, abs(pixel.y - shutLine));
        lid.rgb *= 0.91 - 0.35 * lash;

        float opening = smoothstep(lids.x - 1.0, lids.x + 1.0, pixel.y)
          * (1.0 - smoothstep(lids.y - 1.0, lids.y + 1.0, pixel.y))
          * (1.0 - smoothstep(0.88, 0.99, nehsBlink));
        return mix(original, mix(lid, eye, opening), eyeMask);
      }
      #endif`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        diffuseColor *= samplePortrait(vMapUv);
      #endif`
    );
  };

  return { blink, gaze };
}

export async function mountCharacter(stage, motionPreference) {
  const canvas = stage.querySelector('#character-canvas');
  // Rendering is event-driven, so keep the final pose in the canvas between frames.
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true
  });
  if (!context) return;

  const { scene: bust } = await new GLTFLoader().loadAsync(modelUrl.href);
  const head = bust.getObjectByName('Cabeza');
  if (!head) throw new Error('El modelo del personaje no tiene un nodo para la cabeza.');

  let eyes;
  head.traverse((part) => {
    if (part.isMesh && part.material.name === 'Máscara, capucha y ojos') {
      eyes = addEyeAnimation(part.material);
    }
  });

  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20);
  camera.position.z = 7;
  scene.add(bust, new THREE.AmbientLight(0xc9dfff, 1.65));

  const rim = new THREE.DirectionalLight(0x7bbfff, 2.8);
  rim.position.set(-3, 4, -1);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xc7ddff, 1.45);
  fill.position.set(3, 2, 2);
  scene.add(fill);

  const yaw = { angle: 0, speed: 0 };
  const pitch = { angle: 0, speed: 0 };
  let goalX = 0;
  let goalY = 0;
  let frame = 0;
  let lastTime = 0;
  let blinkStart = 0;
  let blinkTimer = 0;
  let inView = true;
  let available = true;

  function canAnimate() {
    return available && inView && !document.hidden;
  }

  function schedule() {
    if (!frame && canAnimate()) frame = requestAnimationFrame(draw);
  }

  function scheduleBlink(delay = 3100 + Math.random() * 3400) {
    if (!eyes || blinkTimer || blinkStart || motionPreference.matches || !canAnimate()) return;

    blinkTimer = window.setTimeout(() => {
      blinkTimer = 0;
      if (!canAnimate() || motionPreference.matches) return;
      blinkStart = performance.now();
      schedule();
    }, delay);
  }

  function stopBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = 0;
    blinkStart = 0;
    if (eyes) eyes.blink.value = 0;
  }

  function draw(now) {
    frame = 0;
    if (!canAnimate()) return;

    const elapsed = lastTime ? Math.min((now - lastTime) / 1000, .05) : 1 / 60;
    lastTime = now;
    const yawTarget = Math.sin(goalX * Math.PI / 2) * .49;
    const pitchTarget = Math.sin(goalY * Math.PI / 2) * .245;
    const movingYaw = spring(yaw, yawTarget, elapsed);
    const movingPitch = spring(pitch, pitchTarget, elapsed);
    head.rotation.set(pitch.angle, yaw.angle, yaw.angle * -.075, 'YXZ');

    let movingEyes = false;
    if (eyes) {
      const eyeEase = 1 - Math.exp(-elapsed * 25);
      const look = eyes.gaze.value;
      const lookX = goalX * 4.3;
      const lookY = goalY * 2.1;
      look.x += (lookX - look.x) * eyeEase;
      look.y += (lookY - look.y) * eyeEase;
      movingEyes = Math.abs(lookX - look.x) + Math.abs(lookY - look.y) > .025;

      if (blinkStart) {
        const time = now - blinkStart;
        if (time < 90) {
          eyes.blink.value = THREE.MathUtils.smoothstep(time, 0, 90);
        } else if (time < blinkDuration) {
          eyes.blink.value = 1 - THREE.MathUtils.smoothstep(time, 115, blinkDuration);
        } else {
          eyes.blink.value = 0;
          blinkStart = 0;
          scheduleBlink();
        }
      }
    }

    renderer.render(scene, camera);
    stage.classList.add('is-rendered');
    if (movingYaw || movingPitch || movingEyes || blinkStart) schedule();
    else lastTime = 0;
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;

    const aspect = width / height;
    const visibleHeight = Math.max(3.64, 2.92 / aspect);
    camera.top = visibleHeight / 2;
    camera.bottom = -camera.top;
    camera.right = camera.top * aspect;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.setSize(width, height, false);
    schedule();
  }

  function center() {
    goalX = 0;
    goalY = 0;
    schedule();
  }

  function updateActivity() {
    if (!canAnimate() || motionPreference.matches) {
      stopBlink();
      if (motionPreference.matches) {
        yaw.angle = pitch.angle = yaw.speed = pitch.speed = 0;
        if (eyes) eyes.gaze.value.x = eyes.gaze.value.y = 0;
        center();
      }
    } else {
      scheduleBlink(1600 + Math.random() * 800);
      schedule();
    }
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || motionPreference.matches || !inView) return;

    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / Math.max(innerWidth * .34, 1);
    const y = (event.clientY - (box.top + box.height * .43)) / Math.max(innerHeight * .42, 1);
    goalX = THREE.MathUtils.clamp(x, -1, 1);
    goalY = THREE.MathUtils.clamp(y, -1, 1);
    schedule();
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', center);
  window.addEventListener('blur', center);
  document.addEventListener('visibilitychange', updateActivity);
  motionPreference.addEventListener('change', updateActivity);

  new ResizeObserver(resize).observe(canvas);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateActivity();
    }).observe(canvas);
  } else {
    updateActivity();
  }

  canvas.addEventListener('webglcontextlost', () => {
    available = false;
    stopBlink();
    stage.classList.remove('is-rendered');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    available = true;
    updateActivity();
    resize();
  });
  resize();
}
