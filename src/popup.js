// popup.js — comunica con el content script via chrome.tabs.sendMessage

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function sendToContent(action, data = {}) {
  const tab = await getActiveTab()
  if (!tab?.id) return

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action, ...data })
    return response
  } catch (e) {
    console.error('Error enviando mensaje:', e)
    document.getElementById('status').innerHTML =
      'Estado: <span style="color:#f54242">Error - recarga la pestaña</span>'
  }
}

document.getElementById('toggleOverlay').addEventListener('click', async () => {
  const res = await sendToContent('TOGGLE_OVERLAY')
  const btn = document.getElementById('toggleOverlay')
  if (res?.visible) {
    btn.textContent = '✕ Ocultar overlay'
  } else {
    btn.textContent = '⚡ Mostrar overlay'
  }
})

document.getElementById('injectOverlay').addEventListener('click', async () => {
  const tab = await getActiveTab()
  if (!tab?.id) return

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/content/index.js'],
  })

  document.getElementById('status').innerHTML =
    'Estado: <span>overlay re-inyectado</span>'
})
