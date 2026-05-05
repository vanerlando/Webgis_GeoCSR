lucide.createIcons();

// ══════════════════════════════════════════════════════════════
// KONFIGURASI DATA & API
// ══════════════════════════════════════════════════════════════
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjFiZWVkNjkzNmM5NDQxNTBhNjk1YWIyNzkzOGI4MDNiIiwiaCI6Im11cm11cjY0In0=';

const DATA_MODE = 'point'; // 'point' atau 'polygon'

const DATA_URL = DATA_MODE === 'point'
    ? 'data/point_ses_jabar_final_v22.geojson'
    : '../Data/desa_jabar_final.geojson';

// ══════════════════════════════════════════════════════════════
// STATE APLIKASI
// ══════════════════════════════════════════════════════════════
const state = {
    factories: [],
    factoryCounter: 0,
    rangeMode: 'radius',   // 'radius' atau 'isochrone'
    radius: 10,            // km
    isochroneMin: 30,      // menit
    rankingMode: 'global',
    weights: { need: 25, idm: 25, proximity: 25, branding: 25 },
    displayLimit: 5,
    unselectedOpacity: 1,
    villages: null,
    filteredVillages: [],
    isAddingLocation: false,
    mapLoaded: false,
    dataLoaded: false,
    isochroneLoading: false,
    // --- State Tabel ---
    viewMode: 'card',       // 'card' atau 'table'
    tableSortCol: 'rank',
    tableSortDir: 'asc',    // 'asc' atau 'desc'
    tableSesFilter: 'all',
    tableLimitFilter: 'all',
    visuals: {
        colors: { factory: '#dc2626', priority: '#10b981', other: '#eab308' },
        opacities: { factory: 1, priority: 1, other: 1 },
        sizes: { factory: 24, priority: 7, other: 5 } // factory dalam pixel, desa dalam unit map
    },
    isAnalyzed: false // Untuk melacak apakah analisis sudah pernah jalan
};

// ══════════════════════════════════════════════════════════════
// INISIALISASI PETA
// ══════════════════════════════════════════════════════════════
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [107.6191, -6.9175],
    zoom: 8,
    pitch: 0,
    preserveDrawingBuffer: true  // Wajib untuk download canvas peta
});

map.addControl(new maplibregl.NavigationControl(), 'top-left');

// Tooltip hover
const tooltip = document.createElement('div');
tooltip.className = 'map-tooltip hidden';
tooltip.style.cssText = 'position:fixed; z-index:50; pointer-events:none;';
document.body.appendChild(tooltip);

// ══════════════════════════════════════════════════════════════
// SETUP PETA & LAYER
// ══════════════════════════════════════════════════════════════
map.on('load', () => {
    state.mapLoaded = true;

    map.addSource('villages', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        generateId: true
    });

    map.addSource('buffer', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    // Layer Heatmap
    map.addLayer({
        id: 'villages-heat',
        type: 'heatmap',
        source: 'villages',
        maxzoom: 10,
        paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 2],
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)',
                0.4, 'rgb(209,229,240)', 0.6, 'rgb(253,219,199)',
                0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)'
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 8, 10, 20],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 10, 0]
        }
    });

    // Layer Poligon (Jika data mode = polygon)
    if (DATA_MODE === 'polygon') {
        map.addLayer({
            id: 'villages-fill',
            type: 'fill',
            source: 'villages',
            minzoom: 9,
            paint: {
                'fill-color': ['case', ['boolean', ['feature-state', 'highlight'], false], '#fde047', ['interpolate', ['linear'], ['get', 'skor_need'], 0, '#bfdbfe', 0.5, '#fef08a', 1, '#ef4444']],
                'fill-opacity': ['case', ['boolean', ['feature-state', 'highlight'], false], 0.85, 0.6]
            }
        });
        map.addLayer({
            id: 'villages-outline',
            type: 'line',
            source: 'villages',
            minzoom: 9,
            paint: {
                'line-color': ['case', ['boolean', ['feature-state', 'highlight'], false], '#ca8a04', '#94a3b8'],
                'line-width': ['case', ['boolean', ['feature-state', 'highlight'], false], 2, 0.5]
            }
        });
    }

    // Layer Titik
    map.addLayer({
        id: 'villages-point',
        type: 'circle',
        source: 'villages',
        minzoom: DATA_MODE === 'polygon' ? 9 : 0,
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 7, 16, 12],

            // Warna titik — prioritas, highlight, atau tersembunyi
            'circle-color': [
                'case',
                ['boolean', ['feature-state', 'top-rank'], false], '#10b981',
                ['boolean', ['feature-state', 'highlight'], false], '#eab308',
                '#ffffff'
            ],

            // Stroke warna sama dengan fill (tidak ada perbedaan border)
            'circle-stroke-color': [
                'case',
                ['boolean', ['feature-state', 'top-rank'], false], '#10b981',
                ['boolean', ['feature-state', 'highlight'], false], '#eab308',
                '#64748b'
            ],

            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'highlight'], false], 1.5, 0],

            'circle-opacity': [
                'case',
                ['boolean', ['feature-state', 'top-rank'], false], 1,
                ['boolean', ['feature-state', 'highlight'], false], ['literal', state.unselectedOpacity !== undefined ? state.unselectedOpacity : 1],
                0
            ],

            'circle-stroke-opacity': [
                'case',
                ['boolean', ['feature-state', 'top-rank'], false], 1,
                ['boolean', ['feature-state', 'highlight'], false], ['literal', state.unselectedOpacity !== undefined ? state.unselectedOpacity : 1],
                0
            ]
        }
    });

    // WADAH ANGKA (RANKING) DI ATAS TITIK HIJAU
    map.addSource('ranked-villages', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
        id: 'ranked-villages-label',
        type: 'symbol',
        source: 'ranked-villages',
        minzoom: 9,
        layout: {
            'text-field': ['to-string', ['get', 'rank']],
            'text-size': 11,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-offset': [0, 0],
            'text-allow-overlap': true
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#065f46',
            'text-halo-width': 2
        }
    });
    // Layer Area Jangkauan
    map.addLayer({ id: 'buffer-fill', type: 'fill', source: 'buffer', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.1 } });
    map.addLayer({ id: 'buffer-line', type: 'line', source: 'buffer', paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 2] } });

    // Hover logic
    const hoverLayer = DATA_MODE === 'polygon' ? 'villages-fill' : 'villages-point';
    map.on('mousemove', hoverLayer, (e) => {
        if (!e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        tooltip.innerHTML = `
            <strong>${p.DESA || p.name || 'Desa'}</strong><br>
            ${p.KECAMATAN ? `Kec. ${p.KECAMATAN}` : ''} ${p.KABKOT ? `· ${p.KABKOT}` : ''}<br>
            SES: ${p.SOCIOECONO || '-'}<br>
            Skor Need: ${p.skor_need ? (p.skor_need * 100).toFixed(1) : 'N/A'}%<br>
            Skor Branding: ${p.skor_branding ? (p.skor_branding * 100).toFixed(1) : 'N/A'}%<br>
            ${p.score ? `<strong>Skor MCDA: ${(p.score * 100).toFixed(1)}%</strong>` : ''}
        `;
        tooltip.style.left = (e.originalEvent.clientX + 15) + 'px';
        tooltip.style.top  = (e.originalEvent.clientY + 15) + 'px';
        tooltip.classList.remove('hidden');
    });

    map.on('mouseleave', hoverLayer, () => {
        map.getCanvas().style.cursor = '';
        tooltip.classList.add('hidden');
    });

    map.on('click', hoverLayer, (e) => {
        if (state.isAddingLocation) return;
        map.flyTo({ center: e.lngLat, zoom: 13, pitch: 0 });
    });

    // Tambah pabrik via klik
    map.on('click', (e) => {
        if (!state.isAddingLocation) return;
        addFactoryLocation(e.lngLat.lng, e.lngLat.lat);
        state.isAddingLocation = false;
        const btn = document.getElementById('btn-add-location');
        btn.classList.remove('btn-adding');
        btn.innerHTML = `<i data-lucide="crosshair" style="width:16px; height:16px;"></i> Klik Peta Untuk Tentukan Lokasi`;
        map.getCanvas().style.cursor = '';
        lucide.createIcons();
    });

    // Load GeoJSON
    fetch(DATA_URL)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
            if (!data.features || data.features.length === 0) {
                console.error("Data kosong!"); return;
            }

            let isSwapped = false;
            let isString = false;

            // 1. CLEANING & REPAIRING KOORDINAT
            data.features.forEach(f => {
                if (!f.geometry) return;
                
                if (f.geometry.type === 'Point') {
                    let x = f.geometry.coordinates[0];
                    let y = f.geometry.coordinates[1];
                    
                    // Deteksi jika koordinat berupa teks (String) dan ubah paksa ke Angka (Float)
                    if (typeof x === 'string' || typeof y === 'string') {
                        isString = true;
                        x = parseFloat(x);
                        y = parseFloat(y);
                    }

                    // Deteksi Lat/Lng Terbalik: 
                    // Jika X adalah rentang Latitude Indonesia (sekitar -11 s/d 6) 
                    // dan Y adalah Longitude Indonesia (> 90)
                    if (Math.abs(x) < 20 && Math.abs(y) > 90) {
                        isSwapped = true;
                        f.geometry.coordinates = [y, x]; // Putar ke [Lng, Lat]
                    } else {
                        f.geometry.coordinates = [x, y]; // Simpan kembali sebagai Angka murni
                    }
                }
            });

            if (isString) console.warn("🔧 Sistem: Memperbaiki koordinat yang berformat Teks menjadi Angka.");
            if (isSwapped) console.warn("🔧 Sistem: Memperbaiki urutan koordinat yang terbalik (Lat, Lng) -> (Lng, Lat).");

            // --- DEBUGGING LOG (SANGAT PENTING) ---
            console.log("📍 Sampel Koordinat Desa 1:", data.features[0].geometry.coordinates);
            console.log("📝 Sampel Data Desa 1:", data.features[0].properties);
            // --------------------------------------

            state.villages = data;
            state.dataLoaded = true;
            map.getSource('villages').setData(data);
            
            const emptyEl = document.getElementById('empty-state');
            if(emptyEl) emptyEl.innerHTML = `<i data-lucide="map" style="width:48px; height:48px; color:#d1d5db; margin-bottom:12px; margin-left:auto; margin-right:auto;"></i><p style="font-size:0.875rem;">Tentukan lokasi perusahaan/pabrik pada peta untuk melihat hasil analisis spasial.</p>`;
            lucide.createIcons();
            
            console.log(`✓ Berhasil memuat ${data.features.length} desa.`);
            
            // Paksa sistem untuk mengkalkulasi ulang jika Anda sudah menaruh titik pabrik
            if (state.factories.length > 0) runAnalysis();
        })
        .catch(err => {
            console.error("Kesalahan fetch:", err);
            document.getElementById('empty-state').innerHTML = `<p style="font-size:0.875rem; color:#ef4444;">⚠️ Gagal memuat data GeoJSON.</p>`;
        });
});

