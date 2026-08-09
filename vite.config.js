import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    base: '/cspicks/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                analysis: resolve(__dirname, 'analysis.html'),
                compare: resolve(__dirname, 'compare.html'),
                simulator: resolve(__dirname, 'simulator.html'),
                discoveries: resolve(__dirname, 'discoveries.html'),
            },
        },
    },
})
