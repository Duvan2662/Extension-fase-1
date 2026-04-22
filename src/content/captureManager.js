// captureManager.js — Gestión de capturas y estructura de datos en memoria

const MAX_CAPTURES = 100
const JPEG_QUALITY = 0.75   // 0.6–0.8 recomendado
const MAX_WIDTH = 1280       // Resolución máxima (reduce memoria)
const MAX_HEIGHT = 720

/**
 * Estructura de datos: arreglo bidimensional de Blobs
 * rows = [[Blob, Blob, ...], [Blob, Blob, ...], ...]
 * Cada sub-array representa una fila en el Excel.
 */
export class CaptureManager {
  constructor() {
    this.rows = [[]]           // Inicia con una fila vacía
    this.totalCount = 0
    this._offscreenCanvas = null
    this._offscreenCtx = null
  }

  /** Detecta el elemento fuente: <video id="scrcpy-video"> o <canvas id="iosCap"> */
  detectSource() {
    // Prioridad 1: video scrcpy
    const video = document.getElementById('scrcpy-video')
    if (video && video.tagName === 'VIDEO' && video.readyState >= 2) {
      return { el: video, type: 'video', label: 'video#scrcpy-video' }
    }

    // Prioridad 2: canvas iOS
    const canvas = document.getElementById('iosCap')
    if (canvas && canvas.tagName === 'CANVAS') {
      return { el: canvas, type: 'canvas', label: 'canvas#iosCap' }
    }

    // Fallback: primer <video> activo en la página
    const anyVideo = document.querySelector('video')
    if (anyVideo && anyVideo.readyState >= 2) {
      return { el: anyVideo, type: 'video', label: 'video (auto-detected)' }
    }

    // Fallback: primer <canvas> en la página
    const anyCanvas = document.querySelector('canvas')
    if (anyCanvas) {
      return { el: anyCanvas, type: 'canvas', label: 'canvas (auto-detected)' }
    }

    return null
  }

  /** Obtiene/crea el canvas offscreen reutilizable */
  _getOffscreenCanvas(w, h) {
    if (!this._offscreenCanvas) {
      this._offscreenCanvas = document.createElement('canvas')
      this._offscreenCtx = this._offscreenCanvas.getContext('2d')
    }
    // Redimensiona si cambia el tamaño
    if (this._offscreenCanvas.width !== w || this._offscreenCanvas.height !== h) {
      this._offscreenCanvas.width = w
      this._offscreenCanvas.height = h
    }
    return { canvas: this._offscreenCanvas, ctx: this._offscreenCtx }
  }

  /**
   * Calcula dimensiones reducidas manteniendo aspect ratio
   */
  _computeDimensions(srcWidth, srcHeight) {
    let w = srcWidth
    let h = srcHeight

    if (w > MAX_WIDTH) {
      h = Math.round((h * MAX_WIDTH) / w)
      w = MAX_WIDTH
    }
    if (h > MAX_HEIGHT) {
      w = Math.round((w * MAX_HEIGHT) / h)
      h = MAX_HEIGHT
    }

    return { w, h }
  }

