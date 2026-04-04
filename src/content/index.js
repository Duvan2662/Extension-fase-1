// content/index.js — Entry point del content script
// Orquesta: CaptureManager + Overlay + ExcelExporter

import { CaptureManager } from './captureManager.js'
import { Overlay } from './overlay.js'
import { exportToExcel, downloadBlob } from './excelExporter.js'

const MAX_CAPTURES = 100

// ─── Instancias principales ────────────────────────────────────────a───────────

const captureManager = new CaptureManager()

const overlay = new Overlay({
  onCapture: handleCapture,
  onDeleteLast: handleDeleteLast,
  onExport: handleExport,
  onNewRow: handleNewRow,
  onCaptureScreen: handleCaptureScreen,
})

// ─── Inicialización ───────────────────────────────────────────────────────────

async function init() {
  // Evitar doble inicialización si el script se recarga
  if (window.__capturePro_initialized) {
    overlay.mount()
    overlay.show()
    return
  }
  window.__capturePro_initialized = true


  await captureManager.loadFromStorage();
  overlay.mount()
  overlay.show()

  // Detectar fuente e informar al overlay
  updateStats()
  updateSourceInfo()

  // Re-detectar periódicamente (el stream puede cargarse después)
  const sourceInterval = setInterval(() => {
    const source = captureManager.detectSource()
    overlay.updateSource(source ? source.label : 'no detectado')
    if (source) clearInterval(sourceInterval)
  }, 2000)

  console.log('[CapturePro] Content script iniciado')
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.captures || changes.totalCount)) {
      syncFromStorage()
    }
  })
}

async function syncFromStorage() {
  await captureManager.loadFromStorage()
  updateStats()
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
    await captureManager.saveToStorage()

    overlay.screenFlash()
    overlay.flash(`✓ Captura ${captureManager.totalCount} guardada`)
    updateStats()
  } catch (err) {
    console.error('[CapturePro] Error al capturar:', err)
    overlay.flash(`⚠ ${err.message}`, true)
  }
}

async function handleCaptureScreen() {
  if (captureManager.totalCount >= MAX_CAPTURES) {
    overlay.flash(`Límite de ${MAX_CAPTURES} capturas`, true)
    return
  }

  try {
    // 1. Ocultar overlay para que no aparezca en la captura
    overlay.hideInstant()

    // 2. Esperar 2 frames para asegurar que el overlay desapareció del render
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

    // 3. Capturar
    const blob = await captureManager.captureScreen()

    // 4. Volver a mostrar el overlay
    overlay.showAfterCapture()

    // 5. Guardar igual que las demás capturas
    captureManager.addCapture(blob)
    await captureManager.saveToStorage()
    overlay.screenFlash()
    overlay.flash(`Pantalla ${captureManager.totalCount} guardada`)
    updateStats()
  } catch (err) {
    overlay.show() // siempre restaurar
    console.error('[CapturePro] Error al capturar pantalla:', err)
    overlay.flash(`${err.message}`, true)
  }
}

async function handleDeleteLast() {
  const removed = captureManager.removeLastCapture()

  if (!removed) {
    overlay.flash('⚠ No hay capturas para eliminar', true)
    return
  }

  overlay.flash('🗑 Última captura eliminada')
  updateStats()
  await captureManager.saveToStorage()
}

async function handleNewRow() {
  const prevCount = captureManager.currentRow.length
  captureManager.insertRowBreak()
  await captureManager.saveToStorage()
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
    overlay.flash('No hay capturas para exportar', true)
    return
  }

  // ── NUEVO: pedir caso de prueba ──
  let casoPrueba = ''
  try {
    casoPrueba = await overlay.promptCasoPrueba()
    // casoPrueba puede ser '' si no escribió nada — igual continúa
  } catch (e) {
    // Usuario canceló con Escape o botón Cancelar
    return
  }


  overlay.setExporting(true)
  overlay.flash('Generando Excel...')

  try {
    const xlsxBlob = await exportToExcel(captureManager, casoPrueba)

    const now = new Date()

    const fecha = now.toLocaleDateString('es-CO')
      .split('/')
      .map(n => n.padStart(2, '0'))
      .join('-') // DD-MM-AAAA

    const hora = now.toTimeString()
      .split(' ')[0]
      .replace(/:/g, '-') // HH-MM-SS

    const filename = `Evidencia - ${fecha} - ${hora}.xlsx`
    downloadBlob(xlsxBlob, filename)

    overlay.flash(`Excel descargado (${captureManager.totalCount} imgs)`)

    // Limpiar memoria después de exportar
    const countBefore = captureManager.totalCount
    captureManager.dispose()
    await chrome.storage.local.remove(['captures', 'totalCount'])

    console.log(`[CapturePro] ${countBefore} capturas exportadas y memoria liberada`)
    updateStats()
  } catch (err) {
    console.error('[CapturePro] Error al exportar:', err)
    overlay.flash(`Error: ${err.message}`, true)
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
    case 'CAPTURE_SCREEN': {
      handleCaptureScreen()
      sendResponse({ ok: true })
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
