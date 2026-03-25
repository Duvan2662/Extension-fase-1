# CapturePro — Chrome Extension

Extensión de Chrome (Manifest V3) para capturar screenshots de elementos `<video>` o `<canvas>` (como streams scrcpy o iOS) y exportarlos organizados en un archivo Excel.

---

## ✦ Arquitectura

```
scrcpy-capture-ext/
├── manifest.json              # MV3 manifest
├── vite.config.js             # Vite + CRXJS config
├── package.json
├── popup.html                 # UI del popup de la extensión
└── src/
    ├── popup.js               # Lógica del popup
    ├── background/
    │   └── index.js           # Service Worker MV3
    └── content/
        ├── index.js           # Entry point — orquesta todo
        ├── captureManager.js  # Captura + almacenamiento en memoria
        ├── excelExporter.js   # Generación del archivo .xlsx
        ├── overlay.js         # UI flotante draggable
        └── overlay.css        # Estilos del overlay (inyectado con el script)
```

### Flujo de datos

```
Usuario hace clic en "Capturar"
  → content/index.js::handleCapture()
    → captureManager.detectSource()    — detecta <video> o <canvas>
    → captureManager.captureElement()  — dibuja en canvas offscreen
      → canvas.toBlob()                — JPEG 0.75 quality, max 1280×720
    → captureManager.addCapture(blob)  — guarda en rows[][]

Usuario hace clic en "Nueva fila"
  → captureManager.insertRowBreak()   — agrega sub-array en rows

Usuario hace clic en "Exportar Excel"
  → excelExporter.exportToExcel()
    → workbook.addImage() por cada blob
    → sheet.addImage() con posición tl/br calculada
    → workbook.xlsx.writeBuffer()
  → downloadBlob()                    — URL temporal + <a>.click()
  → captureManager.dispose()          — libera memoria
```

---

## ✦ Instalación y desarrollo

### Prerequisitos

- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
# 1. Instalar dependencias
npm install

# 2. También necesitas estos polyfills para ExcelJS en browser:
npm install --save-dev \
  buffer \
  stream-browserify \
  path-browserify \
  vite-plugin-node-polyfills
```

### Modo desarrollo (con Hot Reload)

```bash
npm run dev
```

Vite + CRXJS generará la extensión en `dist/`. En Chrome:

1. Ir a `chrome://extensions/`
2. Activar **Modo desarrollador** (toggle arriba a la derecha)
3. Click en **"Cargar descomprimida"**
4. Seleccionar la carpeta `dist/`

Los cambios en el código se reflejan automáticamente gracias a CRXJS HMR.

### Build de producción

```bash
npm run build
```

Genera `dist/` optimizado. Puedes comprimir la carpeta `dist/` en un `.zip` para subir al Chrome Web Store.

---

## ✦ Configuración de vite.config.js con polyfills

Si ExcelJS tiene problemas con los módulos de Node, usa `vite-plugin-node-polyfills`:

```js
// vite.config.js alternativo
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['buffer', 'stream', 'path'] }),
    crx({ manifest }),
  ],
})
```

```bash
npm install --save-dev vite-plugin-node-polyfills
```

---

## ✦ Detección dinámica del elemento fuente

`captureManager.detectSource()` usa este orden de prioridad:

| Prioridad | Selector | Condición |
|-----------|----------|-----------|
| 1 | `video#scrcpy-video` | `readyState >= 2` (datos disponibles) |
| 2 | `canvas#iosCap` | existe en el DOM |
| 3 | primer `video` | `readyState >= 2` |
| 4 | primer `canvas` | existe en el DOM |

Para cambiar la prioridad o agregar nuevos selectores, edita `detectSource()` en `captureManager.js`.

---

## ✦ Optimización de memoria

| Técnica | Detalle |
|---------|---------|
| `canvas.toBlob()` | Más eficiente que `toDataURL()` (no genera string base64 en memoria) |
| Formato JPEG | ~3–5x más pequeño que PNG para contenido de video |
| Calidad 0.75 | Balance entre calidad visual y tamaño de blob |
| Resolución máxima | 1280×720, reduce capturas de displays 4K/retina |
| Canvas offscreen reutilizable | Un solo elemento `<canvas>` para todas las capturas |
| `dispose()` post-export | Limpia todos los arrays y el canvas offscreen |
| Límite de 100 capturas | Previene OOM en sesiones largas |

---

## ✦ Layout del Excel generado

```
       Col A–T         Col U    Col V–AO        Col AP   ...
Row 1: [Encabezado]
Row 2: [Imagen 1   ]   [gap]    [Imagen 2   ]   [gap]    ...
Row 3: [Imagen N   ]   [gap]    [Imagen N+1 ]   [gap]    ...
```

- Cada imagen ocupa **20 columnas × 1 fila** de Excel
- Entre imágenes hay **1 columna vacía** de separación
- El "salto de línea" mueve el cursor a la siguiente fila del Excel
- Las dimensiones visuales son 240×140 px dentro de la celda

---

## ✦ Mensajes entre popup y content script

El popup se comunica con el content script via `chrome.tabs.sendMessage`:

| Acción | Descripción |
|--------|-------------|
| `TOGGLE_OVERLAY` | Muestra/oculta el overlay flotante |
| `CAPTURE` | Dispara una captura programáticamente |
| `NEW_ROW` | Inserta un salto de fila |
| `EXPORT` | Exporta a Excel |
| `GET_STATUS` | Devuelve `{count, rows}` |

---

## ✦ Troubleshooting

**"drawImage falló: Tainted canvases may not be exported"**
El canvas tiene contenido cross-origin. Asegúrate de que el stream esté servido desde el mismo origen o con los headers CORS correctos.

**"Elemento sin dimensiones"**
El video aún no tiene datos. Espera a que el stream esté reproduciéndose antes de capturar.

**ExcelJS falla en el bundle**
Agrega `vite-plugin-node-polyfills` como se describe arriba.

**El overlay no aparece**
Recarga la pestaña y luego abre el popup para re-inyectar el script.
