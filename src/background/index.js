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
  return true
})
