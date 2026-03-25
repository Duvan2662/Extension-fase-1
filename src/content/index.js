// content/index.js — Entry point del content script
// Orquesta: CaptureManager + Overlay + ExcelExporter

import { CaptureManager } from './captureManager.js'
import { Overlay } from './overlay.js'
import { exportToExcel, downloadBlob } from './excelExporter.js'

const MAX_CAPTURES = 100

// ─── Instancias principales ───────────────────────────────────────────────────

const captureManager = new CaptureManager()

const overlay = new Overlay({
  onCapture: handleCapture,
  onExport: handleExport,
  onNewRow: handleNewRow,
})

// ─── Inicialización ───────────────────────────────────────────────────────────

function init() {
  // Evitar doble inicialización si el script se recarga
  if (window.__capturePro_initialized) {
    overlay.mount()
    overlay.show()
    return
  }
  window.__capturePro_initialized = true

  overlay.mount()
  overlay.show()

  // Detectar fuente e informar al overlay
  updateSourceInfo()

  // Re-detectar periódicamente (el stream puede cargarse después)
  const sourceInterval = setInterval(() => {
    const source = captureManager.detectSource()
    overlay.updateSource(source ? source.label : 'no detectado')
    if (source) clearInterval(sourceInterval)
  }, 2000)

  console.log('[CapturePro] Content script iniciado')
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCapture() {
  const source = captureManager.detectSource()

  if (!source) {
    overlay.flash('⚠ No se detectó video/canvas', true)
    return
  }

  if (captureManager.totalCount >= MAX_CAPTURES) {
    overlay.flash(`⚠ Límite de ${MAX_CAPTURES} capturas`, true)
    return
  }

  try {
    const blob = await captureManager.captureElement(source.el, source.type)
    captureManager.addCapture(blob)

    overlay.screenFlash()
    overlay.flash(`✓ Captura ${captureManager.totalCount} guardada`)
    updateStats()
  } catch (err) {
    console.error('[CapturePro] Error al capturar:', err)
    overlay.flash(`⚠ ${err.message}`, true)
  }
}

function handleNewRow() {
  const prevCount = captureManager.currentRow.length
  captureManager.insertRowBreak()
  const newRowIdx = captureManager.rows.length

  if (prevCount > 0) {
    overlay.flash(`↵ Nueva fila iniciada (fila ${newRowIdx})`)
  } else {
    overlay.flash('⚠ La fila actual está vacía')
  }

  updateStats()
}

async function handleExport() {
  if (captureManager.totalCount === 0) {
    overlay.flash('⚠ No hay capturas para exportar', true)
    return
  }

  overlay.setExporting(true)
  overlay.flash('⏳ Generando Excel...')

  try {
    const xlsxBlob = await exportToExcel(captureManager)

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)

    downloadBlob(xlsxBlob, `capturas_${timestamp}.xlsx`)

    overlay.flash(`✓ Excel descargado (${captureManager.totalCount} imgs)`)

    // Limpiar memoria después de exportar
    const countBefore = captureManager.totalCount
    captureManager.dispose()

    console.log(`[CapturePro] ${countBefore} capturas exportadas y memoria liberada`)
    updateStats()
  } catch (err) {
    console.error('[CapturePro] Error al exportar:', err)
    overlay.flash(`⚠ Error: ${err.message}`, true)
  } finally {
    overlay.setExporting(false)
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function updateStats() {
  overlay.updateStats({
    count: captureManager.totalCount,
    rowIndex: captureManager.rows.length,
    maxCaptures: MAX_CAPTURES,
  })
}

function updateSourceInfo() {
  const source = captureManager.detectSource()
  overlay.updateSource(source ? source.label : 'no detectado')
}

// ─── Comunicación con el popup (chrome.runtime.onMessage) ────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'TOGGLE_OVERLAY': {
      const visible = overlay.toggle()
      sendResponse({ visible })
      break
    }
    case 'CAPTURE': {
      handleCapture()
      sendResponse({ ok: true })
      break
    }
    case 'NEW_ROW': {
      handleNewRow()
      sendResponse({ ok: true })
      break
    }
    case 'EXPORT': {
      handleExport()
      sendResponse({ ok: true })
      break
    }
    case 'GET_STATUS': {
      sendResponse({
        count: captureManager.totalCount,
        rows: captureManager.rows.length,
      })
      break
    }
  }
  return true // Mantiene el canal abierto para respuestas async
})

// ─── Arranque ─────────────────────────────────────────────────────────────────

// Esperar a que el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
