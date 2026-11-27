import { execFileSync } from 'node:child_process'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// The "Updated <date>" line in each page header: the latest commit's date (every data change is a
// commit, and every push to main deploys), formatted in US Eastern time.
const lastUpdated = (() => {
    try {
        return execFileSync('git', ['log', '-1', '--format=%cI'], { cwd: __dirname, encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
})() || new Date().toISOString();
const lastUpdatedLabel = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
}).format(new Date(lastUpdated));
const siteUpdated = `Updated <time datetime="${lastUpdated}">${lastUpdatedLabel}</time>`;

export default defineConfig({
    base: '/',
    plugins: [
        {
            name: 'site-updated',
            transformIndexHtml: (html) =>
                html.replace(/(<div class="title-row">[\s\S]*?<\/div>)/, `$1\n      <p class="site-updated">${siteUpdated}</p>`),
        },
    ],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                simulator: resolve(__dirname, 'simulator.html'),
                csconfs: resolve(__dirname, 'csconfs.html'),
                submit: resolve(__dirname, 'submit.html'),
                csconfsSubmit: resolve(__dirname, 'csconfs-submit.html'),
                nsf: resolve(__dirname, 'nsf.html'),
                grants: resolve(__dirname, 'grants.html'),
                grantsSubmit: resolve(__dirname, 'grants-submit.html'),
                jobs: resolve(__dirname, 'jobs.html'),
                jobsSubmit: resolve(__dirname, 'jobs-submit.html'),
                stats: resolve(__dirname, 'stats.html'),
            },
        },
    },
})
