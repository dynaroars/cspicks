import { loadData, filterByYears, parentMap } from './data.js';
import { schoolCoords } from './school_coords.js';
import { areaLabels, cleanName } from './shared.js';

let map;
let markersLayer;
let appData = null;

const areaSelect = document.getElementById('map-area-select');
const regionSelect = document.getElementById('map-region-select');

// area dropdown
Object.entries(areaLabels).forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    areaSelect.appendChild(opt);
});

// Leaflet map
function initMap() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    map = L.map('map-container', {
        center: [39.5, -98.0],
        zoom: 4,
        minZoom: 2,
        maxZoom: 15
    });

    L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
}

// rank color
function rankColor(rank, total) {
    const pct = (rank - 1) / Math.max(total - 1, 1);
    if (pct < 0.33) {
        // green to yellow
        const t = pct / 0.33;
        const r = Math.round(34 + t * (234 - 34));
        const g = Math.round(197 + t * (179 - 197));
        const b = Math.round(94 + t * (8 - 94));
        return `rgb(${r},${g},${b})`;
    } else {
        // yellow to red
        const t = (pct - 0.33) / 0.67;
        const r = Math.round(234 + t * (239 - 234));
        const g = Math.round(179 - t * 179);
        const b = Math.round(8 + t * (68 - 8));
        return `rgb(${r},${g},${b})`;
    }
}

function renderMarkers() {
    if (!appData) return;

    const region = regionSelect.value;
    const selectedArea = areaSelect.value;

    const filtered = filterByYears(appData, undefined, undefined, region, null, null, 'csrankings');
    const schools = filtered.schools;
    const professors = filtered.professors;

    markersLayer.clearLayers();

    let schoolList = [];

    Object.values(schools).forEach(school => {
        const coords = schoolCoords[school.name];
        if (!coords) return;

        let score, facultyInArea, count;

        if (selectedArea === 'overall') {
            score = school.score || 0;
            facultyInArea = [];
            Object.values(school.areas).forEach(a => a.faculty.forEach(f => facultyInArea.push(f)));
            facultyInArea = [...new Set(facultyInArea)];
            count = Object.values(school.areas).reduce((sum, a) => sum + (a.adjusted || 0), 0);
        } else {
            const areaData = school.areas[selectedArea];
            if (!areaData || areaData.adjusted <= 0) return;
            score = areaData.adjusted;
            facultyInArea = [...(areaData.faculty || [])];
            count = areaData.adjusted;
        }

        if (score <= 0 && selectedArea === 'overall') return;

        schoolList.push({
            name: school.name,
            rank: school.rank,
            score,
            count,
            faculty: facultyInArea,
            coords,
            areaRank: school.areaRanks?.[selectedArea]
        });
    });

    // Sort and assign ranks
    if (selectedArea !== 'overall') {
        schoolList.sort((a, b) => b.count - a.count);
        schoolList.forEach((s, i) => s.areaRank = i + 1);
    }

    const total = schoolList.length;

    // Stats
    document.getElementById('stat-schools').textContent = total;
    const totalFaculty = schoolList.reduce((sum, s) => sum + s.faculty.length, 0);
    document.getElementById('stat-faculty').textContent = totalFaculty;
    document.getElementById('stat-top').textContent = schoolList.length > 0
        ? (selectedArea === 'overall'
            ? schoolList.sort((a, b) => (a.rank || 999) - (b.rank || 999))[0]?.name || '-'
            : schoolList[0]?.name || '-')
        : '-';

    if (selectedArea === 'overall') {
        schoolList.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    }

    // Check how many schools are missing coords
    const totalSchools = Object.keys(schools).length;
    const mappedSchools = schoolList.length;
    const missingNote = document.getElementById('map-missing-note');
    const missing = totalSchools - mappedSchools;
    if (missing > 0 && selectedArea === 'overall') {
        missingNote.textContent = `${mappedSchools} of ${totalSchools} schools shown (${missing} missing coordinates)`;
    } else {
        missingNote.textContent = '';
    }

    const maxScore = Math.max(...schoolList.map(s => s.count), 1);

    schoolList.forEach(s => {
        const displayRank = selectedArea === 'overall' ? s.rank : s.areaRank;
        const color = rankColor(displayRank, total);
        const radius = Math.max(6, Math.min(30, 6 + (s.count / maxScore) * 24));

        const circle = L.circleMarker([s.coords.lat, s.coords.lng], {
            radius,
            fillColor: color,
            color: 'rgba(255,255,255,0.6)',
            weight: 1.5,
            fillOpacity: 0.85
        });

        // Faculty list
        const facultyHtml = s.faculty
            .slice(0, 15)
            .map(f => {
                const prof = professors?.[f];
                const adj = prof ? prof.totalAdjusted.toFixed(1) : '?';
                return `<div class="popup-faculty-item">${cleanName(f)} <small style="color:#888">(${adj})</small></div>`;
            })
            .join('');
        const moreHtml = s.faculty.length > 15 ? `<div style="color:#888; font-size:0.75rem">+${s.faculty.length - 15} more</div>` : '';

        const areaLabel = selectedArea === 'overall' ? 'Overall' : (areaLabels[selectedArea] || selectedArea);
        const scoreDisplay = selectedArea === 'overall' ? `Score: ${s.score.toFixed(1)}` : `Adjusted: ${s.count.toFixed(1)}`;

        circle.bindPopup(`
      <div class="popup-school-name">${s.name}</div>
      <div><span class="popup-rank">#${displayRank}</span> in ${areaLabel} · ${scoreDisplay}</div>
      <div style="color:#666; font-size:0.8rem">${s.faculty.length} faculty</div>
      <div class="popup-faculty-list">
        ${facultyHtml}
        ${moreHtml}
      </div>
    `, { maxWidth: 280 });

        circle.addTo(markersLayer);
    });

    // Fit bounds
    if (schoolList.length > 0) {
        const bounds = L.latLngBounds(schoolList.map(s => [s.coords.lat, s.coords.lng]));
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
    }
}

// Theme toggle
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });
    const isDark = next === 'dark';
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
    }).addTo(map);
});

areaSelect.addEventListener('change', renderMarkers);
regionSelect.addEventListener('change', renderMarkers);

async function init() {
    initMap();
    try {
        appData = await loadData();
        renderMarkers();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

init();