// ══════════════════════════════════════════════════════════════
// FUNGSI JANGKAUAN (ISOCHRONE & RADIUS)
// ══════════════════════════════════════════════════════════════
function setRangeMode(mode) {
    state.rangeMode = mode;
    document.getElementById('btn-mode-radius').classList.toggle('active', mode === 'radius');
    document.getElementById('btn-mode-isochrone').classList.toggle('active', mode === 'isochrone');
    document.getElementById('panel-radius').style.display    = mode === 'radius' ? 'block' : 'none';
    document.getElementById('panel-isochrone').style.display = mode === 'isochrone' ? 'block' : 'none';
    if (state.factories.length > 0) runAnalysis();
}

async function fetchIsochrone(lng, lat, minutes) {
    const statusEl = document.getElementById('isochrone-status');
    if (statusEl) statusEl.style.display = 'flex';
    state.isochroneLoading = true;
    try {
        const res = await fetch('https://api.openrouteservice.org/v2/isochrones/driving-car', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': ORS_API_KEY },
            body: JSON.stringify({ locations: [[lng, lat]], range: [minutes * 60], range_type: 'time', attributes: ['area'] })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        return data.features?.[0] || null;
    } catch (err) {
        alert(`Gagal mengambil data isochrone. Cek koneksi atau API Key.`);
        return null;
    } finally {
        if (statusEl) statusEl.style.display = 'none';
        state.isochroneLoading = false;
    }
}

// ══════════════════════════════════════════════════════════════
// MANAJEMEN PABRIK
// ══════════════════════════════════════════════════════════════
// ── Helper: terapkan style pada elemen marker pabrik ──
function styleMarkerElement(el, size, color, opacity) {
    const s = Math.max(20, size); // minimum 20px agar tidak hilang
    el.style.backgroundColor = color;
    el.style.opacity = opacity;
    el.style.width  = `${s}px`;
    el.style.height = `${s}px`;
    el.style.borderRadius = '50%';      // selalu lingkaran sempurna
    el.style.border = 'none';           // hapus stroke
    el.style.boxShadow = 'none';        // hapus shadow bawaan
    el.style.fontSize = `${Math.round(s * 0.42)}px`; // font proporsional
    el.style.lineHeight = `${s}px`;     // vertikal center
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = '#ffffff';
    el.style.fontWeight = 'bold';
    el.style.cursor = 'pointer';
}

// 1. FUNGSI MENAMBAH TITIK
function addFactoryLocation(lng, lat) {
    const number = state.factories.length + 1;
    const id = Date.now();
    const name = `Titik Pabrik ${number}`;

    const el = document.createElement('div');
    el.className = 'marker-pin';
    el.innerText = number;
    styleMarkerElement(el, state.visuals.sizes.factory, state.visuals.colors.factory, state.visuals.opacities.factory);

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);

    state.factories.push({ id, lng, lat, marker, name, number });
    updateLocationListUI();
    runAnalysis();
}

function renameFactory(id, newName) {
    const f = state.factories.find(f => f.id === id);
    if (f) { f.name = newName || `Titik Pabrik ${f.number}`; runAnalysis(); }
}

// 2. FUNGSI MENGHAPUS TITIK & MENYUSUN ULANG NOMOR (RE-INDEXING)
function removeFactoryLocation(id) {
    const idx = state.factories.findIndex(f => f.id === id);
    if (idx > -1) {
        // A. Cabut pin merah dari peta
        state.factories[idx].marker.remove();
        
        // B. Hapus datanya dari sistem
        state.factories.splice(idx, 1);
        
        // C. Susun ulang semua pabrik yang tersisa agar angkanya rapat kembali
        state.factories.forEach((f, index) => {
            const newNumber = index + 1; // Angka urutan baru (1, 2, 3...)
            const oldDefaultName = `Titik Pabrik ${f.number}`; // Ingat nama default lamanya
            
            // Ubah angka di memori sistem
            f.number = newNumber;
            
            // PERTAHANKAN NAMA KUSTOM: 
            // Kita hanya mengubah namanya JIKA user belum pernah menggantinya (masih nama default).
            // Jika user sudah ganti jadi "Pabrik Sosis", namanya tidak akan kita sentuh!
            if (f.name === oldDefaultName) {
                f.name = `Titik Pabrik ${newNumber}`;
            }
            
            // Ubah angka yang tertulis di dalam PIN MERAH di atas peta
            f.marker.getElement().innerText = newNumber;
        });
        
        // D. Perbarui tampilan daftar di kiri & jalankan ulang radius peta
        updateLocationListUI();
        runAnalysis();
    }
}

// ══════════════════════════════════════════════════════════════
// ANALISIS & MCDA
// ══════════════════════════════════════════════════════════════
async function runAnalysis() {
    if (!state.mapLoaded || !state.dataLoaded || state.isochroneLoading) return;

    state.villages.features.forEach((_, idx) => map.setFeatureState({ source: 'villages', id: idx }, { highlight: false }));

    if (state.factories.length === 0) {
        map.getSource('buffer').setData({ type: 'FeatureCollection', features: [] });
        showEmptyState();
        return;
    }

    let zonePoly = null;
    if (state.rangeMode === 'radius') {
        state.factories.forEach(f => {
            const c = turf.buffer(turf.point([f.lng, f.lat]), state.radius, { steps: 64, units: 'kilometers' });
            zonePoly = zonePoly ? turf.union(zonePoly, c) : c;
        });
    } else {
        const isoList = [];
        for (const f of state.factories) {
            const iso = await fetchIsochrone(f.lng, f.lat, state.isochroneMin);
            if (iso) isoList.push(iso);
        }
        if (!isoList.length) { showEmptyState(); return; }
        zonePoly = isoList.reduce((acc, cur) => acc ? turf.union(acc, cur) : cur, null);
    }

    map.getSource('buffer').setData(zonePoly);

    state.filteredVillages = state.villages.features.filter(v => {
        const point = v.geometry.type === 'Point' ? v : turf.centroid(v);
        return turf.booleanPointInPolygon(point, zonePoly);
    });

    if (!state.filteredVillages.length) {
        showEmptyState();
        document.getElementById('village-count').innerText = '0 Ditemukan';
        return;
    }

// Tandai analisis selesai dan buka kunci visualisasi
    state.isAnalyzed = true;
    const placeholder = document.getElementById('visual-empty-state');
    const controls = document.getElementById('visual-controls-container');
    if(placeholder) placeholder.style.display = 'none';
    if(controls) controls.style.display = 'flex';

    calculateMCDA();
    renderResults();
    highlightMapFeatures();
    updateDynamicLegend();
    applyMapVisuals();
    const legendBox = document.getElementById('analysis-legend');
    if (legendBox) {
        legendBox.classList.remove('hidden-legend'); // Menghapus efek sembunyi
    }
}

