import * as THREE from "three"

const root = document.documentElement
const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches && window.gsap && window.ScrollTrigger
if (!motion) root.classList.add("still")

// ---------- Page controls (work with or without WebGL) ----------
document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => {
  const code = button.previousElementSibling
  navigator.clipboard.writeText(code.textContent).then(() => {
    button.textContent = "Copied"
    setTimeout(() => { button.textContent = "Copy" }, 1600)
  }, () => getSelection().selectAllChildren(code))
}))

document.querySelectorAll(".tabs button").forEach((tab, _, tabs) => tab.addEventListener("click", () => {
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)))
  document.getElementById("cmd").textContent = tab.dataset.cmd
}))

const modes = [...document.querySelectorAll("#modeList li")]
const key = document.getElementById("key")
const setMode = (next) => {
  const at = modes.findIndex((m) => m.classList.contains("on"))
  if (next === at) return
  modes[at].classList.remove("on")
  modes[next].classList.add("on")
  key.classList.add("down")
  setTimeout(() => key.classList.remove("down"), 140)
}
key.addEventListener("click", () => setMode((modes.findIndex((m) => m.classList.contains("on")) + 1) % modes.length))

// The bar switches to a light or dark glass depending on what is under it.
const bar = document.querySelector(".bar")
const day = document.querySelector(".day")
const tint = () => {
  const r = day.getBoundingClientRect()
  bar.classList.toggle("solid", scrollY > 40)
  bar.classList.toggle("light", r.top <= 28 && r.bottom >= 28)
}
addEventListener("scroll", tint, { passive: true })
tint()

const SESSION = [
  ["you", "❯ the cart total test fails, fix it\n\n"],
  ["dim", "  Read  src/cart.ts\n  Read  test/cart.test.ts\n\n"],
  ["", "  The discount is applied after tax. The test expects it\n  before tax, so totals come out 2% too high.\n\n"],
  ["", "  Edit  src/cart.ts  "], ["add", "+3 "], ["del", "−2\n"],
  ["dim", "  Ran   bun test   14 pass   0 fail\n\n"],
  ["ok", "  ✓ Done · 1 file changed · checks passed · 10s · $0.00"],
]
const typed = document.getElementById("typed")
const sessionChars = SESSION.reduce((n, part) => n + part[1].length, 0)
const typeTo = (n) => {
  const left = { n }
  typed.innerHTML = SESSION.map(([cls, text]) => {
    const shown = text.slice(0, Math.max(0, left.n))
    left.n -= text.length
    return shown ? `<span class="${cls}">${shown.replace(/</g, "&lt;")}</span>` : ""
  }).join("") + (n < sessionChars ? '<span class="caret"></span>' : "")
}
typeTo(motion ? 0 : sessionChars)

const words = document.getElementById("words")
words.innerHTML = words.textContent.split(" ").map((w) => `<span class="w">${w}</span>`).join(" ")

// ---------- Studio ----------
const canvas = document.getElementById("gl")
const renderer = makeRenderer()
const S = { spin: -0.25, el: 0.38, dist: 19, look: 2.5, coreY: 1.05, glow: 0, explode: 0, x: 0, dive: 0, exposure: motion ? 0 : 1 }
const SAFFRON = new THREE.Color("#f2a516")
const W = 3.2
const CORNER = 0.5
const BEVEL = 0.03
const GAP = 0.035
const LIFT = 0.62
const LAYERS = [
  { name: "Safety", note: "Modes, permissions, sandbox", depth: 0.3, hole: 0, mat: "graphite" },
  { name: "Tools", note: "Files, shell, MCP, plugins", depth: 0.13, hole: 0.5, mat: "titanium" },
  { name: "Memory", note: "Remembers how your project works", depth: 0.13, hole: 0.56, mat: "titanium" },
  { name: "Receipts", note: "Checks before it says done", depth: 0.07, hole: 0.62, mat: "saffron" },
  { name: "Rewind", note: "Restores files and chat", depth: 0.13, hole: 0.68, mat: "titanium" },
  { name: "Plans", note: "Nothing changes until you say yes", depth: 0.16, hole: 0.74, mat: "graphite" },
]

if (renderer) studio()

function makeRenderer() {
  try {
    const made = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", stencil: false })
    const gl = made.getContext()
    const info = gl.getExtension("WEBGL_debug_renderer_info")
    // Without a GPU, WebGL runs on the CPU and the scroll film would crawl, so show the still page instead.
    if (!/swiftshader|llvmpipe|software/i.test(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "")) return made
    made.dispose()
    throw new Error("software rendering")
  } catch {
    typeTo(sessionChars)
    root.classList.add("no-gl", "still")
    return undefined
  }
}

