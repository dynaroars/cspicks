import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    base: '/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                simulator: resolve(__dirname, 'simulator.html'),
                discoveries: resolve(__dirname, 'discoveries.html'),
                funding: resolve(__dirname, 'funding.html'),
            },
        },
    },
})