function calculateMCDA() {
    const wSum = state.weights.need + state.weights.idm + state.weights.proximity + state.weights.branding;
    if (!wSum) return;
    const wN = state.weights.need / wSum, wI = state.weights.idm / wSum, wD = state.weights.proximity / wSum, wB = state.weights.branding / wSum;

    state.filteredVillages.forEach(v => {
        const p = v.properties;
        let minDist = Infinity, nearestFactory = null;
        state.factories.forEach(f => {
            const point = v.geometry.type === 'Point' ? v : turf.centroid(v);
            const d = turf.distance(turf.point([f.lng, f.lat]), point, { units: 'kilometers' });
            if (d < minDist) { minDist = d; nearestFactory = f; }
        });

        p.rawDistance = minDist;
        p.nearestFactoryName = nearestFactory?.name || 'Pabrik';

        const maxDist = state.rangeMode === 'radius' ? state.radius : state.isochroneMin * 0.6; 
        p.normDist = Math.max(0, 1 - (minDist / maxDist));

        const skorNeed = p.skor_need || 0, skorIdm = p.skor_idm || 0, skorBranding = p.skor_branding || 0;
        
        // --- RUMUS BARU 4 KRITERIA ---
        p.score = (skorNeed * wN) + (skorIdm * wI) + (p.normDist * wD) + (skorBranding * wB);

        // --- UPDATE INSIGHT OTOMATIS ---
        const contributions = [
            { name: 'Kebutuhan Ekonomi Warga', val: skorNeed * wN },
            { name: 'Ketertinggalan Infrastruktur (IDM)', val: skorIdm * wI },
            { name: 'Akses/Jarak Sangat Dekat', val: p.normDist * wD },
            { name: 'Potensi Branding Strategis', val: skorBranding * wB }
        ].sort((a, b) => b.val - a.val);
        p.topReason = contributions[0].name;
    });

    state.filteredVillages.sort((a, b) => b.properties.score - a.properties.score);
}

// ══════════════════════════════════════════════════════════════
// RENDER UI & HASIL
// ══════════════════════════════════════════════════════════════
// ── FUNGSI HELPER: PEMOTONG DATA BERDASARKAN MODE RANKING ──
function getTopVillages() {
    let limit = state.filteredVillages.length;
    if (state.displayLimit !== 'all') limit = parseInt(state.displayLimit);

    // Jika Mode JATAH PER PABRIK (Pemerataan Lokal)
    if (state.rankingMode === 'local' && state.factories.length > 0) {
        let results = [];
        state.factories.forEach(f => {
            // Filter desa yang pabrik terdekatnya adalah pabrik 'f' ini, lalu ambil Top-nya
            const localVillages = state.filteredVillages
                .filter(v => v.properties.nearestFactoryName === f.name)
                .slice(0, limit);
            results.push(...localVillages);
        });
        // Gabungkan semua, dan urutkan ulang secara global agar tampilan di kartu tetap rapi dari skor tertinggi
        return results.sort((a, b) => b.properties.score - a.properties.score);
    } 
    
    // Jika Mode GLOBAL (Kompetisi Bebas Keseluruhan)
    return state.filteredVillages.slice(0, limit);
}

// ── FUNGSI UI: SWITCH MODE RANKING ──
function setRankingMode(mode) {
    state.rankingMode = mode;
    
    // Ubah tampilan tombol (nyala/mati)
    document.getElementById('btn-rank-global').classList.toggle('active', mode === 'global');
    document.getElementById('btn-rank-local').classList.toggle('active', mode === 'local');
    
    // Ubah teks penjelasan
    const descEl = document.getElementById('ranking-mode-desc');
    if (mode === 'global') {
        descEl.innerHTML = `<strong>Mode Global:</strong> Mencari desa dengan skor terbaik secara keseluruhan tanpa membedakan wilayah pabrik.`;
        descEl.style.backgroundColor = '#f3f4f6';
        descEl.style.borderColor = '#d1d5db';
    } else {
        const batas = state.displayLimit === 'all' ? 'semua' : state.displayLimit;
        descEl.innerHTML = `<strong>Mode Pemerataan:</strong> Sistem menjamin setiap lokasi pabrik mendapatkan alokasi maksimal <strong>${batas} desa</strong> terbaik di sekitarnya.`;
        descEl.style.backgroundColor = '#f0fdf4'; // Hijau pudar
        descEl.style.borderColor = '#bbf7d0';
    }
    
    // Render ulang UI peta dan daftar jika ada data
    if (state.filteredVillages.length > 0) {
        renderResults();
        highlightMapFeatures();
        applyMapVisuals(); // Pastikan ukuran lingkaran kembali sesuai
    }
}

function renderResults() {
    const container = document.getElementById('results-container'), panel = document.getElementById('result-panel');
    document.getElementById('empty-state').classList.add('hidden');
    container.classList.remove('hidden');
    panel.style.display = 'flex';
    if (panel.classList.contains('panel-hidden')) {
        panel.classList.remove('panel-hidden'); document.getElementById('toggle-icon').setAttribute('data-lucide', 'chevron-right'); setTimeout(() => map.resize(), 300);
    }
    
    // Render sesuai mode aktif
    if (state.viewMode === 'table') {
        container.classList.add('hidden');
        renderTable();
    } else {
        document.getElementById('table-container').classList.add('hidden');
        container.classList.remove('hidden');
        renderCards();
    }
}

