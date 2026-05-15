import type { ImageRect } from './particles'

export interface DetectionFrame {
  id:    string
  x:     number   // 0–1 relative to image
  y:     number
  w:     number
  h:     number
  label: string
  color: string
}

const LABELS = [
  'object', 'node', 'signal', 'data', 'element',
  'pattern', 'cluster', 'fragment', 'matrix', 'vector',
]
const COLORS = [
  '#ff3366', '#33ff99', '#3399ff', '#ffcc33', '#ff33cc',
  '#33ffff', '#ff6633', '#99ff33', '#cc33ff', '#33ccff',
]

const EDGE_TOL = 7   // px tolerance for edge/corner hit
const MIN_SIZE = 0.02 // minimum frame dimension in image-relative coords

interface DragState {
  frame: DetectionFrame
  handle: string   // 'body' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
  ox: number       // mouse origin in image-relative
  oy: number
  fx: number       // frame snapshot at drag start
  fy: number
  fw: number
  fh: number
}

export class FrameOverlay {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private ir: ImageRect = { x: 0, y: 0, w: 0, h: 0 }
  private dpr = Math.min(devicePixelRatio, 2)
  private drag: DragState | null = null

  frames: DetectionFrame[] = []
  showLabels   = true
  showFrames   = true
  thickness    = 2
  monochrome   = false
  frameOpacity = 0.85

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio, 2)
    this.canvas.width  = innerWidth  * this.dpr
    this.canvas.height = innerHeight * this.dpr
  }

  setImageRect(r: ImageRect) { this.ir = r }

  autoGenerate(count: number) {
    this.frames = []
    for (let i = 0; i < count; i++) {
      const w = 0.08 + Math.random() * 0.3
      const h = 0.08 + Math.random() * 0.3
      this.frames.push({
        id:    `f${i}`,
        x:     Math.random() * (1 - w),
        y:     Math.random() * (1 - h),
        w, h,
        label: `${LABELS[i % LABELS.length]}_${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
        color: COLORS[i % COLORS.length],
      })
    }
  }

  /* ── Interaction ────────────────────────────────────── */

  setupInteraction(onEmptyClick: (nx: number, ny: number) => void) {
    const c = this.canvas
    c.style.pointerEvents = 'auto'
    c.style.cursor = 'crosshair'

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      const hit = this.hitTest(e.clientX, e.clientY)
      if (!hit) {
        onEmptyClick(e.clientX / innerWidth, e.clientY / innerHeight)
        return
      }
      this.drag = {
        frame:  hit.frame,
        handle: hit.handle,
        ox: (e.clientX - this.ir.x) / this.ir.w,
        oy: (e.clientY - this.ir.y) / this.ir.h,
        fx: hit.frame.x,
        fy: hit.frame.y,
        fw: hit.frame.w,
        fh: hit.frame.h,
      }
      e.preventDefault()
    })

    c.addEventListener('mousemove', (e) => {
      if (this.drag) {
        this.applyDrag(e.clientX, e.clientY)
        return
      }
      const hit = this.hitTest(e.clientX, e.clientY)
      c.style.cursor = hit ? cursorFor(hit.handle) : 'crosshair'
    })

    window.addEventListener('mouseup', () => { this.drag = null })
  }

  private hitTest(mx: number, my: number): { frame: DetectionFrame; handle: string } | null {
    const { ir } = this
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i]
      const l = ir.x + f.x * ir.w
      const t = ir.y + f.y * ir.h
      const r = l + f.w * ir.w
      const b = t + f.h * ir.h

      const nearL = Math.abs(mx - l) < EDGE_TOL
      const nearR = Math.abs(mx - r) < EDGE_TOL
      const nearT = Math.abs(my - t) < EDGE_TOL
      const nearB = Math.abs(my - b) < EDGE_TOL
      const inX   = mx > l - EDGE_TOL && mx < r + EDGE_TOL
      const inY   = my > t - EDGE_TOL && my < b + EDGE_TOL

      if (!inX || !inY) continue

      if (nearT && nearL) return { frame: f, handle: 'nw' }
      if (nearT && nearR) return { frame: f, handle: 'ne' }
      if (nearB && nearL) return { frame: f, handle: 'sw' }
      if (nearB && nearR) return { frame: f, handle: 'se' }
      if (nearT && inX)   return { frame: f, handle: 'n' }
      if (nearB && inX)   return { frame: f, handle: 's' }
      if (nearL && inY)   return { frame: f, handle: 'w' }
      if (nearR && inY)   return { frame: f, handle: 'e' }
      if (mx > l && mx < r && my > t && my < b) return { frame: f, handle: 'body' }
    }
    return null
  }

  private applyDrag(mx: number, my: number) {
    const d = this.drag!
    const nx = (mx - this.ir.x) / this.ir.w
    const ny = (my - this.ir.y) / this.ir.h
    const dx = nx - d.ox
    const dy = ny - d.oy
    const f = d.frame

    if (d.handle === 'body') {
      f.x = d.fx + dx
      f.y = d.fy + dy
    } else {
      if (d.handle.includes('w')) { f.x = d.fx + dx; f.w = Math.max(MIN_SIZE, d.fw - dx) }
      if (d.handle.includes('e')) { f.w = Math.max(MIN_SIZE, d.fw + dx) }
      if (d.handle.includes('n')) { f.y = d.fy + dy; f.h = Math.max(MIN_SIZE, d.fh - dy) }
      if (d.handle.includes('s')) { f.h = Math.max(MIN_SIZE, d.fh + dy) }
    }
    this.render()
  }

  /* ── Rendering ──────────────────────────────────────── */

  render() {
    const { ctx, dpr } = this
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.showFrames || !this.frames.length) return
    ctx.save()
    ctx.scale(dpr, dpr)
    this.drawFrames(ctx)
    ctx.restore()
  }

  renderForExport(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    if (!this.showFrames) return c
    const s = w / innerWidth
    ctx.save()
    ctx.scale(s, s)
    this.drawFrames(ctx)
    ctx.restore()
    return c
  }

  getCanvas() { return this.canvas }

  private drawFrames(ctx: CanvasRenderingContext2D) {
    const { ir } = this
    for (const f of this.frames) {
      const px = ir.x + f.x * ir.w
      const py = ir.y + f.y * ir.h
      const pw = f.w * ir.w
      const ph = f.h * ir.h

      const stroke = this.monochrome
        ? `rgba(255,255,255,${this.frameOpacity})`
        : f.color

      // Main rect
      ctx.strokeStyle = stroke
      ctx.lineWidth = this.thickness
      ctx.strokeRect(px, py, pw, ph)

      // Corner marks
      const cm = Math.min(pw, ph) * 0.15
      ctx.lineWidth = this.thickness + 1
      ctx.beginPath()
      ctx.moveTo(px, py + cm); ctx.lineTo(px, py); ctx.lineTo(px + cm, py)
      ctx.moveTo(px + pw - cm, py); ctx.lineTo(px + pw, py); ctx.lineTo(px + pw, py + cm)
      ctx.moveTo(px + pw, py + ph - cm); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px + pw - cm, py + ph)
      ctx.moveTo(px + cm, py + ph); ctx.lineTo(px, py + ph); ctx.lineTo(px, py + ph - cm)
      ctx.stroke()

      if (!this.showLabels) continue

      ctx.font = "bold 11px 'JetBrains Mono', monospace"
      const tm = ctx.measureText(f.label)
      const lh = 18, lw = tm.width + 10

      if (this.monochrome) {
        ctx.fillStyle = `rgba(0,0,0,${this.frameOpacity * 0.45})`
        ctx.fillRect(px, py - lh, lw, lh)
        ctx.fillStyle = stroke
      } else {
        ctx.fillStyle = f.color
        ctx.fillRect(px, py - lh, lw, lh)
        ctx.fillStyle = '#000'
      }
      ctx.textBaseline = 'middle'
      ctx.fillText(f.label, px + 5, py - lh / 2)
    }
  }
}

function cursorFor(handle: string): string {
  switch (handle) {
    case 'body': return 'move'
    case 'n': case 's': return 'ns-resize'
    case 'e': case 'w': return 'ew-resize'
    case 'nw': case 'se': return 'nwse-resize'
    case 'ne': case 'sw': return 'nesw-resize'
    default: return 'crosshair'
  }
}
