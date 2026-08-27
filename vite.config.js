import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    base: '/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                simulator: resolve(__dirname, 'simulator.html'),
                csconfs: resolve(__dirname, 'csconfs.html'),
                csconfsSubmit: resolve(__dirname, 'csconfs-submit.html'),
                nsf: resolve(__dirname, 'nsf.html'),
                grants: resolve(__dirname, 'grants.html'),
                grantsSubmit: resolve(__dirname, 'grants-submit.html'),
            },
        },
    },
})