function renderCards() {
    const container = document.getElementById('results-container');
    
    // 🌟 KUNCI UTAMA: Wajib menggunakan getTopVillages di sini juga!
    const topVillages = getTopVillages();

    // Update tulisan jumlah kandidat di atas
    document.getElementById('village-count').innerText = `${topVillages.length} Kandidat`;
    
    container.innerHTML = '';

    topVillages.forEach((v, index) => {
        const p = v.properties;
        const scorePct = (p.score * 100).toFixed(1), needPct = ((p.skor_need || 0) * 100).toFixed(0), idmPct = ((p.skor_idm || 0) * 100).toFixed(0), proximPct = ((p.normDist || 0) * 100).toFixed(0), brandPct = ((p.skor_branding || 0) * 100).toFixed(0), kpdPct = ((p.skor_kepadatan || 0) * 100).toFixed(0);
        const distanceLabel = state.rangeMode === 'isochrone' ? `Akses dlm ~${state.isochroneMin} mnt` : `${p.rawDistance.toFixed(1)} km`;

        const card = document.createElement('article');
        card.className = `result-card ${index === 0 ? 'priority' : ''}`;
        card.innerHTML = `
            ${index === 0 ? `<div class="badge-priority">PRIORITAS UTAMA</div>` : ''}
            <div class="card-header">
                <div class="card-title-group">
                    <h3>#${index + 1} ${p.DESA || p.name || 'Desa'}</h3>
                    <p class="card-subtitle"><i data-lucide="map-pin" style="width:12px; height:12px;"></i>${p.KECAMATAN ? `Kec. ${p.KECAMATAN} · ` : ''}${distanceLabel} ke <strong>${p.nearestFactoryName}</strong></p>
                    <p class="card-subtitle" style="margin-top:2px;"><i data-lucide="tag" style="width:12px; height:12px;"></i>SES: <strong>${p.SOCIOECONO || '-'}</strong></p>
                </div>
                <div class="card-score-group">
                    <span class="card-score">${scorePct}</span><span class="card-score-label">Skor MCDA</span>
                </div>
            </div>
            <div class="insight-box">
                <i data-lucide="lightbulb" style="width:16px; height:16px; flex-shrink:0;"></i><span>Diprioritaskan karena <strong>${p.topReason}</strong>.</span>
            </div>
            <div class="metrics-container">
                <div class="metric-row"><span class="metric-label">Need (Sosial)</span><div class="progress-bar"><div class="progress-fill" style="background:#ef4444; width:${needPct}%"></div></div></div>
                <div class="metric-row"><span class="metric-label">IDM</span><div class="progress-bar"><div class="progress-fill" style="background:#3b82f6; width:${idmPct}%"></div></div></div>
                <div class="metric-row"><span class="metric-label">Proximity</span><div class="progress-bar"><div class="progress-fill" style="background:#22c55e; width:${proximPct}%"></div></div></div>
                <div class="metric-row"><span class="metric-label">Branding</span><div class="progress-bar"><div class="progress-fill" style="background:#a855f7; width:${brandPct}%"></div></div></div>
                <div class="metric-row"><span class="metric-label">Kepadatan</span><div class="progress-bar"><div class="progress-fill" style="background:#f97316; width:${kpdPct}%"></div></div></div>
            </div>
        `;
        card.onclick = () => {
            const coords = v.geometry.type === 'Point' ? v.geometry.coordinates : turf.centroid(v).geometry.coordinates;
            map.flyTo({ center: coords, zoom: 14, pitch: 0 });
        };
        container.appendChild(card);
    });
    lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════
// FITUR TABEL PERBANDINGAN
// ══════════════════════════════════════════════════════════════

function getSesClass(ses) {
    if (!ses) return 'ses-default';
    const s = ses.toLowerCase();
    if (s.includes('bawah') && s.includes('menengah')) return 'ses-menengah-bawah';
    if (s.includes('bawah')) return 'ses-bawah';
    if (s.includes('atas') && s.includes('menengah')) return 'ses-menengah-atas';
    if (s.includes('atas')) return 'ses-atas';
    if (s.includes('menengah')) return 'ses-menengah';
    return 'ses-default';
}

function detectOverlapVillages() {
    // Desa yang masuk dalam jangkauan lebih dari satu pabrik sekaligus
    const overlapIds = new Set();
    if (state.factories.length < 2) return overlapIds;

    state.filteredVillages.forEach(v => {
        const point = v.geometry.type === 'Point' ? v : turf.centroid(v);
        let count = 0;
        state.factories.forEach(f => {
            const dist = turf.distance(turf.point([f.lng, f.lat]), point, { units: 'kilometers' });
            const threshold = state.rangeMode === 'radius' ? state.radius : state.isochroneMin * 0.6;
            if (dist <= threshold) count++;
        });
        if (count >= 2) overlapIds.add(v.properties.ID_DESA);
    });
    return overlapIds;
}

function renderTable() {
    const tableContainer = document.getElementById('table-container');
    const tbody = document.getElementById('table-body');
    tableContainer.classList.remove('hidden');

    // Deteksi overlap
    const overlapIds = detectOverlapVillages();
    const overlapCount = overlapIds.size;

    // Info overlap
    const overlapInfo = document.getElementById('overlap-info');
    const overlapText = document.getElementById('overlap-info-text');
    if (overlapCount > 0 && state.factories.length >= 2) {
        overlapInfo.style.display = 'flex';
        overlapInfo.style.alignItems = 'center';
        overlapInfo.style.gap = '5px';
        overlapText.innerText = `${overlapCount} desa (baris biru) masuk jangkauan 2+ pabrik — kandidat program CSR bersama.`;
    } else {
        overlapInfo.style.display = 'none';
    }

    // Filter & Potong Data
    let data;
    if (state.tableLimitFilter === 'kartu_rekomendasi') {
        // ★ DESA REKOMENDASI: sumber data identik dengan kartu rekomendasi.
        // getTopVillages() sudah menangani rankingMode global/lokal dan displayLimit,
        // sehingga jumlah baris tabel dijamin sama dengan jumlah kartu.
        data = getTopVillages();
    } else if (state.tableLimitFilter === 'recommendation') {
        // Mode lama "Hanya Top Rekomendasi" — potong ke displayLimit secara global
        const limit = state.displayLimit === 'all' ? state.filteredVillages.length : parseInt(state.displayLimit);
        data = state.filteredVillages.slice(0, limit);
    } else {
        // "Semua Desa di Jangkauan" — tampilkan seluruh desa dalam radius tanpa batas
        data = [...state.filteredVillages];
    }

    // Terapkan Filter SES
    if (state.tableSesFilter !== 'all') {
        data = data.filter(v => (v.properties.SOCIOECONO || '') === state.tableSesFilter);
    }

    // Tambahkan rank asli (sebelum sort tabel)
    data.forEach((v, i) => { v.properties._tableRank = i + 1; });

    // Sort
    const col = state.tableSortCol;
    const dir = state.tableSortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
        const pa = a.properties, pb = b.properties;
        if (col === 'rank')        return dir * (pa._tableRank - pb._tableRank);
        if (col === 'DESA')        return dir * (pa.DESA || '').localeCompare(pb.DESA || '');
        if (col === 'SOCIOECONO')  return dir * (pa.SOCIOECONO || '').localeCompare(pb.SOCIOECONO || '');
        if (col === 'KECAMATAN') return dir * (pa.KECAMATAN || '').localeCompare(pb.KECAMATAN || '');
        if (col === 'KABKOT') return dir * (pa.KABKOT || '').localeCompare(pb.KABKOT || '');
        if (col === 'score')       return dir * ((pa.score || 0) - (pb.score || 0));
        if (col === 'skor_need')   return dir * ((pa.skor_need || 0) - (pb.skor_need || 0));
        if (col === 'normDist')    return dir * ((pa.normDist || 0) - (pb.normDist || 0));
        if (col === 'skor_branding') return dir * ((pa.skor_branding || 0) - (pb.skor_branding || 0));
        return 0;
    });

    document.getElementById('village-count').innerText = `${data.length} Kandidat`;
    tbody.innerHTML = '';

    data.forEach((v, idx) => {
        const p = v.properties;
        const rank = p._tableRank;
        const isOverlap = overlapIds.has(p.ID_DESA);

        const needPct  = Math.round((p.skor_need || 0) * 100);
        const idmPct = Math.round((p.skor_idm || 0) * 100)
        const proxPct  = Math.round((p.normDist || 0) * 100);
        const brandPct = Math.round((p.skor_branding || 0) * 100);
        const totalPct = ((p.score || 0) * 100).toFixed(1);

        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
        const sesClass  = getSesClass(p.SOCIOECONO);
        const sesLabel  = p.SOCIOECONO || '-';

        // Tentukan label pabrik: overlap atau pabrik terdekat saja
        const factoryCell = isOverlap
            ? `<span class="overlap-badge">2+ Pabrik</span>`
            : `<span class="factory-badge" title="${p.nearestFactoryName}">${p.nearestFactoryName}</span>`;

        const tr = document.createElement('tr');
        if (isOverlap) tr.classList.add('row-overlap');
        tr.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${rank}</span></td>
            <td style="font-weight:500; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.DESA || ''}">${p.DESA || '-'}</td>
            <td style="max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.KECAMATAN || ''}">${p.KECAMATAN || '-'}</td>
            <td style="max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.KABKOT || ''}">${p.KABKOT || '-'}</td>
            <td>${factoryCell}</td>
            <td><div class="score-cell"><div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${needPct}%; background:#ef4444;"></div></div>${needPct}</div></td>
            <td><div class="score-cell"><div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${idmPct}%; background:#0ea5e9;"></div></div>${idmPct}</div></td>
            <td><div class="score-cell"><div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${proxPct}%; background:#22c55e;"></div></div>${proxPct}</div></td>
            <td><div class="score-cell"><div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${brandPct}%; background:#a855f7;"></div></div>${brandPct}</div></td>
            <td style="font-weight:600; color:#2563eb;">${totalPct}</td>
            <td><span class="ses-badge ${sesClass}">${sesLabel}</span></td>
        `;
        tr.onclick = () => {
            const coords = v.geometry.type === 'Point' ? v.geometry.coordinates : turf.centroid(v).geometry.coordinates;
            map.flyTo({ center: coords, zoom: 14, pitch: 0 });
        };
        tr.style.cursor = 'pointer';
        tbody.appendChild(tr);
    });

    // Update sort icon di header
    document.querySelectorAll('.th-sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col === state.tableSortCol) {
            th.classList.add(state.tableSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function setViewMode(mode) {
    state.viewMode = mode;
    document.getElementById('btn-view-card').classList.toggle('active', mode === 'card');
    document.getElementById('btn-view-table').classList.toggle('active', mode === 'table');
    document.getElementById('toolbar-card').style.display = mode === 'card' ? 'flex' : 'none';
    document.getElementById('toolbar-table').style.display = mode === 'table' ? 'flex' : 'none';
    lucide.createIcons();

    if (state.filteredVillages.length === 0) return;

    if (mode === 'card') {
        document.getElementById('table-container').classList.add('hidden');
        document.getElementById('results-container').classList.remove('hidden');
        renderCards();
    } else {
        document.getElementById('results-container').classList.add('hidden');
        renderTable();
    }
}

function exportCSV() {
    if (!state.filteredVillages.length) return;

    const overlapIds = detectOverlapVillages();
    // Gunakan sumber data yang sama dengan renderTable
    let data;
    if (state.tableLimitFilter === 'kartu_rekomendasi') {
        data = getTopVillages();
    } else if (state.tableLimitFilter === 'recommendation') {
        const limit = state.displayLimit === 'all' ? state.filteredVillages.length : parseInt(state.displayLimit);
        data = state.filteredVillages.slice(0, limit);
    } else {
        data = [...state.filteredVillages];
    }
    if (state.tableSesFilter !== 'all') {
        data = data.filter(v => (v.properties.SOCIOECONO || '') === state.tableSesFilter);
    }

    const headers = ['Rank','Desa','Kecamatan','Kabupaten','Pabrik Terdekat','Overlap 2+ Pabrik','Need Ekonomi (0-100)','Need Infrastruktur/IDM (0-100)','Proximity (0-100)','Branding (0-100)','Total MCDA','SES','Jarak (km)'];
    const rows = data.map((v, i) => {
        const p = v.properties;
        return [
            p._tableRank || (i + 1),
            p.DESA || '',
            p.KECAMATAN || '',
            p.KABKOT || '',
            p.nearestFactoryName || '',
            overlapIds.has(p.ID_DESA) ? 'Ya' : 'Tidak',
            Math.round((p.skor_need || 0) * 100),
            Math.round((p.normDist || 0) * 100),
            Math.round((p.skor_branding || 0) * 100),
            ((p.score || 0) * 100).toFixed(1),
            p.SOCIOECONO || '',
            (p.rawDistance || 0).toFixed(2)
        ].map(val => `"${val}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GeoCSR_Rekomendasi_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Export ke Excel (.xlsx) menggunakan SheetJS via CDN ──
function exportXLSX() {
    if (!state.filteredVillages.length) return;

    const _doExport = () => {
        const overlapIds = detectOverlapVillages();
        // Gunakan sumber data yang sama dengan renderTable
        let data;
        if (state.tableLimitFilter === 'kartu_rekomendasi') {
            data = getTopVillages();
        } else if (state.tableLimitFilter === 'recommendation') {
            const limit = state.displayLimit === 'all' ? state.filteredVillages.length : parseInt(state.displayLimit);
            data = state.filteredVillages.slice(0, limit);
        } else {
            data = [...state.filteredVillages];
        }
        if (state.tableSesFilter !== 'all') {
            data = data.filter(v => (v.properties.SOCIOECONO || '') === state.tableSesFilter);
        }

        // Baris header & data
        const wsData = [
            ['Rank','Desa','Kecamatan','Kabupaten','Pabrik Terdekat','Overlap 2+ Pabrik',
             'Need Ekonomi (0-100)','Need Infrastruktur/IDM (0-100)','Proximity (0-100)','Branding (0-100)','Total MCDA','SES','Jarak (km)']
        ];
        data.forEach((v, i) => {
            const p = v.properties;
            wsData.push([
                p._tableRank || (i + 1),
                p.DESA || '',
                p.KECAMATAN || '',
                p.KABKOT || '',
                p.nearestFactoryName || '',
                overlapIds.has(p.ID_DESA) ? 'Ya' : 'Tidak',
                Math.round((p.skor_need || 0) * 100),
                Math.round((p.normDist || 0) * 100),
                Math.round((p.skor_branding || 0) * 100),
                parseFloat(((p.score || 0) * 100).toFixed(1)),
                p.SOCIOECONO || '',
                parseFloat((p.rawDistance || 0).toFixed(2))
            ]);
        });

        const XLSX = window.XLSX;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Lebar kolom otomatis
        ws['!cols'] = wsData[0].map((_, ci) => ({
            wch: Math.max(...wsData.map(r => String(r[ci] ?? '').length), 8)
        }));

        XLSX.utils.book_append_sheet(wb, ws, 'Rekomendasi CSR');
        XLSX.writeFile(wb, `GeoCSR_Rekomendasi_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    // Muat SheetJS secara dinamis jika belum tersedia
    if (typeof window.XLSX === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = _doExport;
        script.onerror = () => alert('Gagal memuat library Excel. Coba export CSV sebagai alternatif.');
        document.head.appendChild(script);
    } else {
        _doExport();
    }
}

function highlightMapFeatures() {
    // 1. Bersihkan semua warna
    state.villages.features.forEach((_, idx) => {
        map.setFeatureState({ source: 'villages', id: idx }, { highlight: false, 'top-rank': false });
    });

    // 2. Beri warna KUNING ke SEMUA desa dalam radius
    state.filteredVillages.forEach(v => {
        const idx = state.villages.features.findIndex(f => f.properties.ID_DESA === v.properties.ID_DESA);
        if (idx !== -1) map.setFeatureState({ source: 'villages', id: idx }, { highlight: true });
    });

    // Menggunakan getTopVillages, bukan di-slice manual!
    const topVillages = getTopVillages();

    // 4. Beri warna HIJAU ('top-rank') & ANGKA HANYA ke desa rekomendasi terpilih
    const rankedFeatures = topVillages.map((v, index) => {
        const idx = state.villages.features.findIndex(f => f.properties.ID_DESA === v.properties.ID_DESA);
        if (idx !== -1) map.setFeatureState({ source: 'villages', id: idx }, { 'top-rank': true });
        
        return {
            type: "Feature",
            geometry: v.geometry.type === 'Point' ? v.geometry : turf.centroid(v).geometry,
            properties: { ...v.properties, rank: index + 1 } // Angka urutan 1, 2, 3...
        };
    });

    if (map.getSource('ranked-villages')) {
        map.getSource('ranked-villages').setData({ type: 'FeatureCollection', features: rankedFeatures });
    }

    if (state.filteredVillages.length > 0) map.fitBounds(turf.bbox(map.getSource('buffer')._data), { padding: 80, duration: 1000 });
}

function showEmptyState() {
    // ── Reset panel kanan ──
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('table-container').classList.add('hidden');
    document.getElementById('village-count').innerText = '0 Ditemukan';

    // ── Bersihkan semua highlight titik desa di peta ──
    if (state.villages && state.mapLoaded) {
        state.villages.features.forEach((_, idx) => {
            map.setFeatureState({ source: 'villages', id: idx }, { highlight: false, 'top-rank': false });
        });
    }

    // ── Bersihkan label angka ranking di atas titik hijau ──
    if (map.getSource('ranked-villages')) {
        map.getSource('ranked-villages').setData({ type: 'FeatureCollection', features: [] });
    }

    // ── Reset state filteredVillages ──
    state.filteredVillages = [];

    // ── Tutup panel kanan ──
    const panel = document.getElementById('result-panel');
    if (window.innerWidth >= 768 && !panel.classList.contains('panel-hidden')) {
        panel.classList.add('panel-hidden');
        document.getElementById('toggle-icon').setAttribute('data-lucide', 'chevron-left');
        setTimeout(() => map.resize(), 300);
    }

    // ── Sembunyikan legenda & kunci tab visual ──
    const legendBox = document.getElementById('analysis-legend');
    if (legendBox) legendBox.classList.add('hidden-legend');
    const placeholder = document.getElementById('visual-empty-state');
    const controls = document.getElementById('visual-controls-container');
    if (placeholder) placeholder.style.display = 'flex';
    if (controls) controls.style.display = 'none';
    state.isAnalyzed = false;
}
function updateLocationListUI() {
    const container = document.getElementById('location-list'); 
    container.innerHTML = '';
    state.factories.forEach(f => {
        const el = document.createElement('div'); el.className = 'location-item';
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                <span class="marker-pin" style="transform:none; box-shadow:none; background-color:${state.visuals.colors.factory};">
                    ${f.number}
                </span>
                <input type="text" value="${f.name}" class="location-input" onchange="renameFactory(${f.id}, this.value)" placeholder="Ketik nama lokasi...">
            </div>
            <button style="background:none; border:none; color:#ef4444; cursor:pointer;" onclick="removeFactoryLocation(${f.id})" title="Hapus">
                <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>`;
        container.appendChild(el);
    });
    lucide.createIcons();
}
function updateDynamicLegend() {
    const titleEl = document.getElementById('legend-editable-title'); 
    const areaEl = document.getElementById('legend-reach-text');
    
    if (!titleEl || !areaEl) return;

    // 1. Logika Nama Mode (Untuk Panel Kanan)
    let modeName = "Balanced";
    if (state.weights.need >= 50) modeName = "Kebutuhan Ekonomi";
    else if (state.weights.proximity >= 50) modeName = "Kedekatan";

    // Update judul legenda titik jika belum diedit manual oleh user
    if (!titleEl.hasAttribute('data-user-edited')) {
        titleEl.innerText = `Rekomendasi Desa (${modeName})`;
    }

    // 2. Update Teks Jangkauan
    if (state.rangeMode === 'radius') {
        areaEl.innerText = `Radius ${state.radius} Km`;
    } else {
        areaEl.innerText = `Isochrone ${state.isochroneMin} Menit`;
    }
}

// ══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════════════
document.getElementById('btn-add-location').addEventListener('click', (e) => {
    state.isAddingLocation = !state.isAddingLocation; const btn = e.currentTarget;
    if (state.isAddingLocation) { btn.classList.add('btn-adding'); btn.innerHTML = `<i data-lucide="mouse-pointer-click" style="width:16px; height:16px;"></i> Klik Di Mana Saja Pada Peta`; map.getCanvas().style.cursor = 'crosshair'; }
    else { btn.classList.remove('btn-adding'); btn.innerHTML = `<i data-lucide="crosshair" style="width:16px; height:16px;"></i> Klik Peta Untuk Tentukan Lokasi`; map.getCanvas().style.cursor = ''; }
    lucide.createIcons();
});

document.getElementById('btn-my-location').addEventListener('click', () => {
    if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition(pos => { addFactoryLocation(pos.coords.longitude, pos.coords.latitude); map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 }); }, () => alert('Gagal mendapatkan lokasi.'));
});

