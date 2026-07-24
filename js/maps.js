// ======================
// INIT MAP
// ======================

const map = L.map('map', { zoomControl: false }).setView([-7.9666, 112.6326], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// ======================
// CUSTOM HALTE ICON
// ======================

const halteIcon = L.icon({
    iconUrl: './assets/img/bus-stop.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -30],
    className: 'halte-icon'
});

// ======================
// GLOBAL STATE
// ======================

let halteDataGlobal       = null;
// REVISI 8: jalur dipisah 2 arah (dulu 1 file gabungan → jalurDataGlobal)
let jalurPergiData        = null; // Batu → Hamid Rusdi
let jalurPulangData       = null; // Hamid Rusdi → Batu
let halteLayerGroup       = null;
let userMarker            = null;
let originMarker          = null;
let destMarker             = null;
let currentLat            = null;
let currentLng            = null;
let selectedOriginLatLng  = null;
let selectedDestLatLng    = null;
let activeRouteLayers     = [];
let activeWeightScheme    = 'sama-rata';
let selectedPriorityKey   = 'waktu';
let namaAsal              = '';
let namaTujuan            = '';
let isPinMapMode          = false;
// REVISI 7: mode pin untuk asal atau tujuan
let pinMapTarget          = 'dest'; // 'origin' atau 'dest'

// ======================
// PANEL STACK
// ======================

const PANELS = {
    route       : document.getElementById('routePanel'),
    prioritas   : document.getElementById('prioritasPanel'),
    rekomendasi : document.getElementById('rekomendasiPanel'),
    detail      : document.getElementById('detailPanel'),
};

const searchBox = document.getElementById('searchBox');

function showPanel(name) {
    Object.entries(PANELS).forEach(([k, el]) => {
        if (!el) return;
        el.classList.remove('active', 'peek');
        if (k === name) el.classList.add('active');
    });
    searchBox.classList.toggle('hide', !!name);
}

function hideAllPanels() {
    Object.values(PANELS).forEach(el => {
        if (el) el.classList.remove('active', 'peek');
    });
    searchBox.classList.remove('hide');
    clearRouteLayers();
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker)   { map.removeLayer(destMarker);   destMarker = null; }
    const bar = document.getElementById('routeInfoBar');
    if (bar) bar.remove();
    hideHalteLayer();
}

function clearRouteLayers() {
    activeRouteLayers.forEach(l => map.removeLayer(l));
    activeRouteLayers = [];
}

// ======================
// DRAGGABLE BOTTOM SHEET
// REVISI 5: Lebih mudah ditutup/dibuka — tap area diperluas,
//           threshold drag diperkecil, dan ada tombol tutup/buka
// ======================

function initDraggableSheet(panel) {
    if (!panel || panel._dragInited) return;
    panel._dragInited = true;

    let startY = 0;
    let dragging = false;

    function onStart(clientY) {
        dragging = true;
        startY = clientY;
        panel.classList.add('dragging');
    }

    function onMove(clientY) {
        if (!dragging) return;
        const delta = clientY - startY;
        if (delta < 0) return;
        const h = panel.offsetHeight;
        const clampedDelta = Math.min(delta, h);
        panel.style.transform = `translateX(-50%) translateY(${clampedDelta}px)`;
    }

    function onEnd(clientY) {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragging');
        panel.style.transform = '';

        const delta = clientY - startY;
        // REVISI 5: threshold diperkecil dari 80 → 50px agar lebih mudah
        if (delta > 50) {
            panel.classList.remove('active');
            panel.classList.add('peek');
        } else {
            panel.classList.add('active');
            panel.classList.remove('peek');
        }
    }

    panel.addEventListener('touchstart', e => {
        // REVISI 5: seluruh panel-header bisa dipakai drag, bukan hanya handle
        if (e.target.closest('.sheet-handle') || e.target.closest('.panel-header')) {
            onStart(e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
        if (dragging) onMove(e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', e => {
        if (dragging) onEnd(e.changedTouches[0].clientY);
    });

    panel.addEventListener('mousedown', e => {
        if (e.target.closest('.sheet-handle') || e.target.closest('.panel-header')) {
            onStart(e.clientY);
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', e => {
        if (dragging) onMove(e.clientY);
    });

    window.addEventListener('mouseup', e => {
        if (dragging) onEnd(e.clientY);
    });

    // REVISI 5: Tap di peek area (handle + panel-header) langsung expand
    panel.addEventListener('click', e => {
        if (panel.classList.contains('peek')) {
            if (!e.target.closest('button, input, a, select')) {
                panel.classList.remove('peek');
                panel.classList.add('active');
            }
        }
    });
}

initDraggableSheet(PANELS.route);

function setupDynamicPanel(panel, innerHTML) {
    panel.innerHTML = '<div class="sheet-handle"></div>' + innerHTML;
    initDraggableSheet(panel);
}

// ======================
// BOBOT SKEMA
// REVISI 6: Skema 3 "Efisiensi Karbon" diubah:
//   emisi 40%, biaya 30%, waktu 15%, jarak 15%
// ======================

const BOBOT = {
    'sama-rata' : { biaya: 0.25, jarak: 0.25, waktu: 0.25, emisi: 0.25 },
    'prioritas' : {
        biaya : { biaya: 0.40, jarak: 0.20, waktu: 0.20, emisi: 0.20 },
        jarak : { biaya: 0.20, jarak: 0.40, waktu: 0.20, emisi: 0.20 },
        waktu : { biaya: 0.20, jarak: 0.20, waktu: 0.40, emisi: 0.20 },
        emisi : { biaya: 0.20, jarak: 0.20, waktu: 0.20, emisi: 0.40 }
    },
    // REVISI 6: emisi 40%, biaya 30%, waktu 15%, jarak 15%
    'karbon'    : { biaya: 0.30, jarak: 0.15, waktu: 0.15, emisi: 0.40 }
};

// ======================
// DATA KENDARAAN
// ======================

const HARGA_BBM      = 13000;
const KONSUMSI_MOTOR = 40;    // km/liter
const KONSUMSI_MOBIL = 12;    // km/liter

// Ambang batas jarak (meter): di bawah nilai ini → jalan kaki, di atasnya → kendaraan
const JARAK_JALAN_KAKI_M = 1000; // 1 km

const KECEPATAN_JALAN_KAKI_KMJAM = 5;

const KENDARAAN = [
    {
        id             : 'motor',
        nama           : 'Motor',
        faIcon         : 'fa-solid fa-motorcycle',
        emisiPerKm     : 0.103,
        kecepatanKmJam : 35,
        hitungBiaya    : (km) => Math.ceil((km / KONSUMSI_MOTOR) * HARGA_BBM),
        deskripsi      : 'Waktu paling cepat'
    },
    {
        id             : 'mobil',
        nama           : 'Mobil',
        faIcon         : 'fa-solid fa-car',
        emisiPerKm     : 0.192,
        kecepatanKmJam : 30,
        hitungBiaya    : (km) => Math.ceil((km / KONSUMSI_MOBIL) * HARGA_BBM),
        deskripsi      : 'Kenyamanan lebih'
    },
    {
        id             : 'bus',
        nama           : 'Bus TransJatim',
        faIcon         : 'fa-solid fa-bus',
        emisiPerKm     : 0.089,
        kecepatanKmJam : 25,
        hitungBiaya    : () => 5000,
        deskripsi      : 'Biaya paling rendah'
    }
];

// ======================
// LOAD DATA
// ======================

fetch('./assets/data/geojson/Halte_K1_Malang.geojson')
    .then(r => r.json())
    .then(data => {
        halteDataGlobal = data;
        halteLayerGroup = L.layerGroup(
            data.features.map(f => {
                const [lng, lat] = f.geometry.coordinates;
                const marker = L.marker([lat, lng], { icon: halteIcon });
                const p = f.properties;
                marker.bindPopup(
                    `<div class="popup-card">
                        <div class="popup-title">${p["Nama Halte"]}</div>
                        <div class="popup-address">${p["Alamat"] || ''}</div>
                    </div>`
                );
                return marker;
            })
        );
        const tempLayer = L.geoJSON(data);
        map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] });
    })
    .catch(e => console.warn('ERROR LOAD HALTE:', e));

// REVISI 8: jalur sekarang 2 file terpisah (arah pergi & pulang)
// dulu: fetch('./assets/data/geojson/Jalur_K1_Malang.geojson')
Promise.all([
    fetch('./assets/data/geojson/JALUR_K1_BATU-HAMIDRUSDI_1.geojson').then(r => r.json()),
    fetch('./assets/data/geojson/JALUR_K1_HAMIDRUSDI-BATU_1.geojson').then(r => r.json())
])
    .then(([dataPergi, dataPulang]) => {
        jalurPergiData  = dataPergi;   // Batu → Hamid Rusdi
        jalurPulangData = dataPulang;  // Hamid Rusdi → Batu
    })
    .catch(e => console.warn('ERROR LOAD JALUR:', e));

function showHalteLayer() {
    if (halteLayerGroup && !map.hasLayer(halteLayerGroup)) {
        halteLayerGroup.addTo(map);
    }
}

function hideHalteLayer() {
    if (halteLayerGroup && map.hasLayer(halteLayerGroup)) {
        map.removeLayer(halteLayerGroup);
    }
}

// ======================
// PANEL CONTROL
// ======================

const searchInput = document.querySelector('.search-box input');
if (searchInput) searchInput.addEventListener('click', () => showPanel('route'));

const closeBtn = document.getElementById('closePanel');
if (closeBtn) closeBtn.addEventListener('click', () => hideAllPanels());

// ======================
// WEIGHT CARD LOGIC
// ======================

document.querySelectorAll('.weight-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.weight-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const label = card.querySelector('span')?.textContent?.trim() || '';
        if      (label === 'Sama Rata')    activeWeightScheme = 'sama-rata';
        else if (label === 'Prioritas')    activeWeightScheme = 'prioritas';
        else if (label.includes('Karbon')) activeWeightScheme = 'karbon';
    });
});

