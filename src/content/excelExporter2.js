// excelExporter.js — Genera el archivo .xlsx con las capturas organizadas

/**
 * Configuración del layout en Excel
 *
 * Cada imagen ocupa IMG_COL_WIDTH columnas de Excel.
 * Entre imágenes se deja GAP_COLS columnas vacías.
 * Las filas tienen IMG_ROW_HEIGHT puntos de altura.
 */
const IMG_COL_WIDTH = 20      // ancho de columna en caracteres (aprox)
const GAP_COLS = 1            // columnas de separación entre imágenes
const IMG_ROW_HEIGHT = 120    // altura de fila en puntos
const HEADER_ROW_HEIGHT = 20  // altura de la fila de encabezado
const COL_GAP_CHAR_WIDTH = 3  // ancho visual de la columna separadora

// Dimensiones de imagen en el Excel (en px de EMU convertidos internamente)
const IMG_WIDTH_PX = 240
const IMG_HEIGHT_PX = 140

/**
 * @param {CaptureManager} captureManager
 * @returns {Promise<Blob>} — Blob del archivo .xlsx
 */
export async function exportToExcel(captureManager) {
  // Importamos ExcelJS de forma dinámica para no bloquear el content script
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CapturePro Extension'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Capturas', {
    pageSetup: { orientation: 'landscape' },
  })

  // ---------------------------------------------------------
  // 1. Calcular cuántas columnas necesitamos en total
  // ---------------------------------------------------------
  const rows = captureManager.rows.filter(r => r.length > 0)

  if (rows.length === 0) {
    throw new Error('No hay capturas para exportar')
  }

  const maxImgsPerRow = Math.max(...rows.map(r => r.length))

  // Columnas: por cada imagen necesitamos IMG_COL_WIDTH cols + GAP_COLS separación
  const totalCols = maxImgsPerRow * (IMG_COL_WIDTH + GAP_COLS) + 1

  // ---------------------------------------------------------
  // 2. Configurar anchos de columnas
  // ---------------------------------------------------------
  for (let c = 1; c <= totalCols; c++) {
    const isGapCol = c % (IMG_COL_WIDTH + GAP_COLS) === 0
    sheet.getColumn(c).width = isGapCol ? COL_GAP_CHAR_WIDTH : IMG_COL_WIDTH / (IMG_COL_WIDTH / 10)
  }

  // ---------------------------------------------------------
  // 3. Fila de encabezado opcional
  // ---------------------------------------------------------
  sheet.getRow(1).height = HEADER_ROW_HEIGHT
  const headerCell = sheet.getCell('A1')
  headerCell.value = `CapturePro Export — ${new Date().toLocaleString('es-CO')}`
  headerCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF888888' } }

  // ---------------------------------------------------------
  // 4. Insertar imágenes fila por fila
  // ---------------------------------------------------------
  // Comenzamos en la fila 2 (después del header)
  let excelRow = 2

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const captures = rows[rowIdx]

    // Ajustar altura de la fila actual
    sheet.getRow(excelRow).height = IMG_ROW_HEIGHT

    for (let imgIdx = 0; imgIdx < captures.length; imgIdx++) {
      const blob = captures[imgIdx]

      // Convertir Blob → ArrayBuffer → Buffer
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)

      // Agregar imagen al workbook
      const imageId = workbook.addImage({
        buffer: uint8,
        extension: 'jpeg',
      })

      // Calcular posición en columnas:
      // Cada imagen ocupa IMG_COL_WIDTH columnas, luego GAP_COLS de separación
      const colStart = imgIdx * (IMG_COL_WIDTH + GAP_COLS)

      // ExcelJS usa índices base-0 para tl/br
      sheet.addImage(imageId, {
        tl: { col: colStart, row: excelRow - 1 },      // top-left (0-indexed)
        br: { col: colStart + IMG_COL_WIDTH, row: excelRow },  // bottom-right
        editAs: 'oneCell',
      })
    }

    // Moverse a la siguiente fila del Excel
    excelRow++
  }

  // ---------------------------------------------------------
  // 5. Serializar a Blob
  // ---------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * Dispara la descarga del archivo en el navegador.
 * Usa una URL temporal que se revoca después de 60s.
 */
export function downloadBlob(blob, filename = 'capturas.xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  // Limpiar recursos después de la descarga
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }, 60_000)
}
