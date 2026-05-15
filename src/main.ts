import { ParticleSystem } from './particles'
import { FrameOverlay }   from './overlays'
import { createPanel }    from './panel'
import './style.css'

let particles: ParticleSystem
let frames:    FrameOverlay
let currentImage: HTMLImageElement | null = null

/* ── Image → offscreen canvas ────────────────────────── */
function imageToCanvas(img: HTMLImageElement) {
  const vw = innerWidth, vh = innerHeight
  const dpr = Math.min(devicePixelRatio, 2)
  const canvas = document.createElement('canvas')
  canvas.width  = vw * dpr
  canvas.height = vh * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const imgAr = img.width / img.height
  const vpAr  = vw / vh
  let dw: number, dh: number
  if (imgAr > vpAr) { dw = vw * 0.88; dh = dw / imgAr }
  else              { dh = vh * 0.88; dw = dh * imgAr }
  const dx = (vw - dw) / 2, dy = (vh - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)

  return { canvas, rect: { x: dx, y: dy, w: dw, h: dh } }
}

/* ── Load image pipeline ─────────────────────────────── */
function handleImage(img: HTMLImageElement) {
  currentImage = img
  document.getElementById('drop-zone')!.classList.add('hidden')

  const { canvas, rect } = imageToCanvas(img)
  particles.init(canvas, rect)
  frames.setImageRect(rect)
  frames.autoGenerate(5)
  frames.render()
}

function loadFile(file: File) {
  const img = new Image()
  img.onload = () => handleImage(img)
  img.src = URL.createObjectURL(file)
}

/* ── Export ────────────────────────────────────────────── */
function exportArt(scale: number) {
  const glCanvas = particles.renderForExport(scale)
  if (!glCanvas) return

  const w = glCanvas.width, h = glCanvas.height
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const ctx = out.getContext('2d')!

  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#0a0a0a'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(glCanvas, 0, 0)

  const framesCanvas = frames.renderForExport(w, h)
  ctx.drawImage(framesCanvas, 0, 0)

  out.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `decomposed-${w}x${h}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, 'image/png')
}

/* ── Bootstrap ────────────────────────────────────────── */
function boot() {
  const glCanvas      = document.getElementById('gl-canvas') as HTMLCanvasElement
  const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement
  const fileInput     = document.getElementById('file-input') as HTMLInputElement
  const dropZone      = document.getElementById('drop-zone')!

  particles = new ParticleSystem(glCanvas)
  frames    = new FrameOverlay(overlayCanvas)

  // Drop zone interactions
  dropZone.addEventListener('click', () => fileInput.click())
  document.body.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over') })
  document.body.addEventListener('dragleave', e => { if (!e.relatedTarget) dropZone.classList.remove('drag-over') })
  document.body.addEventListener('drop', e => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const f = e.dataTransfer?.files[0]
    if (f?.type.startsWith('image/')) loadFile(f)
  })
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) loadFile(f) })

  // Overlay interaction: drag/resize frames, click empty = set decomp center
  frames.setupInteraction((nx, ny) => {
    if (!currentImage) return
    particles.params.decompCenterX = nx
    particles.params.decompCenterY = ny
    const sx = document.querySelector('[data-param="decompCenterX"]') as HTMLInputElement | null
    const sy = document.querySelector('[data-param="decompCenterY"]') as HTMLInputElement | null
    if (sx) { sx.value = String(nx); sx.dispatchEvent(new Event('input', { bubbles: true })) }
    if (sy) { sy.value = String(ny); sy.dispatchEvent(new Event('input', { bubbles: true })) }
  })

  createPanel(particles, frames, {
    onUpload: () => fileInput.click(),
    onExport: exportArt,
    onRegen:  (n) => { frames.autoGenerate(n); frames.render() },
  })

  // Resize
  let rt = 0
  addEventListener('resize', () => {
    clearTimeout(rt)
    rt = window.setTimeout(() => {
      frames.resize()
      if (currentImage) {
        const { canvas, rect } = imageToCanvas(currentImage)
        particles.rebuild(canvas, rect)
        frames.setImageRect(rect)
        frames.render()
      }
    }, 300)
  })
}

boot()