// ── Radius dropdown + custom input ──
document.getElementById('radius-select').addEventListener('change', e => {
    const val = e.target.value;
    const customWrap = document.getElementById('radius-custom-wrap');
    if (val === 'custom') {
        customWrap.style.display = 'block';
    } else {
        customWrap.style.display = 'none';
        state.radius = parseFloat(val);
        if (state.rangeMode === 'radius') runAnalysis();
    }
});
document.getElementById('radius-custom-input').addEventListener('change', e => {
    const val = parseFloat(e.target.value);
    if (val > 0) {
        state.radius = val;
        if (state.rangeMode === 'radius') runAnalysis();
    }
});

// ── Isochrone dropdown + custom input ──
document.getElementById('isochrone-select').addEventListener('change', e => {
    const val = e.target.value;
    const customWrap = document.getElementById('isochrone-custom-wrap');
    if (val === 'custom') {
        customWrap.style.display = 'block';
    } else {
        customWrap.style.display = 'none';
        state.isochroneMin = parseInt(val);
        if (state.rangeMode === 'isochrone') runAnalysis();
    }
});
document.getElementById('isochrone-custom-input').addEventListener('change', e => {
    const val = parseInt(e.target.value);
    if (val > 0) {
        state.isochroneMin = val;
        if (state.rangeMode === 'isochrone') runAnalysis();
    }
});

