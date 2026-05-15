import * as THREE from 'three'
import vertexShader from './shaders/particle.vert.glsl?raw'
import fragmentShader from './shaders/particle.frag.glsl?raw'

export interface DecompParams {
  step:            number
  decompCenterX:   number   // 0–1 viewport-relative
  decompCenterY:   number
  decompRadius:    number   // NDC units
  decompFalloff:   number
  decompMode:      number   // 0 = radial, 1 = linear
  decompAngle:     number   // radians (linear mode)
  noiseAmount:     number
  noiseScale:      number
  scatterDist:     number
  edgeSoftness:    number   // alpha fade at the decomposition boundary
}

export interface ImageRect { x: number; y: number; w: number; h: number }

const DEFAULT: DecompParams = {
  step:          1,
  decompCenterX: 0.35,
  decompCenterY: 0.45,
  decompRadius:  0.4,
  decompFalloff: 1.5,
  decompMode:    0,
  decompAngle:   0.785,
  noiseAmount:   0.3,
  noiseScale:    8,
  scatterDist:   0.6,
  edgeSoftness:  0.50,
}

export class ParticleSystem {
  private scene  = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private renderer: THREE.WebGLRenderer
  private material: THREE.ShaderMaterial | null = null
  private raf = 0
  private sourceCanvas: HTMLCanvasElement | null = null

  params: DecompParams = { ...DEFAULT }
  imageRect: ImageRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(innerWidth, innerHeight)
    addEventListener('resize', this.onResize)
    this.tick()
  }

  init(source: HTMLCanvasElement, rect: ImageRect) {
    this.sourceCanvas = source
    this.imageRect = rect
    this.scene.clear()
    this.material = null
    this.build(source)
  }

  rebuild(source?: HTMLCanvasElement, rect?: ImageRect) {
    if (source) this.sourceCanvas = source
    if (rect)   this.imageRect = rect
    if (!this.sourceCanvas) return
    this.scene.clear()
    this.material = null
    this.build(this.sourceCanvas)
  }

  private build(src: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(src)
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.flipY = false

    const W = innerWidth, H = innerHeight
    const STEP = Math.max(this.params.step, 1)
    const cols = Math.floor(W / STEP)
    const rows = Math.floor(H / STEP)
    const N = cols * rows

    const origins = new Float32Array(N * 2)
    const r1 = new Float32Array(N)
    const r2 = new Float32Array(N)
    for (let i = 0, row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++, i++) {
        origins[i * 2]     = c / cols
        origins[i * 2 + 1] = row / rows
        r1[i] = Math.random()
        r2[i] = Math.random()
      }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('aOrigin',  new THREE.BufferAttribute(origins, 2))
    geo.setAttribute('aR1',      new THREE.BufferAttribute(r1, 1))
    geo.setAttribute('aR2',      new THREE.BufferAttribute(r2, 1))

    const dpr = Math.min(devicePixelRatio, 2)
    const p = this.params

    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: {
        uTexture:      { value: tex },
        uStep:         { value: STEP },
        uDpr:          { value: dpr },
        uDecompCenter: { value: new THREE.Vector2(p.decompCenterX * 2 - 1, -(p.decompCenterY * 2 - 1)) },
        uDecompRadius: { value: p.decompRadius },
        uDecompFalloff:{ value: p.decompFalloff },
        uDecompMode:   { value: p.decompMode },
        uDecompAngle:  { value: p.decompAngle },
        uNoiseAmount:  { value: p.noiseAmount },
        uNoiseScale:   { value: p.noiseScale },
        uScatterDist:  { value: p.scatterDist },
        uEdgeSoftness: { value: p.edgeSoftness },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })

    this.scene.add(new THREE.Points(geo, this.material))
  }

  /* ── Export helper ──────────────────────────────────── */
  renderForExport(scale: number): HTMLCanvasElement | null {
    if (!this.material) return null
    const w = Math.round(innerWidth * scale)
    const h = Math.round(innerHeight * scale)
    const c = document.createElement('canvas')
    const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, preserveDrawingBuffer: true })
    r.setSize(w, h)
    r.setPixelRatio(1)

    const origDpr = this.material.uniforms.uDpr.value
    this.material.uniforms.uDpr.value = scale
    r.render(this.scene, this.camera)
    this.material.uniforms.uDpr.value = origDpr
    r.dispose()
    return c
  }

  getCanvas() { return this.renderer.domElement }

  /* ── Internals ──────────────────────────────────────── */
  private onResize = () => { this.renderer.setSize(innerWidth, innerHeight) }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    if (!this.material) return
    const u = this.material.uniforms
    const p = this.params
    u.uDecompCenter.value.set(p.decompCenterX * 2 - 1, -(p.decompCenterY * 2 - 1))
    u.uDecompRadius.value = p.decompRadius
    u.uDecompFalloff.value= p.decompFalloff
    u.uDecompMode.value   = p.decompMode
    u.uDecompAngle.value  = p.decompAngle
    u.uNoiseAmount.value  = p.noiseAmount
    u.uNoiseScale.value   = p.noiseScale
    u.uScatterDist.value  = p.scatterDist
    u.uEdgeSoftness.value = p.edgeSoftness
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.onResize)
    this.renderer.dispose()
  }
}