function studio() {
  // Neutral tone mapping keeps saffron, gold and titanium their real colours instead of shifting them.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1

  const scene = new THREE.Scene()
  scene.background = new THREE.Color("#000")
  scene.environment = studioLights()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 120)
  scene.add(camera)

  // A warm studio sweep that follows the camera, so there is always light falloff behind the object.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshBasicMaterial({ map: radial([[0, "#2c2217"], [0.38, "#0f0b07"], [1, "#000"]]), toneMapped: false, depthWrite: false }))
  backdrop.position.set(0, -3, -45)
  camera.add(backdrop)

  const key = new THREE.DirectionalLight("#fff6ea", 1.4)
  key.position.set(5, 9, 4)
  const rim = new THREE.DirectionalLight("#dfe8ff", 1.1)
  rim.position.set(-7, 4, -6)
  scene.add(key, rim)

  const rig = new THREE.Group()
  const spin = new THREE.Group()
  rig.add(spin)
  scene.add(rig)

  // A soft contact shadow instead of real-time shadow maps: it reads the same and costs almost nothing.
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(0,0,0,.95)"], [0.45, "rgba(0,0,0,.55)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false }))
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.002
  rig.add(contact)

  const spun = spunTexture()
  const mats = {
    titanium: new THREE.MeshPhysicalMaterial({ color: "#c9c5bd", metalness: 1, roughness: 0.56, roughnessMap: spun, clearcoat: 0.15, clearcoatRoughness: 0.3 }),
    graphite: new THREE.MeshPhysicalMaterial({ color: "#2a2928", metalness: 0.85, roughness: 0.6, roughnessMap: spun, clearcoat: 0.55, clearcoatRoughness: 0.2 }),
    saffron: new THREE.MeshPhysicalMaterial({ color: "#d4900f", metalness: 1, roughness: 0.48, roughnessMap: spun, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
  }

  const plates = LAYERS.reduce((list, layer) => {
    const below = list.at(-1)
    const base = below ? below.base + below.height + GAP : 0
    const mesh = new THREE.Mesh(plateGeometry(layer.hole, layer.depth), mats[layer.mat])
    spin.add(mesh)
    const height = layer.depth + BEVEL * 2
    const ring = layer.hole ? new THREE.Mesh(new THREE.TorusGeometry(layer.hole - 0.004, 0.008, 8, 128), new THREE.MeshBasicMaterial({ color: "#000", toneMapped: false })) : undefined
    if (ring) {
      ring.rotation.x = Math.PI / 2
      ring.position.y = height
      mesh.add(ring)
    }
    return [...list, { mesh, ring, base, height, layer }]
  }, [])
  const top = plates.at(-1)
  const stackHeight = top.base + top.height

  // The DeV mark, laser-etched into the top plate.
  const etch = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshStandardMaterial({ map: markTexture(), transparent: true, metalness: 0.7, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }))
  etch.rotation.x = -Math.PI / 2
  etch.position.set(0, top.height + 0.001, 1.13)
  top.mesh.add(etch)

  // Your model: a thin glass shell around a gold lattice. Thin glass barely bends light, so the shell is drawn
  // as reflections added over what is behind it, which looks the same as real refraction and costs a fraction.
  const core = new THREE.Group()
  const shell = (side, scale) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 64, 48), new THREE.MeshPhysicalMaterial({ color: "#000000", metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.4, side, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    mesh.scale.setScalar(scale)
    return mesh
  }
  const gold = new THREE.MeshPhysicalMaterial({ color: "#d9a54e", metalness: 1, roughness: 0.28 })
  const lattice = latticeOf(new THREE.IcosahedronGeometry(0.36, 0), gold)
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 12), new THREE.MeshBasicMaterial({ color: "#000", toneMapped: false }))
  const lamp = new THREE.PointLight("#ffc76a", 0, 2.2, 2)
  core.add(lattice, heart, lamp, shell(THREE.BackSide, 0.975), shell(THREE.FrontSide, 1))
  spin.add(core)
  const seatY = stackHeight - 0.14

  const labels = plates.map((p) => {
    const el = document.createElement("div")
    el.className = "label"
    el.innerHTML = `<i></i><div><b>${p.layer.name}</b><span>${p.layer.note}</span></div>`
    document.getElementById("labels").append(el)
    return el
  })

  const view = { w: 1, h: 1, narrow: false, fit: 1, ratio: Math.min(devicePixelRatio, 1.5) }
  const resize = () => {
    view.w = innerWidth
    view.h = innerHeight
    view.narrow = view.w < 860
    const aspect = view.w / view.h
    // Keep the object (and its labels) inside the frame on tall phone screens.
    view.fit = Math.max(1, 2.9 / (Math.tan((15 * Math.PI) / 180) * aspect) / 13.5)
    renderer.setPixelRatio(view.ratio)
    renderer.setSize(view.w, view.h, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    if (!motion) frame(0)
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  addEventListener("pointermove", (e) => {
    pointer.tx = e.clientX / view.w - 0.5
    pointer.ty = e.clientY / view.h - 0.5
  }, { passive: true })

  const look = new THREE.Vector3()
  const seat = new THREE.Vector3()
  const anchor = new THREE.Vector3()
  const inside = new THREE.Vector3(0, 0.06, 0.42)
  const clamp = (v) => Math.min(1, Math.max(0, v))

  function frame(t) {
    pointer.x += (pointer.tx - pointer.x) * 0.04
    pointer.y += (pointer.ty - pointer.y) * 0.04
    rig.position.x = S.x
    spin.rotation.y = S.spin + t * 0.035 + pointer.x * 0.22
    spin.rotation.x = pointer.y * 0.035

    plates.forEach((p, i) => {
      p.mesh.position.y = p.base + S.explode * i * LIFT
      if (!p.ring) return
      // Light runs down the well from the top plate once the model is seated.
      const lit = clamp(S.glow * plates.length - (plates.length - 1 - i))
      p.ring.material.color.copy(SAFFRON).multiplyScalar(0.08 + lit * 0.92)
    })
    contact.scale.setScalar(1 + S.explode * 0.25)
    contact.material.opacity = 1 - S.explode * 0.35
    const float = clamp(S.coreY)
    core.position.y = seatY + S.coreY + S.explode * ((plates.length - 1) * LIFT + 0.45) + Math.sin(t * 1.4) * 0.05 * float
    core.rotation.y = t * 0.25
    lattice.rotation.set(t * 0.18, t * 0.24, 0)
    heart.material.color.copy(SAFFRON).multiplyScalar(0.7 + S.glow * 0.3)
    lamp.intensity = 0.3 + S.glow * 0.9

    const dist = S.dist * view.fit
    const lookY = S.look - (view.narrow ? 0.8 : 0)
    look.set(0, lookY, 0)
    camera.position.set(0, lookY + Math.sin(S.el) * dist, Math.cos(S.el) * dist)
    if (S.dive > 0) {
      core.getWorldPosition(seat)
      look.lerp(seat, clamp(S.dive * 1.6))
      camera.position.lerp(seat.clone().add(inside), S.dive)
    }
    camera.lookAt(look)

    const show = clamp((S.explode - 0.55) / 0.35) * clamp(1 - S.dive * 4)
    plates.forEach((p, i) => {
      anchor.set(S.x + 2.15, p.mesh.position.y + p.height / 2, 0).project(camera)
      const el = labels[i]
      el.style.opacity = show
      el.style.transform = `translate(${((anchor.x + 1) / 2) * view.w}px, ${((1 - anchor.y) / 2) * view.h - 18}px)`
    })

    renderer.toneMappingExposure = S.exposure
    renderer.render(scene, camera)
  }

  resize()
  addEventListener("resize", resize)

  if (!motion) {
    Object.assign(S, { coreY: 0, glow: 1, spin: 0.55, dist: 21, el: 0.45, look: 2.0 })
    frame(0)
    return
  }

  // If frames keep running long (a slow GPU), render fewer pixels until it keeps up.
  const pace = { last: 0, slow: 0 }
  const adapt = (now) => {
    const dt = now - pace.last
    pace.last = now
    if (dt > 250) return
    pace.slow = dt > 22 ? pace.slow + 1 : Math.max(0, pace.slow - 1)
    if (pace.slow < 40 || view.ratio <= 0.75) return
    view.ratio = Math.max(0.75, view.ratio - 0.25)
    pace.slow = 0
    resize()
  }

  const active = { on: true }
  const clock = new THREE.Clock()
  renderer.setAnimationLoop((now) => {
    if (!active.on) return
    adapt(now)
    frame(clock.getElapsedTime())
  })
  scroll(active)
}

function scroll(active) {
  gsap.registerPlugin(ScrollTrigger)
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: 0.075 })
    lenis.on("scroll", ScrollTrigger.update)
    gsap.ticker.add((t) => lenis.raf(t * 1000))
    gsap.ticker.lagSmoothing(0)
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault()
      lenis.scrollTo(a.getAttribute("href") === "#top" ? 0 : a.getAttribute("href"), { duration: 2 })
    }))
  }

  // Opening shot: the studio lights come up on the object while the headline rises.
  gsap.set(".hero", { autoAlpha: 1 })
  gsap.timeline()
    .to(S, { exposure: 1, duration: 2.6, ease: "power2.out" }, 0)
    .from(S, { spin: S.spin - 1.4, coreY: 3.4, duration: 3.2, ease: "expo.out" }, 0)
    .from(".hero h1 span > span", { yPercent: 115, duration: 1.3, ease: "expo.out", stagger: 0.1 }, 0.35)
    .from(".hero .actions", { autoAlpha: 0, y: 20, duration: 1, ease: "power2.out" }, 1.1)

  const narrow = innerWidth < 860
  const chapter = (name) => `[data-chapter=${name}]`
  gsap.timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: "#stage", start: "top top", end: "bottom bottom", scrub: 1.2 } })
    .to(".hero", { autoAlpha: 0, y: -50, duration: 0.7 }, 0.5)
    .to(S, { coreY: 0, duration: 2.1 }, 0.9)
    .to(S, { dist: 12.5, el: 0.62, look: 1.0, spin: "+=1.2", duration: 2.4 }, 0.8)
    .fromTo(chapter("bring"), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 1.5)
    .to(S, { glow: 1, duration: 0.9, ease: "none" }, 2.9)
    .to(chapter("bring"), { autoAlpha: 0, y: -30, duration: 0.5 }, 3.9)
    .to(S, { explode: 1, x: narrow ? -0.9 : 1.6, dist: 18, el: 0.26, look: 2.75, spin: "+=0.7", duration: 2.6 }, 4.0)
    .fromTo(chapter("around"), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 4.8)
    .to(S, { spin: "+=0.3", duration: 1.2, ease: "none" }, 6.6)
    .to(chapter("around"), { autoAlpha: 0, y: -30, duration: 0.5 }, 7.4)
    .to(S, { explode: 0, x: 0, dist: 9, el: 0.72, look: 1.1, duration: 1.2 }, 7.7)
    .to(S, { dive: 1, duration: 1.7, ease: "power2.in" }, 8.7)
    .to(".flash", { opacity: 1, duration: 0.7, ease: "power1.in" }, 9.7)

  gsap.to(".scene", { opacity: 0, ease: "none", scrollTrigger: { trigger: "#session", start: "top bottom", end: "top 20%", scrub: true } })
  ScrollTrigger.create({ trigger: "#session", start: "top top", onEnter: () => { active.on = false }, onLeaveBack: () => { active.on = true } })

  ScrollTrigger.create({ trigger: "#session", start: "top top", end: "bottom bottom", scrub: true, onUpdate: (st) => typeTo(Math.round(sessionChars * Math.min(1, st.progress / 0.8))) })
  gsap.from(".session-inner", { y: 60, opacity: 0, ease: "power2.out", scrollTrigger: { trigger: "#session", start: "top 70%", end: "top 10%", scrub: true } })

  gsap.to("#words .w", { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: "#words", start: "top 78%", end: "bottom 45%", scrub: true } })
  // The modes section holds still while scrolling presses the key through all five modes.
  ScrollTrigger.create({ trigger: "#modes", start: "top top", end: () => `+=${innerHeight * 2.2}`, pin: true, onUpdate: (st) => setMode(Math.min(modes.length - 1, Math.floor(st.progress * modes.length))) })
  gsap.from("#paper", { yPercent: -100, ease: "none", scrollTrigger: { trigger: ".printer", start: "top 85%", end: "top 20%", scrub: 0.6 } })
}

