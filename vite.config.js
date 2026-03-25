import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
    },
    // Chunk splitting para que ExcelJS no bloquee el content script
    chunkSizeWarningLimit: 2000,
  },
  // Necesario para que ExcelJS funcione en el contexto del browser
  resolve: {
    alias: {
      // Node built-ins shimming para ExcelJS en browser
      stream: 'stream-browserify',
      buffer: 'buffer',
      path: 'path-browserify',
    },
  },
  optimizeDeps: {
    include: ['exceljs', 'buffer'],
  },
  define: {
    // Polyfill global para libs que esperan entorno Node
    global: 'globalThis',
    'process.env': '{}',
  },
})
