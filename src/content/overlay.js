// overlay.js — Interfaz flotante draggable

export class Overlay {
  constructor({ onCapture, onExport, onNewRow, onDeleteLast, onCaptureScreen }) {
    this.onCapture = onCapture
    this.onExport = onExport
    this.onNewRow = onNewRow
    this.onDeleteLast = onDeleteLast
    this.onCaptureScreen = onCaptureScreen
    this.el = null
    this.visible = false
    this._dragState = null
    this._flashTimeout = null
  }

  /**
   * Crea e inyecta el overlay en el DOM.
   * Si ya existe, lo reutiliza.
   */
  mount() {
    if (document.getElementById('capturepro-overlay')) {
      this.el = document.getElementById('capturepro-overlay')
      this._bindEvents()
      return
    }

    // Inyectar fuentes de Google si no están
    if (!document.getElementById('cp-fonts')) {
      const link = document.createElement('link')
      link.id = 'cp-fonts'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap'
      document.head.appendChild(link)
    }

    this.el = document.createElement('div')
    this.el.id = 'capturepro-overlay'
    this.el.className = 'hidden'
    this.el.innerHTML = this._template()
    document.body.appendChild(this.el)

    this._bindEvents()
    this.visible = false
  }

  _template() {
    return `
      <div id="cp-header">
        <span id="cp-title">◉ CapturePro</span>
        <span id="cp-minimize" title="Minimizar">−</span>
      </div>

      <div id="cp-stats">
        <div>
          <div id="cp-count">0</div>
          <div style="font-size:9px;color:#444;margin-top:2px">capturas</div>
        </div>
        <span id="cp-row-info">Fila 1</span>
      </div>

      <span id="cp-source">Fuente: <span id="cp-source-tag">detectando...</span></span>

      <div id="cp-buttons">
        <button class="cp-btn capture" id="cp-btn-capture">
          <span class="cp-btn-icon">⬤</span>
          Capturar
        </button>
        <button class="cp-btn screen" id="cp-btn-screen">
          <span class="cp-btn-icon">🖥</span>
          Capturar pantalla
        </button>
        <button class="cp-btn delete" id="cp-btn-delete">
          <span class="cp-btn-icon">⌫</span>
          Eliminar última
        </button>
        <button class="cp-btn newrow" id="cp-btn-newrow">
          <span class="cp-btn-icon">↵</span>
          Nueva fila
        </button>
        <button class="cp-btn excel" id="cp-btn-excel" disabled>
          <span class="cp-btn-icon">⬇</span>
          Exportar Excel
        </button>
      </div>

      <div id="cp-progress-bar">
        <div id="cp-progress-fill"></div>
      </div>

      <span id="cp-flash" class="empty"></span>
    `
  }

  _bindEvents() {
    // Drag
    const header = this.el.querySelector('#cp-header')
    header.addEventListener('mousedown', (e) => this._startDrag(e))
    document.addEventListener('mousemove', (e) => this._onDrag(e))
    document.addEventListener('mouseup', () => this._stopDrag())

    // Minimize
    this.el.querySelector('#cp-minimize').addEventListener('click', (e) => {
      e.stopPropagation()
      this.hide()
    })

    // Botones
    this.el.querySelector('#cp-btn-capture').addEventListener('click', () => {
      this.onCapture()
    })

    this.el.querySelector('#cp-btn-screen').addEventListener('click', () => {
      this.onCaptureScreen()
    })

    this.el.querySelector('#cp-btn-delete').addEventListener('click', () => {
      this.onDeleteLast()
    })

    this.el.querySelector('#cp-btn-newrow').addEventListener('click', () => {
      this.onNewRow()
    })

    this.el.querySelector('#cp-btn-excel').addEventListener('click', () => {
      this.onExport()
    })
  }

  // ---- Drag & Drop ----

  _startDrag(e) {
    e.preventDefault()
    const rect = this.el.getBoundingClientRect()
    this._dragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    }
  }

  _onDrag(e) {
    if (!this._dragState) return
    const dx = e.clientX - this._dragState.startX
    const dy = e.clientY - this._dragState.startY
    const newLeft = this._dragState.origLeft + dx
    const newTop = this._dragState.origTop + dy

    // Limitar a la ventana
    const maxLeft = window.innerWidth - this.el.offsetWidth - 8
    const maxTop = window.innerHeight - this.el.offsetHeight - 8

    this.el.style.left = `${Math.max(8, Math.min(maxLeft, newLeft))}px`
    this.el.style.top = `${Math.max(8, Math.min(maxTop, newTop))}px`
    this.el.style.right = 'auto'
  }

  _stopDrag() {
    this._dragState = null
  }

  // ---- Visibilidad ----

  show() {
    this.el.classList.remove('hidden')
    this.visible = true
  }

  hide() {
    this.el.classList.add('hidden')
    this.visible = false
  }

  toggle() {
    if (this.visible) this.hide()
    else this.show()
    return this.visible
  }

  // ---- Actualización de estado ----

  updateStats({ count, rowIndex, maxCaptures }) {
    const countEl = this.el.querySelector('#cp-count')
    const rowEl = this.el.querySelector('#cp-row-info')
    const progressFill = this.el.querySelector('#cp-progress-fill')
    const excelBtn = this.el.querySelector('#cp-btn-excel')

    if (countEl) countEl.textContent = count
    if (rowEl) rowEl.textContent = `Fila ${rowIndex}`
    if (progressFill) {
      const pct = Math.min(100, Math.round((count / maxCaptures) * 100))
      progressFill.style.width = `${pct}%`

      // Cambia color al acercarse al límite
      if (pct > 85) {
        progressFill.style.background = '#f54242'
      } else if (pct > 60) {
        progressFill.style.background = '#f5a623'
      } else {
        progressFill.style.background = '#c8f542'
      }
    }

    // Habilitar botón Excel si hay capturas
    if (excelBtn) {
      excelBtn.disabled = count === 0
    }
  }

  updateSource(label) {
    const el = this.el.querySelector('#cp-source-tag')
    if (el) el.textContent = label || 'no detectado'
  }

  /** Muestra un mensaje temporal en el overlay */
  flash(message, isError = false) {
    const el = this.el.querySelector('#cp-flash')
    if (!el) return

    el.textContent = message
    el.style.color = isError ? '#f54242' : '#c8f542'
    el.classList.remove('empty')

    clearTimeout(this._flashTimeout)
    this._flashTimeout = setTimeout(() => {
      el.classList.add('empty')
    }, 2500)
  }

  /** Efecto visual de flash en la pantalla al capturar */
  screenFlash() {
    const flashEl = document.createElement('div')
    flashEl.className = 'cp-capture-flash'
    document.body.appendChild(flashEl)
    setTimeout(() => flashEl.remove(), 300)
  }

  /** Deshabilita botones durante la exportación */
  setExporting(exporting) {
    const excelBtn = this.el.querySelector('#cp-btn-excel')
    const captureBtn = this.el.querySelector('#cp-btn-capture')
    const newRowBtn = this.el.querySelector('#cp-btn-newrow')
    const screenBtn = this.el.querySelector('#cp-btn-screen')

    if (excelBtn) {
      excelBtn.disabled = exporting
      excelBtn.querySelector('.cp-btn-icon').textContent = exporting ? '⏳' : '⬇'
    }
    if (captureBtn) captureBtn.disabled = exporting
    if (newRowBtn) newRowBtn.disabled = exporting
    if (screenBtn) screenBtn.disabled = exporting
  }

  unmount() {
    if (this.el) {
      this.el.remove()
      this.el = null
    }
  }
}