// ======================
// LIVE LOCATION
// ======================

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        pos => {
            currentLat = pos.coords.latitude;
            currentLng = pos.coords.longitude;
            if (userMarker) map.removeLayer(userMarker);
            const pulseIcon = L.divIcon({
                className: '',
                html: '<div class="gps-pulse-wrap"><div class="gps-pulse-ring"></div><div class="gps-dot"></div></div>',
                iconSize: [36, 36], iconAnchor: [18, 18]
            });
            userMarker = L.marker([currentLat, currentLng], { icon: pulseIcon, zIndexOffset: 1000 }).addTo(map);
        },
        err => console.warn(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

const liveBtn = document.getElementById('liveLocationBtn');
if (liveBtn) {
    liveBtn.addEventListener('click', () => {
        if (currentLat === null) { alert('Lokasi GPS belum siap.'); return; }
        map.flyTo([currentLat, currentLng], 17, { animate: true, duration: 1.5 });
        showPanel('route');
        document.getElementById('lokasiInput').value = 'Lokasi Saya';
        selectedOriginLatLng = { lat: currentLat, lng: currentLng };
        namaAsal = 'Lokasi Saya';
    });
}

// ======================
// PIN FROM MAP — REVISI 7
// Sekarang bisa untuk ASAL dan TUJUAN
// ======================

const pinMapBtnAsal    = document.getElementById('pinMapBtnAsal');
const pinMapBtn        = document.getElementById('pinMapBtn');
const pinMapOverlay    = document.getElementById('pinMapOverlay');
const pinMapConfirmBtn = document.getElementById('pinMapConfirmBtn');
const pinMapLabel      = document.getElementById('pinMapLabel');

function enterPinMapMode(target) {
    // target: 'origin' atau 'dest'
    pinMapTarget = target;
    isPinMapMode = true;

    // Update label sesuai target
    if (pinMapLabel) {
        pinMapLabel.textContent = target === 'origin'
            ? 'Geser peta, pilih lokasi ASAL'
            : 'Geser peta, pilih lokasi TUJUAN';
    }

    if (pinMapBtnAsal) pinMapBtnAsal.classList.toggle('active', target === 'origin');
    if (pinMapBtn)     pinMapBtn.classList.toggle('active', target === 'dest');
    if (pinMapOverlay) pinMapOverlay.classList.add('active');
    PANELS.route.classList.remove('active');
    PANELS.route.classList.add('peek');
    searchBox.classList.add('hide');
}

function exitPinMapMode() {
    isPinMapMode = false;
    if (pinMapBtnAsal) pinMapBtnAsal.classList.remove('active');
    if (pinMapBtn)     pinMapBtn.classList.remove('active');
    if (pinMapOverlay) pinMapOverlay.classList.remove('active');
    if (PANELS.route) {
        PANELS.route.classList.remove('peek');
        PANELS.route.classList.add('active');
    }
    if (searchBox) searchBox.classList.remove('hide');
}

// Tombol pin asal
if (pinMapBtnAsal) {
    pinMapBtnAsal.addEventListener('click', () => {
        if (isPinMapMode && pinMapTarget === 'origin') {
            exitPinMapMode();
        } else {
            enterPinMapMode('origin');
        }
    });
}

// Tombol pin tujuan
if (pinMapBtn) {
    pinMapBtn.addEventListener('click', () => {
        if (isPinMapMode && pinMapTarget === 'dest') {
            exitPinMapMode();
        } else {
            enterPinMapMode('dest');
        }
    });
}

// Konfirmasi pilih lokasi dari peta
if (pinMapConfirmBtn) {
    pinMapConfirmBtn.addEventListener('click', () => {
        const center = map.getCenter();

        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${center.lat}&lon=${center.lng}&format=json&accept-language=id`)
            .then(r => r.json())
            .then(data => {
                const name = (data.address?.road || data.address?.suburb || data.display_name || '').split(',')[0].trim();
                const namaLokasi = name || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;

                if (pinMapTarget === 'origin') {
                    selectedOriginLatLng = { lat: center.lat, lng: center.lng };
                    namaAsal = namaLokasi;
                    document.getElementById('lokasiInput').value = namaLokasi;
                } else {
                    selectedDestLatLng = { lat: center.lat, lng: center.lng };
                    namaTujuan = namaLokasi;
                    document.getElementById('tujuanInput').value = namaLokasi;
                }
            })
            .catch(() => {
                const namaLokasi = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
                if (pinMapTarget === 'origin') {
                    selectedOriginLatLng = { lat: center.lat, lng: center.lng };
                    namaAsal = namaLokasi;
                    document.getElementById('lokasiInput').value = namaLokasi;
                } else {
                    selectedDestLatLng = { lat: center.lat, lng: center.lng };
                    namaTujuan = namaLokasi;
                    document.getElementById('tujuanInput').value = namaLokasi;
                }
            });

        exitPinMapMode();
    });
}

// ======================
// HAVERSINE (meter)
// ======================

function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ======================
// AUTOCOMPLETE
// ======================

let searchTimer = null;

function cariLokasi(keyword, callback) {
    clearTimeout(searchTimer);
    const val = (keyword || '').trim();
    if (val.length < 2 || val === 'Lokasi Saya') { callback([]); return; }

    searchTimer = setTimeout(() => {
        const viewbox  = '112.40,-8.20,112.85,-7.75';
        const qMalang  = encodeURIComponent(val + ' Malang');

        const urlNominatim =
            'https://nominatim.openstreetmap.org/search?' +
            'q=' + qMalang +
            '&format=json&limit=8&addressdetails=1&accept-language=id' +
            '&viewbox=' + viewbox + '&bounded=0';

        const urlPhoton =
            'https://photon.komoot.io/api/?' +
            'q=' + encodeURIComponent(val) +
            '&limit=8&lang=id' +
            '&bbox=112.40,-8.20,112.85,-7.75' +
            '&lat=-7.9797&lon=112.6304';

        const fetchNom = fetch(urlNominatim, { headers: { 'Accept-Language': 'id' } })
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data)) return [];
                return data.map(item => ({
                    name    : (item.display_name || '').split(',')[0].trim(),
                    subtitle: buatSubtitleNominatim(item),
                    lat     : parseFloat(item.lat),
                    lng     : parseFloat(item.lon),
                }));
            })
            .catch(() => []);

        const fetchPhoton = fetch(urlPhoton)
            .then(r => r.json())
            .then(data => {
                if (!data || !Array.isArray(data.features)) return [];
                return data.features
                    .filter(f => {
                        const [lon, lat] = f.geometry.coordinates;
                        return lat >= -8.20 && lat <= -7.75 && lon >= 112.40 && lon <= 112.85;
                    })
                    .map(f => {
                        const p        = f.properties;
                        const name     = p.name || p.street || p.city || '';
                        const subtitle = [p.street, p.district || p.suburb, p.city].filter(Boolean).join(', ');
                        return { name, subtitle, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
                    })
                    .filter(f => f.name);
            })
            .catch(() => []);

        Promise.all([fetchNom, fetchPhoton]).then(([resNom, resPhoton]) => {
            const seen   = new Set();
            const merged = [];
            [...resNom, ...resPhoton].forEach(item => {
                const key = item.name.toLowerCase().trim();
                if (!key || seen.has(key)) return;
                seen.add(key);
                merged.push(item);
            });
            callback(merged.slice(0, 8));
        });
    }, 400);
}

function buatSubtitleNominatim(item) {
    const addr = item.address || {};
    return [
        addr.road || addr.pedestrian || addr.suburb,
        addr.city_district || addr.village || addr.town,
        addr.city || addr.county
    ].filter(Boolean).slice(0, 2).join(', ')
        || (item.display_name || '').split(',').slice(1, 3).join(',').trim();
}

function pasangAutocomplete({ inputId, boxId, icon, onSelect }) {
    const inp = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    if (!inp || !box) return;

    inp.addEventListener('input', () => {
        const val = inp.value.trim();
        if (!val || val === 'Lokasi Saya' || val.length < 2) { box.style.display = 'none'; return; }

        box.innerHTML = '<div class="suggestion-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Mencari...</div>';
        box.style.display = 'block';

        cariLokasi(val, results => {
            box.innerHTML = '';
            if (!results.length) {
                box.innerHTML = '<div class="suggestion-empty">Lokasi tidak ditemukan</div>';
                box.style.display = 'block';
                return;
            }
            results.forEach(item => {
                const div       = document.createElement('div');
                div.className   = 'suggestion-item';
                div.innerHTML   =
                    `<i class="${icon} suggestion-item-icon"></i>` +
                    `<div>` +
                        `<div class="suggestion-title">${item.name}</div>` +
                        `<div class="suggestion-distance">${item.subtitle}</div>` +
                    `</div>`;
                div.addEventListener('mousedown', e => {
                    e.preventDefault();
                    inp.value          = item.name;
                    box.style.display  = 'none';
                    onSelect(item);
                    map.flyTo([item.lat, item.lng], 16, { duration: 1.2 });
                });
                box.appendChild(div);
            });
            box.style.display = 'block';
        });
    });

    inp.addEventListener('blur',  () => setTimeout(() => { box.style.display = 'none'; }, 180));
    inp.addEventListener('focus', () => {
        if (inp.value.trim() && inp.value !== 'Lokasi Saya' && inp.value.length >= 2)
            inp.dispatchEvent(new Event('input'));
    });
}

pasangAutocomplete({
    inputId : 'lokasiInput',
    boxId   : 'lokasiSuggestion',
    icon    : 'fa-solid fa-location-dot',
    onSelect: item => {
        selectedOriginLatLng = { lat: item.lat, lng: item.lng };
        namaAsal = item.name;
    }
});

pasangAutocomplete({
    inputId : 'tujuanInput',
    boxId   : 'tujuanSuggestion',
    icon    : 'fa-solid fa-flag-checkered',
    onSelect: item => {
        selectedDestLatLng = { lat: item.lat, lng: item.lng };
        namaTujuan = item.name;
    }
});

// ======================
// BUS ROUTE HELPERS
// ======================

function getHalteTerdekat(lat, lng) {
    if (!halteDataGlobal) return null;
    let terdekat = null, jarakMin = Infinity;
    halteDataGlobal.features.forEach(f => {
        const [fLng, fLat] = f.geometry.coordinates;
        const j = haversineM(lat, lng, fLat, fLng);
        if (j < jarakMin) { jarakMin = j; terdekat = { feature: f, jarak: j }; }
    });
    return terdekat;
}

function panjangLineString(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        total += haversineM(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
    }
    return total;
}

function indexTerdekatDiLine(coords, lat, lng) {
    let idx = 0, jarakMin = Infinity;
    coords.forEach((c, i) => {
        const j = haversineM(lat, lng, c[1], c[0]);
        if (j < jarakMin) { jarakMin = j; idx = i; }
    });
    return idx;
}

// REVISI 9: PENENTUAN ARAH BERDASARKAN NOMOR HALTE
// Halte diberi nomor urut 1 (Terminal Hamid Rusdi) s/d 62 (Terminal Batu)
// mengikuti urutan korridor. Nomor makin besar = makin dekat ke Batu.
// Dengan ini kita TAHU DULU harus pakai file yang mana, tidak lagi
// membandingkan dua file jalur sekaligus (itu yang bikin rute nyasar
// lewat halte yang salah, mis. Rambu Pasar Bunulrejo).
function getArahDataset(noAsal, noTujuan) {
    if (noAsal > noTujuan) return jalurPergiData;   // arah Batu → Hamid Rusdi (nomor turun)
    if (noAsal < noTujuan) return jalurPulangData;  // arah Hamid Rusdi → Batu (nomor naik)
    return null; // halte asal & tujuan sama
}

// REVISI 9: cari segmen jalur bus HANYA di 1 dataset yang sesuai arah
// (datasetPilihan). Kalau datasetPilihan tidak diberikan, fallback ke
// mode lama (cari di semua dataset yang ada) supaya tetap aman dipanggil
// tanpa parameter itu. Mengembalikan koordinat (untuk digambar) SEKALIGUS
// jarak dalam meter, supaya gambar rute & hitungan jarak selalu konsisten.
function cariSegmenBus(halteLat1, halteLng1, halteLat2, halteLng2, datasetPilihan) {
    const datasets = datasetPilihan
        ? [datasetPilihan]
        : [jalurPergiData, jalurPulangData].filter(Boolean);

    if (!datasets.length) {
        return {
            coordsLatLng: [[halteLat1, halteLng1], [halteLat2, halteLng2]],
            jarakM      : haversineM(halteLat1, halteLng1, halteLat2, halteLng2)
        };
    }

    let jarakMin   = Infinity;
    let segTerbaik = null;

    datasets.forEach(jalurData => {
        jalurData.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const idx1   = indexTerdekatDiLine(coords, halteLat1, halteLng1);
            const idx2   = indexTerdekatDiLine(coords, halteLat2, halteLng2);
            // hanya ambil kalau searah dengan urutan titik pada garis ini
            if (idx1 >= idx2) return;

            const segCoords = coords.slice(idx1, idx2 + 1);
            const jarak      = panjangLineString(segCoords);
            if (jarak < jarakMin) {
                jarakMin   = jarak;
                segTerbaik = segCoords;
            }
        });
    });

    if (!segTerbaik) {
        return {
            coordsLatLng: [[halteLat1, halteLng1], [halteLat2, halteLng2]],
            jarakM      : haversineM(halteLat1, halteLng1, halteLat2, halteLng2)
        };
    }

    return {
        coordsLatLng: segTerbaik.map(c => [c[1], c[0]]),
        jarakM      : jarakMin
    };
}

// ======================
// CEK JARAK → MODE AKSES HALTE
// ======================

function getModeAkses(jarakM) {
    if (jarakM < JARAK_JALAN_KAKI_M) {
        return {
            mode           : 'jalan',
            kecepatanKmJam : KECEPATAN_JALAN_KAKI_KMJAM,
            emisiPerKm     : 0,
            label          : 'Jalan Kaki'
        };
    }
    return {
        mode           : 'motor',
        kecepatanKmJam : 35,
        emisiPerKm     : 0.103,
        label          : 'Kendaraan'
    };
}

// ======================
// HITUNG DATA BUS
// ======================

function hitungDataBus(originLat, originLng, destLat, destLng) {
    const halteAsalObj   = getHalteTerdekat(originLat, originLng);
    const halteTujuanObj = getHalteTerdekat(destLat, destLng);

    if (!halteAsalObj || !halteTujuanObj) return null;

    const [hALng, hALat] = halteAsalObj.feature.geometry.coordinates;
    const [hTLng, hTLat] = halteTujuanObj.feature.geometry.coordinates;

    const jarakKendaraanAsalM   = haversineM(originLat, originLng, hALat, hALng);
    const jarakKendaraanTujuanM = haversineM(destLat, destLng, hTLat, hTLng);

    const modeAsal   = getModeAkses(jarakKendaraanAsalM);
    const modeTujuan = getModeAkses(jarakKendaraanTujuanM);

    // REVISI 9: tentukan dataset (file jalur) yang benar berdasarkan
    // nomor urut halte, lalu pakai SATU dataset itu saja untuk hitung jarak.
    const noHalteAsal   = halteAsalObj.feature.properties["No"];
    const noHalteTujuan = halteTujuanObj.feature.properties["No"];
    const datasetTerpilih = getArahDataset(noHalteAsal, noHalteTujuan);

    const segmenBus = cariSegmenBus(hALat, hALng, hTLat, hTLng, datasetTerpilih);
    const jarakBus   = segmenBus.jarakM;

    const jarakAsalKm   = jarakKendaraanAsalM  / 1000;
    const jarakTujuanKm = jarakKendaraanTujuanM / 1000;
    const jarakBusKm    = jarakBus / 1000;
    const jarakTotalKm  = jarakAsalKm + jarakBusKm + jarakTujuanKm;

    const waktuAsalMnt   = Math.ceil(jarakAsalKm   / modeAsal.kecepatanKmJam   * 60);
    const waktuTujuanMnt = Math.ceil(jarakTujuanKm / modeTujuan.kecepatanKmJam * 60);
    const waktuBusMnt    = Math.ceil(jarakBusKm    / 25                         * 60);

    const busKendaraan   = KENDARAAN.find(k => k.id === 'bus');
    const emisiAsalKg    = jarakAsalKm   * modeAsal.emisiPerKm;
    const emisiTujuanKg  = jarakTujuanKm * modeTujuan.emisiPerKm;
    const emisiBusKg     = jarakBusKm    * busKendaraan.emisiPerKm;
    const emisiTotalKg   = emisiAsalKg + emisiBusKg + emisiTujuanKg;

    return {
        halteAsalObj,
        halteTujuanObj,
        namaHalteAsal        : halteAsalObj.feature.properties["Nama Halte"],
        namaHalteTujuan      : halteTujuanObj.feature.properties["Nama Halte"],
        noHalteAsal,
        noHalteTujuan,
        jarakKendaraanAsalM,
        jarakBusM            : jarakBus,
        jarakKendaraanTujuanM,
        jarakTotalKm,
        jarakBusKm,
        waktuTotalMnt        : waktuAsalMnt + waktuBusMnt + waktuTujuanMnt,
        waktuAsalMnt,
        waktuBusMnt,
        waktuTujuanMnt,
        emisiTotalKg,
        emisiAsalKg,
        emisiBusKg,
        emisiTujuanKg,
        modeAsal,
        modeTujuan,
        hALat, hALng,
        hTLat, hTLng,
    };
}

// ======================
// TOMBOL CARI UTAMA
// ======================

const mainSearchBtn = document.querySelector('#routePanel .search-btn');
if (mainSearchBtn) {
    mainSearchBtn.addEventListener('click', () => {
        if (activeWeightScheme === 'prioritas') tampilkanPanelPrioritas();
        else jalankanPencarian();
    });
}

// ======================
// AMBIL KOORDINAT ASAL
// ======================

function getOriginCoords() {
    if (selectedOriginLatLng) return selectedOriginLatLng;
    if (currentLat !== null)  return { lat: currentLat, lng: currentLng };
    return null;
}

// ======================
// JALANKAN PENCARIAN
// ======================

function jalankanPencarian() {
    const origin = getOriginCoords();
    if (!origin)             { alert('Masukkan lokasi asal terlebih dahulu'); return; }
    if (!selectedDestLatLng) { alert('Masukkan lokasi tujuan terlebih dahulu'); return; }

    const destLat = selectedDestLatLng.lat;
    const destLng = selectedDestLatLng.lng;

    let bobot;
    if      (activeWeightScheme === 'sama-rata') bobot = BOBOT['sama-rata'];
    else if (activeWeightScheme === 'karbon')    bobot = BOBOT['karbon'];
    else                                         bobot = BOBOT['prioritas'][selectedPriorityKey];

    const hasilKendaraan = KENDARAAN.map(k => {
        if (k.id === 'bus') {
            const busData = hitungDataBus(origin.lat, origin.lng, destLat, destLng);
            if (!busData) {
                const jarakKm = haversineM(origin.lat, origin.lng, destLat, destLng) / 1000;
                return { ...k, jarakKm,
                    biaya   : k.hitungBiaya(jarakKm),
                    waktuMnt: Math.ceil(jarakKm / k.kecepatanKmJam * 60),
                    emisiKg : jarakKm * k.emisiPerKm,
                    busData : null };
            }
            return { ...k,
                jarakKm : busData.jarakTotalKm,
                biaya   : k.hitungBiaya(busData.jarakTotalKm),
                waktuMnt: busData.waktuTotalMnt,
                emisiKg : busData.emisiTotalKg,
                busData };
        } else {
            const jarakKm = haversineM(origin.lat, origin.lng, destLat, destLng) / 1000;
            return { ...k, jarakKm,
                biaya   : k.hitungBiaya(jarakKm),
                waktuMnt: Math.ceil(jarakKm / k.kecepatanKmJam * 60),
                emisiKg : jarakKm * k.emisiPerKm,
                busData : null };
        }
    });

    const maxBiaya = Math.max(...hasilKendaraan.map(r => r.biaya));
    const maxWaktu = Math.max(...hasilKendaraan.map(r => r.waktuMnt));
    const maxEmisi = Math.max(...hasilKendaraan.map(r => r.emisiKg));
    const maxJarak = Math.max(...hasilKendaraan.map(r => r.jarakKm));

    hasilKendaraan.forEach(r => {
        const sBiaya = maxBiaya > 0 ? 1 - r.biaya    / maxBiaya : 0;
        const sWaktu = maxWaktu > 0 ? 1 - r.waktuMnt / maxWaktu : 0;
        const sEmisi = maxEmisi > 0 ? 1 - r.emisiKg  / maxEmisi : 0;
        const sJarak = maxJarak > 0 ? 1 - r.jarakKm  / maxJarak : 0;
        r.skor = bobot.biaya * sBiaya + bobot.waktu * sWaktu +
                 bobot.emisi * sEmisi + bobot.jarak * sJarak;
    });

    hasilKendaraan.sort((a, b) => b.skor - a.skor);

    const jumlahTampil = activeWeightScheme === 'sama-rata' ? 3 : 2;

    tampilkanPanelRekomendasi(
        hasilKendaraan.slice(0, jumlahTampil),
        bobot,
        origin.lat, origin.lng,
        destLat, destLng
    );
}

// ======================
// PANEL PRIORITAS
// ======================

function tampilkanPanelPrioritas() {
    const opsi = [
        { key: 'emisi', icon: 'fa-solid fa-leaf',              label: 'Emisi Terendah',  desc: 'Pilih moda paling ramah lingkungan' },
        { key: 'biaya', icon: 'fa-solid fa-wallet',            label: 'Biaya Termurah',  desc: 'Hemat budget perjalanan Anda' },
        { key: 'waktu', icon: 'fa-solid fa-clock-rotate-left', label: 'Waktu Tercepat',  desc: 'Prioritaskan efisiensi waktu perjalanan' },
        { key: 'jarak', icon: 'fa-solid fa-route',             label: 'Jalur Terpendek', desc: 'Rute dengan jarak fisik paling sedikit' },
    ];

    const innerHtml =
        `<div class="panel-header">
            <button class="back-btn" id="closePrioritasPanel"><i class="fa-solid fa-chevron-left"></i></button>
            <h3>Prioritas Perjalanan</h3>
        </div>` +
        opsi.map(o =>
            `<div class="prioritas-item ${selectedPriorityKey === o.key ? 'active' : ''}" data-key="${o.key}">
                <div class="prioritas-icon-wrap"><i class="${o.icon}"></i></div>
                <div class="prioritas-text">
                    <div class="prioritas-label">${o.label}</div>
                    <div class="prioritas-desc">${o.desc}</div>
                </div>
                <div class="prioritas-radio ${selectedPriorityKey === o.key ? 'checked' : ''}"></div>
            </div>`
        ).join('') +
        `<button class="search-btn" id="konfirmasiPrioritasBtn">Cari</button>`;

    const panel = PANELS.prioritas;
    setupDynamicPanel(panel, innerHtml);
    showPanel('prioritas');

    document.getElementById('closePrioritasPanel').addEventListener('click', () => showPanel('route'));

    panel.querySelectorAll('.prioritas-item').forEach(item => {
        item.addEventListener('click', () => {
            panel.querySelectorAll('.prioritas-item').forEach(i => {
                i.classList.remove('active');
                i.querySelector('.prioritas-radio').classList.remove('checked');
            });
            item.classList.add('active');
            item.querySelector('.prioritas-radio').classList.add('checked');
            selectedPriorityKey = item.getAttribute('data-key');
        });
    });

    document.getElementById('konfirmasiPrioritasBtn').addEventListener('click', () => {
        activeWeightScheme = 'prioritas';
        jalankanPencarian();
    });
}

// ======================
// PANEL REKOMENDASI
// ======================

function tampilkanPanelRekomendasi(rekomendasi, bobot, originLat, originLng, destLat, destLng) {
    let selectedIdx = 0;

    const listHtml = rekomendasi.map((k, idx) => {
        const isBus = k.id === 'bus' && k.busData;
        const bd    = k.busData;

        const labelAsal   = isBus ? bd.modeAsal.label   : '';
        const labelTujuan = isBus ? bd.modeTujuan.label : '';
        const ikonAsal    = isBus && bd.modeAsal.mode   === 'jalan' ? 'fa-solid fa-person-walking' : 'fa-solid fa-motorcycle';
        const ikonTujuan  = isBus && bd.modeTujuan.mode === 'jalan' ? 'fa-solid fa-person-walking' : 'fa-solid fa-motorcycle';

        const descExtra = isBus
            ? `<div class="rek-desc rek-route-anim">
                <span class="rek-step" title="${labelAsal}">
                    <i class="${ikonAsal}"></i>
                    ${(bd.jarakKendaraanAsalM/1000).toFixed(1)}km
                </span>
                <span class="rek-arrow">→</span>
                <span class="rek-step rek-bus">
                    <i class="fa-solid fa-bus"></i>
                    ${bd.jarakBusKm.toFixed(1)}km
                </span>
                <span class="rek-arrow">→</span>
                <span class="rek-step" title="${labelTujuan}">
                    <i class="${ikonTujuan}"></i>
                    ${(bd.jarakKendaraanTujuanM/1000).toFixed(1)}km
                </span>
               </div>`
            : '';

        return `<div class="rekomendasi-card ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
            <div class="rek-left">
                <div class="rek-icon-wrap ${idx === 0 ? 'active' : ''}"><i class="${k.faIcon}"></i></div>
                <div class="rek-info">
                    ${idx === 0 ? '<div class="rek-best-badge"><i class="fa-solid fa-star"></i> Rekomendasi Terbaik</div>' : ''}
                    <div class="rek-nama">${k.nama}</div>
                    <div class="rek-desc">${k.deskripsi}</div>
                    ${descExtra}
                </div>
            </div>
            <div class="rek-right">
                <div class="rek-waktu">${k.waktuMnt} mnt</div>
                <div class="rek-jarak">${k.jarakKm.toFixed(1)} km</div>
                <div class="rek-biaya">Rp ${k.biaya.toLocaleString('id-ID')}</div>
            </div>
        </div>`;
    }).join('');

    const innerHtml =
        `<div class="panel-header">
            <button class="back-btn" id="closeRekPanel"><i class="fa-solid fa-chevron-left"></i></button>
            <h3>Rekomendasi Kendaraan</h3>
        </div>` +
        listHtml +
        `<button class="search-btn" id="lanjutRekBtn">Lanjut</button>`;

    const panel = PANELS.rekomendasi;
    setupDynamicPanel(panel, innerHtml);
    showPanel('rekomendasi');

    document.getElementById('closeRekPanel').addEventListener('click', () => {
        if (activeWeightScheme === 'prioritas') showPanel('prioritas');
        else showPanel('route');
    });

    panel.querySelectorAll('.rekomendasi-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedIdx = parseInt(card.getAttribute('data-idx'));
            panel.querySelectorAll('.rekomendasi-card').forEach((c, i) => {
                c.classList.toggle('selected', i === selectedIdx);
                c.querySelector('.rek-icon-wrap').classList.toggle('active', i === selectedIdx);
            });
        });
    });

    document.getElementById('lanjutRekBtn').addEventListener('click', () => {
        const pilihan = rekomendasi[selectedIdx];
        if (pilihan.id === 'bus') showHalteLayer();
        else hideHalteLayer();
        tampilkanDetailDanRute(pilihan, bobot, originLat, originLng, destLat, destLng);
    });
}

// ======================
// DETAIL + RUTE
// ======================

function tampilkanDetailDanRute(kendaraan, bobot, originLat, originLng, destLat, destLng) {
    clearRouteLayers();
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker)   { map.removeLayer(destMarker);   destMarker = null; }

    if (kendaraan.id !== 'bus') hideHalteLayer();

    if (kendaraan.id === 'bus' && kendaraan.busData) {
        gambatRuteBus(kendaraan, originLat, originLng, destLat, destLng);
        pasangOriginMarker(originLat, originLng);
        pasangDestMarker(destLat, destLng);
        tampilRouteInfoBar(namaAsal, namaTujuan);
        tampilkanPanelDetail(kendaraan, bobot, originLat, originLng, destLat, destLng, true); // true = isBusMode
    } else {
        const osrmUrl =
            `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;

        const drawRoute = (coords, jarakKm) => {
            kendaraan            = { ...kendaraan };
            kendaraan.jarakKm    = jarakKm;
            kendaraan.waktuMnt   = Math.ceil(jarakKm / kendaraan.kecepatanKmJam * 60);
            kendaraan.biaya      = kendaraan.hitungBiaya(jarakKm);
            kendaraan.emisiKg    = jarakKm * kendaraan.emisiPerKm;

            const layer = L.polyline(coords, { color: '#97AE48', weight: 6, opacity: 0.85, lineJoin: 'round' }).addTo(map);
            activeRouteLayers.push(layer);
            pasangOriginMarker(originLat, originLng);
            pasangDestMarker(destLat, destLng);
            map.fitBounds(layer.getBounds(), { padding: [60, 100] });
            tampilRouteInfoBar(namaAsal, namaTujuan);
            tampilkanPanelDetail(kendaraan, bobot, originLat, originLng, destLat, destLng);
        };

        fetch(osrmUrl)
            .then(r => r.json())
            .then(data => {
                const coords  = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                const jarakKm = data.routes[0].distance / 1000;
                drawRoute(coords, jarakKm);
            })
            .catch(() => {
                const jarakKm = haversineM(originLat, originLng, destLat, destLng) / 1000;
                drawRoute([[originLat, originLng], [destLat, destLng]], jarakKm);
            });
    }
}

// ======================
// GAMBAR RUTE BUS
// REVISI 3: segmen jalan kaki/kendaraan ke halte juga pakai OSRM
//           (menyesuaikan jalan, bukan tarik garis lurus)
// ======================

function gambatRuteBus(kendaraan, originLat, originLng, destLat, destLng) {
    const bd = kendaraan.busData;
    const { hALat, hALng, hTLat, hTLng, namaHalteAsal, namaHalteTujuan,
            noHalteAsal, noHalteTujuan, modeAsal, modeTujuan } = bd;

    const warnaAsal   = modeAsal.mode   === 'jalan' ? '#F5A623' : '#4A90D9';
    const warnaTujuan = modeTujuan.mode === 'jalan' ? '#F5A623' : '#4A90D9';
    const tooltipAsal   = modeAsal.mode   === 'jalan' ? '🚶 Jalan kaki ke halte'   : '🏍 Kendaraan ke halte';
    const tooltipTujuan = modeTujuan.mode === 'jalan' ? '🚶 Jalan kaki dari halte' : '🏍 Kendaraan dari halte';

    // REVISI 9: pakai dataset yang SAMA seperti waktu hitung jarak di hitungDataBus,
    // supaya rute yang digambar & angka jarak yang ditampilkan selalu konsisten.
    const datasetTerpilih = getArahDataset(noHalteAsal, noHalteTujuan);
    const busCoords = cariSegmenBus(hALat, hALng, hTLat, hTLng, datasetTerpilih).coordsLatLng;
    const layerBus  = L.polyline(busCoords, {
        color: '#97AE48', weight: 6, opacity: 0.9, lineJoin: 'round'
    }).addTo(map);
    layerBus.bindTooltip('🚌 Bus TransJatim K1', { sticky: true });
    activeRouteLayers.push(layerBus);

    const hAIcon = L.divIcon({
        className: '',
        html: `<div class="halte-marker halte-naik"><i class="fa-solid fa-bus-simple"></i></div>`,
        iconSize: [36, 36], iconAnchor: [18, 18]
    });
    const markerHA = L.marker([hALat, hALng], { icon: hAIcon, zIndexOffset: 800 }).addTo(map);
    markerHA.bindPopup(
        `<div class="popup-card">
            <div class="popup-title">Halte Naik</div>
            <div class="popup-address">${namaHalteAsal}</div>
        </div>`
    );
    activeRouteLayers.push(markerHA);

    const hTIcon = L.divIcon({
        className: '',
        html: `<div class="halte-marker halte-turun"><i class="fa-solid fa-location-dot"></i></div>`,
        iconSize: [36, 36], iconAnchor: [18, 18]
    });
    const markerHT = L.marker([hTLat, hTLng], { icon: hTIcon, zIndexOffset: 800 }).addTo(map);
    markerHT.bindPopup(
        `<div class="popup-card">
            <div class="popup-title">Turun Bus di Sini</div>
            <div class="popup-address">${namaHalteTujuan}</div>
        </div>`
    );
    activeRouteLayers.push(markerHT);

    // REVISI 3: Semua segmen (jalan kaki & kendaraan ke halte) pakai OSRM
    // — mode jalan kaki tetap pakai OSRM driving sebagai aproksimasi jalan
    const profileAsal   = 'driving'; // OSRM hanya punya driving/walking/cycling
    const profileTujuan = 'driving';

    const osrmAsal   = `https://router.project-osrm.org/route/v1/${profileAsal}/${originLng},${originLat};${hALng},${hALat}?overview=full&geometries=geojson`;
    const osrmTujuan = `https://router.project-osrm.org/route/v1/${profileTujuan}/${hTLng},${hTLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    // Gunakan OSRM untuk semua mode akses (jalan kaki & kendaraan)
    const fetchAsal   = fetch(osrmAsal).then(r => r.json()).catch(() => null);
    const fetchTujuan = fetch(osrmTujuan).then(r => r.json()).catch(() => null);

    Promise.all([fetchAsal, fetchTujuan]).then(([dataAsal, dataTujuan]) => {
        // Segmen asal → halte naik
        const coordsAsal = dataAsal?.routes?.[0]?.geometry?.coordinates?.map(c => [c[1], c[0]])
            || [[originLat, originLng], [hALat, hALng]];
        const layerKenAsal = L.polyline(coordsAsal, {
            color: warnaAsal, weight: 4, opacity: 0.9,
            dashArray: modeAsal.mode === 'jalan' ? '6 5' : null,
            lineJoin: 'round'
        }).addTo(map);
        layerKenAsal.bindTooltip(tooltipAsal, { sticky: true });
        activeRouteLayers.push(layerKenAsal);

        // Segmen halte turun → tujuan
        const coordsTujuan = dataTujuan?.routes?.[0]?.geometry?.coordinates?.map(c => [c[1], c[0]])
            || [[hTLat, hTLng], [destLat, destLng]];
        const layerKenTujuan = L.polyline(coordsTujuan, {
            color: warnaTujuan, weight: 4, opacity: 0.9,
            dashArray: modeTujuan.mode === 'jalan' ? '6 5' : null,
            lineJoin: 'round'
        }).addTo(map);
        layerKenTujuan.bindTooltip(tooltipTujuan, { sticky: true });
        activeRouteLayers.push(layerKenTujuan);

        const allCoords = [...coordsAsal, ...busCoords, ...coordsTujuan];
        map.fitBounds(L.latLngBounds(allCoords), { padding: [60, 100] });
    });
}

// ======================
// IKON KONTEKSTUAL DI PETA
// ======================

const PLACE_ICON_MAP = [
    { keys: ['futsal','sepak bola','lapangan bola','stadion'],
      icon: 'fa-solid fa-futbol',          bg: '#16a34a', fg: '#fff' },
    { keys: ['rumah sakit','rs ','rsu','rsud','klinik','puskesmas','apotek'],
      icon: 'fa-solid fa-hospital',        bg: '#dc2626', fg: '#fff' },
    { keys: ['sekolah','sma','smp','sd ','universitas','univ','kampus','uin','itb','ugm','its','um '],
      icon: 'fa-solid fa-school',          bg: '#7c3aed', fg: '#fff' },
    { keys: ['mall','plaza','supermarket','hypermart','indomaret','alfamart','pasar'],
      icon: 'fa-solid fa-store',           bg: '#d97706', fg: '#fff' },
    { keys: ['hotel','penginapan','wisma','homestay','villa'],
      icon: 'fa-solid fa-hotel',           bg: '#0891b2', fg: '#fff' },
    { keys: ['masjid','mushola','gereja','pura','vihara','klenteng'],
      icon: 'fa-solid fa-place-of-worship',bg: '#92400e', fg: '#fff' },
    { keys: ['bandara','airport','terminal bus','terminal','stasiun','halte'],
      icon: 'fa-solid fa-train-subway',    bg: '#475569', fg: '#fff' },
    { keys: ['restoran','restaurant','cafe','kafe','warung','depot','bakso','soto'],
      icon: 'fa-solid fa-utensils',        bg: '#ea580c', fg: '#fff' },
    { keys: ['bank','atm','bri','bca','mandiri','bni','bsi'],
      icon: 'fa-solid fa-building-columns',bg: '#1d4ed8', fg: '#fff' },
    { keys: ['taman','kebun bibit','pantai','gunung','wisata'],
      icon: 'fa-solid fa-tree',            bg: '#15803d', fg: '#fff' },
    { keys: ['kantor','dinas','balai kota','polsek','polres'],
      icon: 'fa-solid fa-building',        bg: '#64748b', fg: '#fff' },
    { keys: ['lokasi saya','posisi saya'],
      icon: 'fa-solid fa-street-view',     bg: '#2563eb', fg: '#fff' },
    { keys: ['rumah','perumahan','griya'],
      icon: 'fa-solid fa-house',           bg: '#97AE48', fg: '#fff' },
    { keys: ['lapangan','sport','gym','olahraga'],
      icon: 'fa-solid fa-dumbbell',        bg: '#0d9488', fg: '#fff' },
];

const PLACE_ICON_DEFAULT_ORIGIN = { icon: 'fa-solid fa-street-view', bg: '#2563eb', fg: '#fff' };
const PLACE_ICON_DEFAULT_DEST   = { icon: 'fa-solid fa-flag-checkered', bg: '#e74c3c', fg: '#fff' };

function getPlaceIcon(namaLokasi) {
    if (!namaLokasi) return null;
    const t = namaLokasi.toLowerCase();
    for (const entry of PLACE_ICON_MAP) {
        if (entry.keys.some(k => t.includes(k))) return entry;
    }
    return null;
}

function buatMarkerBubble({ icon, bg, fg, pulse = false, label = '' }) {
    const pulseHtml = pulse
        ? `<div class="place-marker-pulse"></div>`
        : '';
    const labelHtml = label
        ? `<div class="place-marker-label">${label}</div>`
        : '';
    return `
        <div class="place-marker-wrap">
            ${pulseHtml}
            <div class="place-marker-bubble" style="background:${bg};color:${fg};">
                <i class="${icon}"></i>
            </div>
            <div class="place-marker-tail" style="border-top-color:${bg};"></div>
            ${labelHtml}
        </div>`;
}

// ======================
// MARKER ASAL & TUJUAN
// ======================

function pasangOriginMarker(lat, lng) {
    if (originMarker) map.removeLayer(originMarker);

    const namaAsal_ = namaAsal || '';
    const match     = getPlaceIcon(namaAsal_) || PLACE_ICON_DEFAULT_ORIGIN;
    const shortLabel = namaAsal_.split(' ').slice(0, 3).join(' ');

    const icon = L.divIcon({
        className : '',
        html      : buatMarkerBubble({ ...match, pulse: false, label: shortLabel }),
        iconSize  : [44, 54],
        iconAnchor: [22, 54],
    });

    originMarker = L.marker([lat, lng], { icon, zIndexOffset: 900 }).addTo(map);
}

function pasangDestMarker(lat, lng) {
    if (destMarker) map.removeLayer(destMarker);

    const namaTujuan_ = namaTujuan || '';
    const match       = getPlaceIcon(namaTujuan_) || PLACE_ICON_DEFAULT_DEST;
    const shortLabel  = namaTujuan_.split(' ').slice(0, 3).join(' ');

    const icon = L.divIcon({
        className : '',
        html      : buatMarkerBubble({ ...match, pulse: true, label: shortLabel }),
        iconSize  : [44, 62],
        iconAnchor: [22, 62],
    });

    destMarker = L.marker([lat, lng], { icon, zIndexOffset: 950 }).addTo(map);
}

// ======================
// ROUTE INFO BAR
// ======================

function tampilRouteInfoBar(asal, tujuan) {
    const existing = document.getElementById('routeInfoBar');
    if (existing) existing.remove();

    const bar     = document.createElement('div');
    bar.id        = 'routeInfoBar';
    bar.className = 'route-info-bar';
    bar.innerHTML =
        '<div class="rib-content">' +
            '<div class="rib-row">' +
                '<div class="rib-dot-col"><div class="rib-dot-origin"></div></div>' +
                '<span class="rib-label">' + (asal   || 'Lokasi Asal')   + '</span>' +
            '</div>' +
            '<div class="rib-row" style="height:14px;">' +
                '<div class="rib-connector-wrap">' +
                    '<div class="rib-connector-dot"></div>' +
                    '<div class="rib-connector-dot"></div>' +
                    '<div class="rib-connector-dot"></div>' +
                '</div>' +
            '</div>' +
            '<div class="rib-row">' +
                '<div class="rib-dot-col"><div class="rib-dot-dest"><div class="rib-dest-ring"></div></div></div>' +
                '<span class="rib-label rib-label-dest">' + (tujuan || 'Lokasi Tujuan') + '</span>' +
            '</div>' +
        '</div>';

    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('visible'));
}

// ======================
// PANEL DETAIL
// REVISI 5: Tambah tombol collapse/expand yang menonjol di panel detail
// ======================

function tampilkanPanelDetail(kendaraan, bobot, originLat, originLng, destLat, destLng, startPeek = false) {
    const pWaktu = Math.round(bobot.waktu * 100);
    const pBiaya = Math.round(bobot.biaya * 100);
    const pEmisi = Math.round(bobot.emisi * 100);
    const pJarak = Math.round(bobot.jarak * 100);

    const isBus = kendaraan.id === 'bus' && kendaraan.busData;
    const bd    = kendaraan.busData;

    let biayaInfo = '';
    if (kendaraan.id === 'motor') {
        biayaInfo = `<div class="biaya-info">BBM: ${(kendaraan.jarakKm/KONSUMSI_MOTOR).toFixed(2)} liter × Rp${HARGA_BBM.toLocaleString('id-ID')} = <strong>Rp ${kendaraan.biaya.toLocaleString('id-ID')}</strong>  |  Emisi: <strong>${kendaraan.emisiKg.toFixed(3)} kg CO₂</strong></div>`;
    } else if (kendaraan.id === 'mobil') {
        biayaInfo = `<div class="biaya-info">BBM: ${(kendaraan.jarakKm/KONSUMSI_MOBIL).toFixed(2)} liter × Rp${HARGA_BBM.toLocaleString('id-ID')} = <strong>Rp ${kendaraan.biaya.toLocaleString('id-ID')}</strong>  |  Emisi: <strong>${kendaraan.emisiKg.toFixed(3)} kg CO₂</strong></div>`;
    } else {
        const emisiTotal = isBus ? bd.emisiTotalKg : kendaraan.emisiKg;
        biayaInfo = `<div class="biaya-info">Tarif flat Bus TransJatim K1: <strong>Rp ${kendaraan.biaya.toLocaleString('id-ID')}</strong>  |  Emisi total: <strong>${emisiTotal.toFixed(3)} kg CO₂</strong></div>`;
    }

    let busSegmen = '';
    if (isBus) {
        const ikonAsal   = bd.modeAsal.mode   === 'jalan' ? 'fa-solid fa-person-walking' : 'fa-solid fa-motorcycle';
        const ikonTujuan = bd.modeTujuan.mode === 'jalan' ? 'fa-solid fa-person-walking' : 'fa-solid fa-motorcycle';

        const emisiAsalTxt   = bd.emisiAsalKg   > 0 ? ` · ${bd.emisiAsalKg.toFixed(3)} kg CO₂`   : ' · 0 emisi';
        const emisiTujuanTxt = bd.emisiTujuanKg > 0 ? ` · ${bd.emisiTujuanKg.toFixed(3)} kg CO₂` : ' · 0 emisi';

        busSegmen = `
        <h4>RINCIAN PERJALANAN</h4>
        <div class="journey-timeline">

            <div class="jt-step" style="--delay:0ms">
                <div class="jt-icon-col">
                    <div class="jt-dot dot-blue">
                        <i class="${ikonAsal}"></i>
                    </div>
                    <div class="jt-line"></div>
                </div>
                <div class="jt-content">
                    <div class="jt-label">${bd.modeAsal.label} ke Halte</div>
                    <div class="jt-sub">${bd.namaHalteAsal}</div>
                    <div class="jt-meta">${(bd.jarakKendaraanAsalM/1000).toFixed(2)} km · ${bd.waktuAsalMnt} mnt${emisiAsalTxt}</div>
                </div>
            </div>

            <div class="jt-step" style="--delay:120ms">
                <div class="jt-icon-col">
                    <div class="jt-dot dot-green">
                        <i class="fa-solid fa-bus"></i>
                    </div>
                    <div class="jt-line"></div>
                </div>
                <div class="jt-content">
                    <div class="jt-label">Bus TransJatim K1</div>
                    <div class="jt-sub">${bd.namaHalteAsal} → ${bd.namaHalteTujuan}</div>
                    <div class="jt-meta">${bd.jarakBusKm.toFixed(2)} km · ${bd.waktuBusMnt} mnt · ${bd.emisiBusKg.toFixed(3)} kg CO₂</div>
                </div>
            </div>

            <div class="jt-step" style="--delay:240ms">
                <div class="jt-icon-col">
                    <div class="jt-dot dot-blue">
                        <i class="${ikonTujuan}"></i>
                    </div>
                    <div class="jt-line"></div>
                </div>
                <div class="jt-content">
                    <div class="jt-label">${bd.modeTujuan.label} dari Halte</div>
                    <div class="jt-sub">${bd.namaHalteTujuan} → Tujuan</div>
                    <div class="jt-meta">${(bd.jarakKendaraanTujuanM/1000).toFixed(2)} km · ${bd.waktuTujuanMnt} mnt${emisiTujuanTxt}</div>
                </div>
            </div>

            <div class="jt-step" style="--delay:360ms">
                <div class="jt-icon-col">
                    <div class="jt-dot dot-dest">
                        <i class="fa-solid fa-flag-checkered"></i>
                    </div>
                </div>
                <div class="jt-content">
                    <div class="jt-label">Tiba di Tujuan</div>
                    <div class="jt-meta">Total ${bd.waktuTotalMnt} mnt · ${bd.emisiTotalKg.toFixed(3)} kg CO₂</div>
                </div>
            </div>

        </div>`;
    }

    // REVISI 5: Tambah tombol toggle collapse/expand yang terlihat jelas
    const innerHtml =
        `<div class="panel-header" id="detailPanelHeader" style="cursor:pointer;">
            <button class="back-btn" id="kembaliDetailBtn"><i class="fa-solid fa-chevron-left"></i></button>
            <h3>Detail Perjalanan</h3>
        </div>
        <div class="rekomendasi-card selected" style="margin-bottom:20px;cursor:default">
            <div class="rek-left">
                <div class="rek-icon-wrap active"><i class="${kendaraan.faIcon}"></i></div>
                <div class="rek-info">
                    <div class="rek-nama">${kendaraan.nama}</div>
                    <div class="rek-desc">${kendaraan.deskripsi}</div>
                </div>
            </div>
            <div class="rek-right">
                <div class="rek-waktu">${kendaraan.waktuMnt} mnt</div>
                <div class="rek-jarak">${kendaraan.jarakKm.toFixed(1)} km</div>
            </div>
        </div>
        ${busSegmen}
        <h4>ESTIMASI BOBOT</h4>
        <div class="estimasi-grid">
            <div class="estimasi-item"><span class="estimasi-label">Waktu</span><span class="estimasi-val">${pWaktu}%</span></div>
            <div class="estimasi-item"><span class="estimasi-label">Biaya</span><span class="estimasi-val">${pBiaya}%</span></div>
            <div class="estimasi-item"><span class="estimasi-label">Emisi</span><span class="estimasi-val">${pEmisi}%</span></div>
            <div class="estimasi-item"><span class="estimasi-label">Jarak</span><span class="estimasi-val">${pJarak}%</span></div>
        </div>
        ${biayaInfo}

        <div class="estimasi-note">
            <span class="note-star">*</span> Angka biaya dan emisi bersifat perkiraan untuk membantu perbandingan antar moda transportasi.
        </div>
        
        <button class="search-btn gmaps-btn" id="lanjutGmapsBtn" style="margin-top:20px">
            <i class="fa-solid fa-map-location-dot"></i> Buka Google Maps
        </button>`;
        

    const panel = PANELS.detail;
    setupDynamicPanel(panel, innerHtml);
    showPanel('detail');

    document.getElementById('kembaliDetailBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showPanel('rekomendasi');
        clearRouteLayers();
        if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
        if (destMarker)   { map.removeLayer(destMarker);   destMarker = null; }
        const bar = document.getElementById('routeInfoBar');
        if (bar) bar.remove();
        hideHalteLayer();
    });

    // REVISI 5: Tombol toggle expand/collapse panel detail
    const toggleBtn  = document.getElementById('toggleDetailBtn');
    const toggleIcon = document.getElementById('toggleDetailIcon');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.classList.contains('peek')) {
                panel.classList.remove('peek');
                panel.classList.add('active');
                toggleIcon.className = 'fa-solid fa-chevron-down';
            } else {
                panel.classList.remove('active');
                panel.classList.add('peek');
                toggleIcon.className = 'fa-solid fa-chevron-up';
            }
        });
    }

    // REVISI 5: Tap pada panel-header juga toggle
    const detailHeader = document.getElementById('detailPanelHeader');
    if (detailHeader) {
        detailHeader.addEventListener('click', (e) => {
            if (e.target.closest('#kembaliDetailBtn') || e.target.closest('#toggleDetailBtn')) return;
            if (panel.classList.contains('peek')) {
                panel.classList.remove('peek');
                panel.classList.add('active');
                if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-down';
            } else {
                panel.classList.remove('active');
                panel.classList.add('peek');
                if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-up';
            }
        });
    }

    document.getElementById('lanjutGmapsBtn').addEventListener('click', () => {
        tampilkanKonfirmasiGmaps(originLat, originLng, destLat, destLng);
    });
}

// ======================
// KONFIRMASI GOOGLE MAPS
// ======================

function tampilkanKonfirmasiGmaps(originLat, originLng, destLat, destLng) {
    const existing = document.getElementById('gmapsModal');
    if (existing) existing.remove();

    const modal     = document.createElement('div');
    modal.id        = 'gmapsModal';
    modal.innerHTML = `
        <div class="gmaps-backdrop"></div>
        <div class="gmaps-card">
            <div class="gmaps-icon"><i class="fa-solid fa-map-location-dot"></i></div>
            <div class="gmaps-title">Buka Di Google Maps Sekarang?</div>
            <div class="gmaps-actions">
                <button class="gmaps-lanjut"  id="gmapsLanjutBtn">Lanjut</button>
                <button class="gmaps-kembali" id="gmapsKembaliBtn">Kembali</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('gmapsKembaliBtn').addEventListener('click', () => modal.remove());
    document.getElementById('gmapsLanjutBtn').addEventListener('click', () => {
        window.open(`https://www.google.com/maps/dir/${originLat},${originLng}/${destLat},${destLng}`, '_blank');
        modal.remove();
    });
}