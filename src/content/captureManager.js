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
   * Captura el elemento fuente y devuelve una Promise<Blob>
   * Usa toBlob() para eficiencia vs toDataURL()
   */
  captureElement(sourceEl, type) {
    return new Promise((resolve, reject) => {
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
}