// Product-photography lighting: soft boxes with feathered edges in a dark room, so metal shows long, clean
// highlights and the glass reflects soft light instead of hard squares.
function studioLights() {
  const room = new THREE.Scene()
  room.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: "#1b1a18", side: THREE.BackSide })))
  const feather = feathered()
  const softbox = (w, h, at, power, color = "#ffffff") => {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), alphaMap: feather, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    box.position.set(...at)
    box.lookAt(0, 0, 0)
    room.add(box)
  }
  softbox(16, 7, [0, 10, 0.5], 4.5)
  softbox(5, 15, [-10, 2, 3], 5)
  softbox(4, 15, [10, 3, -3], 3.4)
  softbox(14, 2, [0, 2.5, -11], 1.6, "#ffe6c4")
  softbox(18, 6, [0, 8, -10], 0.9)
  softbox(26, 6, [0, 5, 12], 2.6)
  softbox(24, 10, [0, -6, 9], 1.3, "#f3ece2")
  softbox(8, 3, [-9, 1.5, -6], 2.2, "#ffe7c4")
  return new THREE.PMREMGenerator(renderer).fromScene(room, 0.03).texture
}

function feathered() {
  const c = Object.assign(document.createElement("canvas"), { width: 256, height: 256 })
  const g = c.getContext("2d")
  g.fillStyle = "#000"
  g.fillRect(0, 0, 256, 256)
  g.filter = "blur(28px)"
  g.fillStyle = "#fff"
  g.fillRect(48, 48, 160, 160)
  return new THREE.CanvasTexture(c)
}

