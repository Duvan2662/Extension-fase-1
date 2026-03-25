// excelExporter.js — lógica equivalente a Apache POI
const IMAGE_HEIGHT = 378
const START_ROW = 10
const ROW_SPAN = 19
const ROW_GAP = 24
const COL_WIDTH_PX = 64 // ancho estándar de columna en Excel (igual que POI usa 64)

function getImageSize(blob) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(blob)
  })
}

export function downloadBlob(blob, filename = 'capturas.xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }, 60000)
}

export async function exportToExcel(captureManager) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Capturas')

  const rows = captureManager.rows.filter(r => r.length > 0)
  if (rows.length === 0) throw new Error('No hay capturas')

  // ENCABEZADO
  sheet.getCell('A1').value = 'Caso:'
  sheet.getCell('A3').value = 'Cédula:'
  sheet.getCell('A4').value = 'Fecha:'
  sheet.getCell('B4').value = new Date().toLocaleDateString('es-CO')
  sheet.getCell('A5').value = 'Dispositivo:'
  sheet.getCell('A6').value = 'Hora:'
  sheet.getCell('B6').value = new Date().toLocaleTimeString('es-CO')

  // IMÁGENES — lógica idéntica a Apache POI
  let excelRow = START_ROW

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const captures = rows[rowIdx]
    let col = 0 // 🔑 avanza en celdas, igual que POI

    for (let imgIdx = 0; imgIdx < captures.length; imgIdx++) {
      const blob = captures[imgIdx]
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)

      const imageId = workbook.addImage({ buffer: uint8, extension: 'jpeg' })
      const { width, height } = await getImageSize(blob)

      const newWidth = (width * IMAGE_HEIGHT) / height

      // 🔑 Igual que POI: Math.ceil(newWidth / 64)
      const colSpan = Math.ceil(newWidth / COL_WIDTH_PX)

      // 🔑 ExcelJS con tl/br en lugar de ext — respeta celdas igual que POI
      sheet.addImage(imageId, {
        tl: { col: col,            row: excelRow },
        br: { col: col + colSpan,  row: excelRow + ROW_SPAN },
        editAs: 'absolute',
      })

      // 🔑 Igual que POI: col += colSpan + 1
      col += colSpan + 1
    }

    excelRow += ROW_GAP
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}