  /**
   * Captura el elemento fuente y devuelve una Promise<Blob>.
   * Ejecuta drawImage dentro de un requestAnimationFrame para asegurar que
   * la GPU haya commiteado el frame actual antes de leer el framebuffer.
   * Si detecta un frame negro, reintenta hasta MAX_ATTEMPTS veces.
   */
  captureElement(sourceEl, type) {
    const MAX_ATTEMPTS = 3
    let attempts = 0

    return new Promise((resolve, reject) => {
      const tryCapture = () => {
        // Sincronizar con el ciclo de render del browser
        requestAnimationFrame(() => {
          const srcW = type === 'video' ? sourceEl.videoWidth : sourceEl.width
          const srcH = type === 'video' ? sourceEl.videoHeight : sourceEl.height

          if (!srcW || !srcH) {
            reject(new Error('Elemento sin dimensiones. ¿Está activo el stream?'))
            return
          }

          const { w, h } = this._computeDimensions(srcW, srcH)
          const { canvas, ctx } = this._getOffscreenCanvas(w, h)

          try {
            ctx.clearRect(0, 0, w, h)
            ctx.drawImage(sourceEl, 0, 0, w, h)
          } catch (e) {
            reject(new Error(`drawImage falló: ${e.message}`))
            return
          }

          // Detectar frame negro antes de exportar
          if (attempts < MAX_ATTEMPTS - 1 && this._isFrameBlack(ctx, w, h)) {
            attempts++
            console.warn(`[CapturePro] Frame negro detectado, reintentando (${attempts}/${MAX_ATTEMPTS - 1})...`)
            setTimeout(tryCapture, 50)
            return
          }

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('toBlob devolvió null'))
                return
              }
              resolve(blob)
            },
            'image/jpeg',
            JPEG_QUALITY
          )
        })
      }

      tryCapture()
    })
  }

  /**
   * Muestrea 5 píxeles distribuidos en el canvas para detectar frames negros.
   * Devuelve true si todos los píxeles muestreados son muy oscuros.
   */
  _isFrameBlack(ctx, w, h) {
    const points = [
      [Math.floor(w * 0.25), Math.floor(h * 0.25)],
      [Math.floor(w * 0.75), Math.floor(h * 0.25)],
      [Math.floor(w * 0.5),  Math.floor(h * 0.5)],
      [Math.floor(w * 0.25), Math.floor(h * 0.75)],
      [Math.floor(w * 0.75), Math.floor(h * 0.75)],
    ]

    for (const [x, y] of points) {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
      if (r > 15 || g > 15 || b > 15) return false
    }
    return true
  }

  /**
 * Captura la pestaña completa vía background (chrome.tabs.captureVisibleTab)
 * Recibe un dataURL JPEG y lo convierte a Blob para almacenarlo igual que las demás capturas.
 */
  async captureScreen() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'CAPTURE_SCREEN' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (response?.error) {
          reject(new Error(response.error))
          return
        }
        if (!response?.dataUrl) {
          reject(new Error('No se recibió imagen del background'))
          return
        }

        // Convertir dataURL → Blob
        const byteString = atob(response.dataUrl.split(',')[1])
        const mime = 'image/jpeg'
        const ab = new ArrayBuffer(byteString.length)
        const ia = new Uint8Array(ab)
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i)
        }
        const blob = new Blob([ab], { type: mime })
        resolve(blob)
      })
    })
  }

  /** Elimina la última captura (tipo stack - LIFO) */
  removeLastCapture() {
    // Si no hay capturas, no hacer nada
    if (this.totalCount === 0) return false

    // Empezar desde la última fila hacia atrás
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i]

      if (row.length > 0) {
        row.pop() // elimina último blob
        this.totalCount--

        // Si la fila queda vacía y no es la única, eliminarla
        if (row.length === 0 && this.rows.length > 1) {
          this.rows.splice(i, 1)
        }

        return true
      }
    }

    return false
  }

  /** Agrega un blob a la fila actual */
  addCapture(blob) {
    if (this.totalCount >= MAX_CAPTURES) {
      throw new Error(`Límite de ${MAX_CAPTURES} capturas alcanzado`)
    }
    this.currentRow.push(blob)
    this.totalCount++
  }


  /** Inserta un salto de fila (nueva fila en el Excel) */
  insertRowBreak() {
    // Solo crea nueva fila si la actual tiene al menos 1 captura
    if (this.currentRow.length > 0) {
      this.rows.push([])
    }
  }

  get currentRow() {
    return this.rows[this.rows.length - 1]
  }

  get rowCount() {
    return this.rows.filter(r => r.length > 0).length
  }

  /** Libera todos los recursos: revoca URLs de blobs y limpia arrays */
  dispose() {
    // Los Blobs no tienen URL que revocar aquí (no usamos createObjectURL para ellos)
    // pero liberamos referencias para que el GC actúe
    for (const row of this.rows) {
      row.length = 0
    }
    this.rows = [[]]
    this.totalCount = 0

    // Libera el canvas offscreen
    if (this._offscreenCanvas) {
      this._offscreenCtx.clearRect(
        0, 0,
        this._offscreenCanvas.width,
        this._offscreenCanvas.height
      )
      this._offscreenCanvas.width = 1
      this._offscreenCanvas.height = 1
    }
  }

  /** Serializa blob a base64 ArrayBuffer para ExcelJS */
  async blobToArrayBuffer(blob) {
    return blob.arrayBuffer()
  }

  async saveToStorage() {
    const serialized = []

    for (const row of this.rows) {
      const newRow = []
      for (const blob of row) {
        const base64 = await this._blobToBase64(blob)
        newRow.push(base64)
      }
      serialized.push(newRow)
    }

    await chrome.storage.local.set({
      captures: serialized,
      totalCount: this.totalCount
    })
  }

  async loadFromStorage() {
    const data = await chrome.storage.local.get(['captures', 'totalCount'])

    if (!data.captures) {
      this.totalCount = data.totalCount || 0
      return
    }

    this.rows = []

    for (const row of data.captures) {
      const newRow = []
      for (const base64 of row) {
        const blob = await fetch(base64).then(r => r.blob())
        newRow.push(blob)
      }
      this.rows.push(newRow)
    }

    this.totalCount = data.totalCount || 0

    if (this.rows.length === 0) {
      this.rows = [[]]
    }
  }

  _blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }
}