// Thin gold rods along every edge of a shape, with a bead at each corner.
function latticeOf(shape, material) {
  const edges = new THREE.EdgesGeometry(shape).attributes.position
  const group = new THREE.Group()
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0085, 0.0085, 1, 10), material, edges.count / 2)
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 16, 12), material, edges.count)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  Array.from({ length: edges.count / 2 }).forEach((_, i) => {
    a.fromBufferAttribute(edges, i * 2)
    b.fromBufferAttribute(edges, i * 2 + 1)
    q.setFromUnitVectors(up, b.clone().sub(a).normalize())
    rods.setMatrixAt(i, m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, a.distanceTo(b), 1)))
    beads.setMatrixAt(i * 2, m.makeTranslation(a.x, a.y, a.z))
    beads.setMatrixAt(i * 2 + 1, m.makeTranslation(b.x, b.y, b.z))
  })
  group.add(rods, beads)
  return group
}

function plateGeometry(hole, depth) {
  const h = W / 2
  const shape = new THREE.Shape()
  shape.absarc(h - CORNER, -h + CORNER, CORNER, -Math.PI / 2, 0)
  shape.absarc(h - CORNER, h - CORNER, CORNER, 0, Math.PI / 2)
  shape.absarc(-h + CORNER, h - CORNER, CORNER, Math.PI / 2, Math.PI)
  shape.absarc(-h + CORNER, -h + CORNER, CORNER, Math.PI, Math.PI * 1.5)
  if (hole) shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 64 })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, BEVEL, 0)
  return geometry
}