['need', 'idm', 'proximity', 'branding'].forEach(key => {
    const el = document.getElementById(`slider-${key}`); if (!el) return;
    el.addEventListener('input', e => {
        state.weights[key] = parseInt(e.target.value); const sum = Object.values(state.weights).reduce((a, b) => a + b, 0);
        ['need', 'proximity', 'branding'].forEach(k => { const v = document.getElementById(`val-${k}`); if (v) v.innerText = `${sum === 0 ? 0 : Math.round((state.weights[k] / sum) * 100)}%`; });
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active')); runAnalysis();
    });
});

// --- KODE BARU PENGGANTI (UPDATE 4 VARIABEL) ---
document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', e => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active')); 
        e.target.classList.add('active');
        
        const mode = e.target.dataset.preset;
        let w;

        // Logika baru untuk 4 variabel, ditulis menurun agar mudah diedit nanti
        if (mode === 'need') {
            w = { need: 40, idm: 40, proximity: 10, branding: 10 };
        } else if (mode === 'proximity') {
            w = { need: 15, idm: 15, proximity: 55, branding: 15 };
        } else {
            // Mode Balanced
            w = { need: 25, idm: 25, proximity: 25, branding: 25 };
        }

        Object.keys(w).forEach(k => { 
            state.weights[k] = w[k]; 
            const s = document.getElementById(`slider-${k}`); 
            const v = document.getElementById(`val-${k}`); 
            if (s) s.value = w[k]; 
            if (v) v.innerText = `${w[k]}%`; 
        });
        
        runAnalysis();
    });
});

document.getElementById('toggle-panel-btn').addEventListener('click', () => {
    const panel = document.getElementById('result-panel'); panel.classList.toggle('panel-hidden');
    document.getElementById('toggle-icon').setAttribute('data-lucide', panel.classList.contains('panel-hidden') ? 'chevron-left' : 'chevron-right');
    document.getElementById('map-legend').classList.toggle('shifted', panel.classList.contains('panel-hidden'));
    lucide.createIcons(); setTimeout(() => map.resize(), 300);
});


// ── Event Listener Dropdown Limit Rekomendasi ──
const cardLimitSelectEl = document.getElementById('card-limit-select');
if (cardLimitSelectEl) {
    cardLimitSelectEl.addEventListener('change', (e) => {
        state.displayLimit = e.target.value;
        if (state.factories.length > 0) {
            renderResults();
            highlightMapFeatures();
        }
    });
}

// ── Event Listener Sort Header Tabel ──
document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.tableSortCol === col) {
            state.tableSortDir = state.tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.tableSortCol = col;
            state.tableSortDir = col === 'rank' ? 'asc' : 'desc';
        }
        if (state.viewMode === 'table' && state.filteredVillages.length > 0) renderTable();
    });
});

// ── Event Listener Filter SES ──
const sesFilterEl = document.getElementById('ses-filter');
if (sesFilterEl) {
    sesFilterEl.addEventListener('change', (e) => {
        state.tableSesFilter = e.target.value;
        if (state.viewMode === 'table' && state.filteredVillages.length > 0) renderTable();
    });
}
// ── Event Listener Filter Top Rekomendasi (Tabel) ──
const tableLimitFilterEl = document.getElementById('table-limit-filter');
if (tableLimitFilterEl) {
    tableLimitFilterEl.addEventListener('change', (e) => {
        state.tableLimitFilter = e.target.value;
        if (state.viewMode === 'table' && state.filteredVillages.length > 0) renderTable();
    });
}

// ── Event Listener Export CSV ──
const exportCsvBtn = document.getElementById('btn-export-csv');
if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);

// ── Event Listener Export Excel ──
const exportXlsxBtn = document.getElementById('btn-export-xlsx');
if (exportXlsxBtn) exportXlsxBtn.addEventListener('click', exportXLSX);

// ── Event Listener Unduh Peta ──
const btnPng = document.getElementById('btn-download-png');
if (btnPng) btnPng.addEventListener('click', () => downloadMapAsPng());

const btnPdf = document.getElementById('btn-download-pdf');
if (btnPdf) btnPdf.addEventListener('click', () => downloadMapAsPdf());


// ── 5. Kontrol Legenda (Minimize & Edit Langsung) ──
const analysisLegendBox = document.getElementById('analysis-legend');
const legendToggleBtn = document.getElementById('legend-toggle-btn');
const allLegendLabels = document.querySelectorAll('.legend-label-text');

// A. Fungsi Minimize/Maximize
if (legendToggleBtn && analysisLegendBox) {
    legendToggleBtn.onclick = (e) => {
        e.stopPropagation();
        const isMinimized = analysisLegendBox.classList.toggle('minimized');
        const icon = document.getElementById('legend-toggle-icon');
        icon.setAttribute('data-lucide', isMinimized ? 'list' : 'chevron-down');
        lucide.createIcons();
    };
}

// B. Sensor Edit Langsung
if (allLegendLabels.length > 0) {
    allLegendLabels.forEach(label => {
        label.addEventListener('input', () => {
            // Jika user mengetik, tandai agar sistem tidak mengubah teks ini secara otomatis lagi
            label.setAttribute('data-user-edited', 'true');
        });
    });
}
// ══════════════════════════════════════════════════════════════
// LOGIKA TAB, PANEL BAWAH & VISUALISASI
// ══════════════════════════════════════════════════════════════

// 1. Ganti Tab Sidebar
function switchSidebarTab(tabName) {
    document.getElementById('btn-tab-analisis').classList.toggle('active', tabName === 'analisis');
    document.getElementById('btn-tab-visual').classList.toggle('active', tabName === 'visual');
    document.getElementById('content-analisis').style.display = tabName === 'analisis' ? 'flex' : 'none';
    document.getElementById('content-visual').style.display = tabName === 'visual' ? 'flex' : 'none';
}

// 4. Toggle Heatmap (Panel Bawah)
let isHeatmapOn = true;
function toggleHeatmap() {
    isHeatmapOn = !isHeatmapOn;
    const btn = document.getElementById('btn-toggle-heatmap');
    btn.classList.toggle('active', isHeatmapOn);
    btn.querySelector('.status-dot').className = `status-dot ${isHeatmapOn ? 'on' : 'off'}`;
    const currentOpacity = document.getElementById('heatmap-opacity').value / 100;
    map.setPaintProperty('villages-heat', 'heatmap-opacity', ['interpolate', ['linear'], ['zoom'], 8, (isHeatmapOn ? currentOpacity : 0), 10, 0]);
    document.getElementById('map-legend').style.display = isHeatmapOn ? 'block' : 'none';
}

// Slider Opacity Heatmap
document.getElementById('heatmap-opacity').addEventListener('input', (e) => {
    if (!isHeatmapOn) return;
    const opacity = e.target.value / 100;
    map.setPaintProperty('villages-heat', 'heatmap-opacity', ['interpolate', ['linear'], ['zoom'], 8, opacity, 10, 0]);
});

