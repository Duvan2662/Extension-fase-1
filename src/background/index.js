// background/index.js — Service Worker (MV3)
// Maneja mensajes entre popup y content scripts si es necesario

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CapturePro] Extensión instalada correctamente.')
})

// Relay de mensajes opcionales (para futuras expansiones)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PING') {
    sendResponse({ status: 'alive' })
  }

  // ── NUEVO: captura la pestaña visible y devuelve dataURL ──
  if (message.action === 'CAPTURE_SCREEN') {
    chrome.tabs.captureVisibleTab(
      null, // ventana activa
      { format: 'jpeg', quality: 75 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message })
        } else {
          sendResponse({ dataUrl })
        }
      }
    )
    return true // mantiene canal abierto para respuesta async
  }

  return true
})