// Concentric machining marks, used as a roughness map so highlights break up like spun metal.
function spunTexture() {
  const c = Object.assign(document.createElement("canvas"), { width: 1024, height: 1024 })
  const g = c.getContext("2d")
  g.fillStyle = "#808080"
  g.fillRect(0, 0, 1024, 1024)
  Array.from({ length: 2600 }).forEach(() => {
    const tone = Math.random() < 0.5 ? 255 : 0
    g.strokeStyle = `rgba(${tone},${tone},${tone},${Math.random() * 0.06})`
    g.lineWidth = 0.4 + Math.random() * 1.4
    g.beginPath()
    g.arc(512, 512, Math.random() * 740, 0, Math.PI * 2)
    g.stroke()
  })
  const t = new THREE.CanvasTexture(c)
  t.repeat.set(1 / 3.4, 1 / 3.4)
  t.offset.set(0.5, 0.5)
  t.anisotropy = 16
  return t
}

function radial(stops) {
  const c = Object.assign(document.createElement("canvas"), { width: 512, height: 512 })
  const g = c.getContext("2d")
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256)
  stops.forEach(([at, color]) => grad.addColorStop(at, color))
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function markTexture() {
  const c = Object.assign(document.createElement("canvas"), { width: 256, height: 256 })
  const g = c.getContext("2d")
  g.scale(4, 4)
  g.strokeStyle = "rgba(205,198,186,.75)"
  g.lineJoin = "round"
  g.lineCap = "round"
  g.lineWidth = 3.4
  g.stroke(new Path2D("M18 16h12c10 0 17 7 17 16s-7 16-17 16H18z"))
  g.lineWidth = 3
  g.stroke(new Path2D("M26 27l5 9 5-9"))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