// ══════════════════════════════════════════════════════════════
// UNDUH PETA (PNG & PDF) — CANVAS HELPERS
// ══════════════════════════════════════════════════════════════

// 1. Pelukis Legenda Kanan (Auto-Wrap & Anti-Geser)
function _drawLegendOnCanvas(ctx, mapCanvas) {
    const legendEl = document.getElementById('analysis-legend');
    if (!legendEl || legendEl.classList.contains('hidden-legend') || legendEl.classList.contains('minimized')) return;

    const pixelRatio = mapCanvas.width / mapCanvas.clientWidth;

    const titleEl = document.getElementById('legend-editable-title');
    const titleText = titleEl ? titleEl.innerText : 'Rekomendasi Desa';
    const items = legendEl.querySelectorAll('.legend-item-row');

    const w = 180 * pixelRatio; 
    const px = 15 * pixelRatio; 
    const py = 15 * pixelRatio; 

    ctx.font = `bold ${Math.round(12 * pixelRatio)}px Inter, sans-serif`;
    const words = titleText.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < (w - (px * 2))) { currentLine += " " + word; } 
        else { lines.push(currentLine); currentLine = word; }
    }
    lines.push(currentLine);

    const lineHeight = 16 * pixelRatio;
    const titleHeight = lines.length * lineHeight;
    const dividerMargin = 15 * pixelRatio; 
    const itemHeight = 22 * pixelRatio;
    const itemsHeight = items.length * itemHeight;
    const h = py + titleHeight + dividerMargin + itemsHeight + py;

    // 🌟 KUNCI POSISI: Margin sudah diset lega agar tidak terpotong (45px dari kanan, 55px dari bawah)
    const marginRight = 45 * pixelRatio;  
    const marginBottom = 55 * pixelRatio; 
    
    const x = mapCanvas.width - w - marginRight;
    const y = mapCanvas.height - h - marginBottom;
    const r = 8 * pixelRatio; 

    ctx.save();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1 * pixelRatio;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let currentY = y + py;

    lines.forEach(line => {
        ctx.fillText(line, x + px, currentY);
        currentY += lineHeight;
    });

    currentY += (5 * pixelRatio);
    ctx.strokeStyle = '#e5e7eb'; 
    ctx.lineWidth = 1 * pixelRatio;
    ctx.beginPath(); 
    ctx.moveTo(x + px, currentY); 
    ctx.lineTo(x + w - px, currentY); 
    ctx.stroke();
    
    currentY += (10 * pixelRatio); 

    const dotSize = 12 * pixelRatio;
    
    items.forEach(row => {
        const dot = row.querySelector('.legend-dot, .legend-box-area');
        const text = row.querySelector('.legend-label-text');
        if (!dot || !text) return;

        if (dot.classList.contains('legend-box-area')) {
            ctx.strokeStyle = '#2563eb'; 
            ctx.lineWidth = 1.5 * pixelRatio;
            ctx.setLineDash([4 * pixelRatio, 3 * pixelRatio]);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(x + px, currentY, dotSize, dotSize);
            ctx.strokeRect(x + px, currentY, dotSize, dotSize);
            ctx.setLineDash([]);
        } else {
            const bg = dot.style.backgroundColor || '#888';
            let borderColor = '#fff';
            if (dot.classList.contains('dot-priority')) borderColor = '#065f46';
            else if (dot.classList.contains('dot-other')) borderColor = '#ca8a04';
            
            ctx.fillStyle = bg;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.5 * pixelRatio;
            ctx.beginPath();
            ctx.arc(x + px + dotSize/2, currentY + dotSize/2, dotSize/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = '#4b5563';
        ctx.font = `${Math.round(11 * pixelRatio)}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(text.innerText, x + px + dotSize + (8 * pixelRatio), currentY + dotSize/2);
        
        currentY += itemHeight; 
    });

    ctx.restore();
}

// 2. Pelukis Pabrik
function _drawFactoriesOnCanvas(ctx, mapCanvas) {
    const pixelRatio = mapCanvas.width / mapCanvas.clientWidth;
    
    state.factories.forEach(f => {
        const pos = map.project([f.lng, f.lat]);
        const cx = pos.x * pixelRatio;
        const cy = pos.y * pixelRatio;
        
        const size = state.visuals.sizes.factory * pixelRatio;
        const radius = size / 2;
        
        ctx.save();
        ctx.globalAlpha = state.visuals.opacities.factory;
        
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = state.visuals.colors.factory;
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.round(size * 0.42);
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillText(f.number, cx, cy + (pixelRatio * 0.5)); 
        
        ctx.restore();
    });
}

// 3. Pelukis Heatmap (Kiri Bawah)
function _drawHeatmapLegendOnCanvas(ctx, mapCanvas) {
    const legendEl = document.getElementById('map-legend');
    if (!legendEl || legendEl.style.display === 'none') return;

    const pixelRatio = mapCanvas.width / mapCanvas.clientWidth;
    const w = 160 * pixelRatio; 
    const h = 45 * pixelRatio;
    const x = 20 * pixelRatio; 
    const y = mapCanvas.height - h - (20 * pixelRatio); 
    const r = 6 * pixelRatio; 

    ctx.save();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1 * pixelRatio;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titleSize = Math.round(10.5 * pixelRatio); 
    ctx.font = `bold ${titleSize}px Inter, sans-serif`;
    ctx.fillText('Konsentrasi sebaran desa', x + (10 * pixelRatio), y + (8 * pixelRatio));

    ctx.fillStyle = '#4b5563';
    const labelSize = Math.round(9 * pixelRatio);
    ctx.font = `${labelSize}px Inter, sans-serif`;
    ctx.fillText('Rendah', x + (10 * pixelRatio), y + (26 * pixelRatio));
    
    ctx.textAlign = 'right';
    ctx.fillText('Tinggi', x + w - (10 * pixelRatio), y + (26 * pixelRatio));

    const barX = x + (50 * pixelRatio); 
    const barY = y + (28 * pixelRatio);
    const barW = w - (100 * pixelRatio);
    const barH = 5 * pixelRatio;

    const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    gradient.addColorStop(0, '#bfdbfe'); 
    gradient.addColorStop(0.5, '#fef08a'); 
    gradient.addColorStop(1, '#ef4444'); 

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(barX, barY + barH/2, barH/2, Math.PI/2, Math.PI*1.5);
    ctx.lineTo(barX + barW, barY);
    ctx.arc(barX + barW, barY + barH/2, barH/2, -Math.PI/2, Math.PI/2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

// 4. Pelukis Arah Utara
function _drawNorthArrowOnCanvas(ctx, mapCanvas) {
    const pixelRatio = mapCanvas.width / mapCanvas.clientWidth;
    
    // Posisi di Pojok Kanan Atas
    const cx = mapCanvas.width - (45 * pixelRatio); 
    const cy = 65 * pixelRatio; 
    const size = 26 * pixelRatio; // Radius kompas
    
    // Logika Rotasi Dinamis
    const bearing = map.getBearing();
    const angleInRadians = -bearing * (Math.PI / 180);

    ctx.save();
    
    // 1. Gambar Lingkaran Latar Belakang
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'; 
    ctx.fill();
    ctx.lineWidth = 1.5 * pixelRatio;
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    // Pindahkan poros ke tengah lingkaran, lalu putar
    ctx.translate(cx, cy);
    ctx.rotate(angleInRadians);

    // 2. Gambar Panah (Siluet Hitam Flat)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);           // Titik ujung atas
    ctx.lineTo(size * 0.4, size * 0.5);   // Tarik ke kanan bawah
    ctx.lineTo(0, size * 0.2);            // Lekukan tengah bawah
    ctx.lineTo(-size * 0.4, size * 0.5);  // Tarik ke kiri bawah
    ctx.closePath();
    
    ctx.fillStyle = '#1f2937'; // Warna panah hitam pekat/abu gelap
    ctx.fill();
    
    // 3. Tambahkan Huruf 'U' 
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const fontSize = Math.round(14 * pixelRatio);
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    ctx.fillText('U', 0, -size * 0.8);

    ctx.restore();
}

// 5. FUNGSI UNDUH PNG 
function downloadMapAsPng() {
    const statusEl = document.getElementById('download-status');
    if (statusEl) { statusEl.style.display = 'block'; lucide.createIcons(); }

    const panel = document.getElementById('result-panel');
    let delayWaktu = 0;

    if (window.innerWidth >= 768 && !panel.classList.contains('panel-hidden')) {
        panel.classList.add('panel-hidden');
        document.getElementById('toggle-icon').setAttribute('data-lucide', 'chevron-left');
        lucide.createIcons();
        delayWaktu = 350; 
    }

    setTimeout(() => {
        map.resize(); 
        setTimeout(() => { 
            map.once('render', () => {
                try {
                    const mapCanvas = map.getCanvas();
                    const out = document.createElement('canvas');
                    out.width  = mapCanvas.width;
                    out.height = mapCanvas.height;
                    const ctx  = out.getContext('2d');
                    ctx.drawImage(mapCanvas, 0, 0);
                    
                    _drawFactoriesOnCanvas(ctx, mapCanvas); 
                    _drawLegendOnCanvas(ctx, mapCanvas);
                    _drawNorthArrowOnCanvas(ctx, mapCanvas);
                    _drawHeatmapLegendOnCanvas(ctx, mapCanvas);

                    const a = document.createElement('a');
                    a.href = out.toDataURL('image/png');
                    a.download = `GeoCSR_Peta_${new Date().toISOString().slice(0,10)}.png`;
                    a.click();
                } catch(e) {
                    alert('Gagal mengunduh peta: ' + e.message);
                } finally {
                    if (statusEl) statusEl.style.display = 'none';
                }
            });
            map.triggerRepaint();
        }, 100);
    }, delayWaktu);
}

// 6. FUNGSI UNDUH PDF 
function downloadMapAsPdf() {
    const statusEl = document.getElementById('download-status');
    if (statusEl) { statusEl.style.display = 'block'; lucide.createIcons(); }

    const panel = document.getElementById('result-panel');
    let delayWaktu = 0;

    if (window.innerWidth >= 768 && !panel.classList.contains('panel-hidden')) {
        panel.classList.add('panel-hidden');
        document.getElementById('toggle-icon').setAttribute('data-lucide', 'chevron-left');
        lucide.createIcons();
        delayWaktu = 350; 
    }

    setTimeout(() => {
        map.resize();
        setTimeout(() => {
            map.once('render', () => {
                try {
                    const mapCanvas = map.getCanvas();
                    const out = document.createElement('canvas');
                    out.width  = mapCanvas.width;
                    out.height = mapCanvas.height;
                    const ctx  = out.getContext('2d');
                    ctx.drawImage(mapCanvas, 0, 0);
                    
                    _drawFactoriesOnCanvas(ctx, mapCanvas); 
                    _drawLegendOnCanvas(ctx, mapCanvas);
                    _drawNorthArrowOnCanvas(ctx, mapCanvas);
                    _drawHeatmapLegendOnCanvas(ctx, mapCanvas);

                    const imgData = out.toDataURL('image/png');
                    const w = out.width, h = out.height;
                    const orientation = w > h ? 'landscape' : 'portrait'; 

                    const _doGenerate = () => _generatePdf(imgData, w, h, orientation);

                    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
                        const script = document.createElement('script');
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                        script.onload = _doGenerate;
                        script.onerror = () => {
                            alert('Gagal memuat library PDF. Coba unduh sebagai PNG.');
                            if (statusEl) statusEl.style.display = 'none';
                        };
                        document.head.appendChild(script);
                    } else {
                        _doGenerate();
                    }
                } catch(e) {
                    alert('Gagal membuat PDF: ' + e.message);
                    if (statusEl) statusEl.style.display = 'none';
                }
            });
            map.triggerRepaint();
        }, 100);
    }, delayWaktu);
}

function _generatePdf(imgData, imgW, imgH, orientation) {
    const statusEl = document.getElementById('download-status');
    try {
        const { jsPDF } = window.jspdf || window;
        const pdf = new jsPDF({ orientation, unit: 'px', format: [imgW, imgH] });
        pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        pdf.text(`GeoCSR — Peta Prioritas CSR  |  ${new Date().toLocaleDateString('id-ID')}`, 12, 14);
        pdf.save(`GeoCSR_Peta_${new Date().toISOString().slice(0,10)}.pdf`);
    } finally {
        if (statusEl) statusEl.style.display = 'none';
    }
}
// ══════════════════════════════════════════════════════════════
// FUNGSI TERAPKAN VISUALISASI KUSTOM
// ══════════════════════════════════════════════════════════════
function applyMapVisuals() {
    if (!map.getLayer('villages-point')) return;

    const { priority, other } = state.visuals.colors;
    const prioSize  = Math.max(6, state.visuals.sizes.priority);   // minimum 6 map units
    const otherSize = Math.max(4, state.visuals.sizes.other);      // minimum 4 map units

    // 1. WARNA — fill = stroke (tidak ada border berbeda)
    map.setPaintProperty('villages-point', 'circle-color', [
        'case',
        ['boolean', ['feature-state', 'top-rank'], false], priority,
        ['boolean', ['feature-state', 'highlight'], false], other,
        '#ffffff'
    ]);
    map.setPaintProperty('villages-point', 'circle-stroke-color', [
        'case',
        ['boolean', ['feature-state', 'top-rank'], false], priority,
        ['boolean', ['feature-state', 'highlight'], false], other,
        '#64748b'
    ]);
    // Hapus stroke sepenuhnya (width = 0)
    map.setPaintProperty('villages-point', 'circle-stroke-width', 0);

    // 2. OPACITY
    map.setPaintProperty('villages-point', 'circle-opacity', [
        'case',
        ['boolean', ['feature-state', 'top-rank'], false], state.visuals.opacities.priority,
        ['boolean', ['feature-state', 'highlight'], false], state.visuals.opacities.other,
        0
    ]);
    map.setPaintProperty('villages-point', 'circle-stroke-opacity', 0);

    // 3. UKURAN PETA — berlaku langsung, tidak tergantung zoom (pakai literal agar responsif)
    map.setPaintProperty('villages-point', 'circle-radius', [
        'case',
        ['boolean', ['feature-state', 'top-rank'], false], prioSize,
        ['boolean', ['feature-state', 'highlight'], false], otherSize,
        0
    ]);

    // 4. TEXT SIZE label angka di titik prioritas — proporsional dengan ukuran titik
    if (map.getLayer('ranked-villages-label')) {
        const labelSize = Math.max(8, Math.round(prioSize * 0.85));
        map.setLayoutProperty('ranked-villages-label', 'text-size', labelSize);
        // Hapus halo (stroke teks) agar tidak ada border efek
        map.setPaintProperty('ranked-villages-label', 'text-halo-width', 0);
        map.setPaintProperty('ranked-villages-label', 'text-color', '#ffffff');
    }

    // 5. PIN PABRIK — gunakan styleMarkerElement untuk konsistensi
    state.factories.forEach(f => {
        styleMarkerElement(
            f.marker.getElement(),
            state.visuals.sizes.factory,
            state.visuals.colors.factory,
            state.visuals.opacities.factory
        );
    });

    // 6. LEGENDA — update warna & ukuran ikon
    const updateLegendDot = (selector, key) => {
        const dot = document.querySelector(selector);
        if (!dot) return;
        dot.style.backgroundColor = state.visuals.colors[key];
        dot.style.opacity = state.visuals.opacities[key];
        // Factory: skala berbasis px; desa: skala berbasis map units (x2 agar terlihat)
        const rawSize = state.visuals.sizes[key];
        const dotPx = key === 'factory'
            ? Math.max(12, rawSize * 0.55)
            : Math.max(8,  rawSize * 2);
        dot.style.width  = `${dotPx}px`;
        dot.style.height = `${dotPx}px`;
        dot.style.borderRadius = '50%';
        dot.style.border = 'none';
    };
    updateLegendDot('.dot-factory', 'factory');
    updateLegendDot('.dot-priority', 'priority');
    updateLegendDot('.dot-other', 'other');

    // 7. PIN SIDEBAR (daftar lokasi)
    updateLocationListUI();
}

// ══════════════════════════════════════════════════════════════
// EVENT LISTENERS — KONTROL VISUAL PETA
// ══════════════════════════════════════════════════════════════
const visualInputs = [
    { id: 'color-factory', type: 'colors', key: 'factory' },
    { id: 'color-priority', type: 'colors', key: 'priority' },
    { id: 'color-other', type: 'colors', key: 'other' },
    { id: 'opacity-factory', type: 'opacities', key: 'factory', isSlider: true },
    { id: 'opacity-priority', type: 'opacities', key: 'priority', isSlider: true },
    { id: 'opacity-other', type: 'opacities', key: 'other', isSlider: true },
    { id: 'size-factory', type: 'sizes', key: 'factory', isSlider: true },
    { id: 'size-priority', type: 'sizes', key: 'priority', isSlider: true },
    { id: 'size-other', type: 'sizes', key: 'other', isSlider: true }
];

visualInputs.forEach(input => {
    const el = document.getElementById(input.id);
    if(el) {
        el.addEventListener('input', (e) => {
            const val = input.isSlider && input.type === 'opacities' ? e.target.value / 100 : 
                        input.isSlider && input.type === 'sizes' ? parseInt(e.target.value) : 
                        e.target.value;
            state.visuals[input.type][input.key] = val;
            applyMapVisuals();
        });
    }
});