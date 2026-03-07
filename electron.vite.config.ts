import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: ['@anthropic-ai/claude-agent-sdk']
    })],
    resolve: {
      browserField: false,
      mainFields: ['module', 'main']
    },
    build: {
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'es'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          widgetPreload: resolve(__dirname, 'src/preload/widgetPreload.ts'),
          leaderWidgetPreload: resolve(__dirname, 'src/preload/leaderWidgetPreload.ts')
        },
        external: ['electron'],
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          widget: resolve(__dirname, 'src/renderer/widget.html'),
          leader: resolve(__dirname, 'src/renderer/leader.html')
        }
      }
    },
    plugins: [react()]
  }
})
