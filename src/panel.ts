import type { ParticleSystem, DecompParams } from './particles'
import type { FrameOverlay } from './overlays'

export interface PanelActions {
  onUpload:  () => void
  onExport:  (scale: number) => void
  onRegen:   (count: number) => void
}

/* ── Helpers ──────────────────────────────────────────── */
function sliderHTML(key: string, label: string, min: number, max: number, step: number, value: number): string {
  return `<div class="cr">
    <div class="cr-top"><span class="cr-l">${label}</span><span class="cr-v" data-vfor="${key}">${value.toFixed(2)}</span></div>
    <input type="range" class="cr-s" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
  </div>`
}

function segHTML(key: string, label: string, opts: { l: string; v: number }[], active: number): string {
  const btns = opts.map(o =>
    `<button class="seg-btn${o.v === active ? ' active' : ''}" data-value="${o.v}">${o.l}</button>`
  ).join('')
  return `<div class="cr cr-seg" data-param="${key}">
    <span class="cr-l">${label}</span><div class="seg">${btns}</div>
  </div>`
}

/* ── Main ─────────────────────────────────────────────── */
export function createPanel(ps: ParticleSystem, fo: FrameOverlay, act: PanelActions) {
  const p = ps.params
  const el = document.createElement('div')
  el.className = 'panel'

  el.innerHTML = `
    <div class="p-head">
      <span class="p-title">DECOMPOSER</span>
      <button class="p-tog" title="Collapse">&#x25B4;</button>
    </div>
    <div class="p-body">

      <button class="btn-upload" data-act="upload">Load Image</button>

      <div class="p-sec">
        <div class="sec-t">DECOMPOSITION</div>
        ${sliderHTML('decompCenterX', 'Center X',   0,    1,   0.01, p.decompCenterX)}
        ${sliderHTML('decompCenterY', 'Center Y',   0,    1,   0.01, p.decompCenterY)}
        ${sliderHTML('decompRadius',  'Radius',     0,    2,   0.01, p.decompRadius)}
        ${sliderHTML('decompFalloff', 'Falloff',    0.01, 4,   0.01, p.decompFalloff)}
        ${sliderHTML('edgeSoftness', 'Edge Soft',   0,    1,   0.01, p.edgeSoftness)}
        ${segHTML('decompMode', 'Mode', [{l:'Radial',v:0},{l:'Linear',v:1}], p.decompMode)}
        ${sliderHTML('decompAngle',   'Angle',      0,    6.28,0.01, p.decompAngle)}
        ${sliderHTML('noiseAmount',   'Noise',      0,    1,   0.01, p.noiseAmount)}
        ${sliderHTML('noiseScale',    'Noise Scale', 1,   30,  0.5,  p.noiseScale)}
      </div>

      <div class="p-sec">
        <div class="sec-t">PARTICLES</div>
        ${segHTML('step', 'Density', [{l:'Low',v:3},{l:'Med',v:2},{l:'High',v:1}], p.step)}
        ${sliderHTML('scatterDist', 'Scatter',  0.1, 2, 0.01, p.scatterDist)}
      </div>

      <div class="p-sec">
        <div class="sec-t">DETECTION FRAMES</div>
        ${sliderHTML('frameCount', 'Count', 0, 20, 1, 5)}
        <button class="btn-sm" data-act="regen">Regenerate</button>
        ${sliderHTML('frameThick', 'Thickness', 1, 6, 0.5, fo.thickness)}
        ${segHTML('frameMono', 'Style', [{l:'Color',v:0},{l:'Mono',v:1}], 0)}
        ${sliderHTML('frameOpacity', 'Opacity', 0.05, 1, 0.01, fo.frameOpacity)}
        ${segHTML('frameLabels', 'Labels', [{l:'On',v:1},{l:'Off',v:0}], 1)}
        ${segHTML('frameShow',   'Frames', [{l:'Show',v:1},{l:'Hide',v:0}], 1)}
      </div>

      <div class="p-sec">
        <div class="sec-t">BACKGROUND</div>
        <div class="cr cr-color">
          <span class="cr-l">Color</span>
          <input type="color" class="cr-c" data-act="bgcolor" value="#0a0a0a">
        </div>
      </div>

      <div class="p-sec">
        <div class="sec-t">EXPORT</div>
        <div class="cr cr-seg" data-param="exportScale">
          <span class="cr-l">Scale</span>
          <div class="seg">
            <button class="seg-btn" data-value="1">1×</button>
            <button class="seg-btn active" data-value="2">2×</button>
            <button class="seg-btn" data-value="4">4×</button>
          </div>
        </div>
        <button class="btn-export" data-act="export">&#x2913; Download PNG</button>
      </div>

    </div>
  `

  let exportScale = 2
  let frameCount = 5
  let rebuildTimer = 0

  const paramKeys = new Set(Object.keys(ps.params))

  /* ── Slider input ─────────────────────────────── */
  el.addEventListener('input', e => {
    const t = e.target as HTMLInputElement
    if (!t.matches('.cr-s')) return
    const key = t.dataset.param!
    const val = parseFloat(t.value)

    if (paramKeys.has(key)) {
      ;(ps.params as Record<string, number>)[key] = val
    }
    if (key === 'frameCount')   { frameCount = val }
    if (key === 'frameThick')   { fo.thickness = val; fo.render() }
    if (key === 'frameOpacity') { fo.frameOpacity = val; fo.render() }

    const vEl = t.closest('.cr')?.querySelector('.cr-v') as HTMLElement | null
    if (vEl) vEl.textContent = val.toFixed(Number(t.step) < 0.1 ? 2 : val < 10 ? 1 : 0)
  })

  /* ── Click delegation ─────────────────────────── */
  el.addEventListener('click', e => {
    const tgt = e.target as HTMLElement

    // Segmented buttons
    const btn = tgt.closest('.seg-btn') as HTMLElement | null
    if (btn) {
      const row = btn.closest('.cr-seg')!
      const key = row.getAttribute('data-param')!
      const val = parseFloat(btn.dataset.value!)
      row.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      if (paramKeys.has(key)) {
        ;(ps.params as Record<string, number>)[key] = val
        if (key === 'step') {
          clearTimeout(rebuildTimer)
          rebuildTimer = window.setTimeout(() => ps.rebuild(), 100)
        }
      }
      if (key === 'frameLabels')  { fo.showLabels = val === 1; fo.render() }
      if (key === 'frameShow')    { fo.showFrames = val === 1; fo.render() }
      if (key === 'frameMono')    { fo.monochrome = val === 1; fo.render() }
      if (key === 'exportScale')  { exportScale = val }
      return
    }

    // Action buttons
    const action = tgt.dataset.act
    if (action === 'upload')  act.onUpload()
    if (action === 'regen')   { act.onRegen(frameCount) }
    if (action === 'export')  act.onExport(exportScale)
  })

  /* ── Color picker ──────────────────────────────── */
  el.addEventListener('input', e => {
    const t = e.target as HTMLInputElement
    if (t.dataset.act === 'bgcolor') {
      document.body.style.backgroundColor = t.value
    }
  })

  /* ── Collapse ──────────────────────────────────── */
  const togBtn = el.querySelector('.p-tog') as HTMLButtonElement
  const body   = el.querySelector('.p-body') as HTMLElement
  let collapsed = false
  togBtn.addEventListener('click', () => {
    collapsed = !collapsed
    body.style.display = collapsed ? 'none' : ''
    togBtn.innerHTML   = collapsed ? '&#x25BE;' : '&#x25B4;'
  })

  document.body.appendChild(el)
}
