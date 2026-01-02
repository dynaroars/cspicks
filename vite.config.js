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
            },
        },
    },
})
