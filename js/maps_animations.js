// ============================================================
//  MAPS ANIMATIONS — satu tema cohesive
//  Strategi tema: "smooth native maps feel"
//  Warna utama diambil dari palet existing:
//    hijau rute  : #97AE48
//    biru akses  : #4A90D9
//    oranye jalan: #F5A623
//    teks gelap  : #1a1a2e
// ============================================================

// ============================================================
// SECTION 1 — CSS INJECTION
// Semua keyframe & utility class disuntikkan sekali saat load
// ============================================================

(function injectAnimationCSS() {
    if (document.getElementById('maps-anim-style')) return;
    const style = document.createElement('style');
    style.id = 'maps-anim-style';
    style.textContent = `

/* ── Easing tokens ──────────────────────────────────────── */
:root {
    --ease-spring   : cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-out-expo : cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-expo  : cubic-bezier(0.7, 0, 0.84, 0);
    --ease-smooth   : cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Panel slide-up spring ───────────────────────────────── */
/* Ganti transition panel yang sudah ada supaya pakai spring easing */
#routePanel, #prioritasPanel, #rekomendasiPanel, #detailPanel {
    transition:
        transform 0.45s var(--ease-spring),
        opacity   0.3s  var(--ease-out-expo) !important;
}
#routePanel.active, #prioritasPanel.active,
#rekomendasiPanel.active, #detailPanel.active {
    animation: panelSlideUp 0.45s var(--ease-spring) both;
}

@keyframes panelSlideUp {
    from { transform: translateX(-50%) translateY(120%); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
}

/* ── Skeleton shimmer ────────────────────────────────────── */
.skeleton-wrap {
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.skel-line {
    background: linear-gradient(90deg,
        rgba(0,0,0,.06) 25%,
        rgba(0,0,0,.12) 50%,
        rgba(0,0,0,.06) 75%
    );
    background-size: 200% 100%;
    border-radius: 8px;
    animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
}
.skel-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: rgba(0,0,0,.03);
    border-radius: 14px;
}
.skel-circle { border-radius: 50%; flex-shrink: 0; }

/* ── Journey timeline stagger ────────────────────────────── */
.jt-step {
    opacity: 0;
    transform: translateX(-14px);
    animation: jtReveal 0.4s var(--ease-out-expo) both;
    animation-delay: var(--delay, 0ms);
}
@keyframes jtReveal {
    to { opacity: 1; transform: translateX(0); }
}

/* ── Rekomendasi card stagger ────────────────────────────── */
.rekomendasi-card {
    opacity: 0;
    transform: translateY(18px);
    animation: cardReveal 0.4s var(--ease-out-expo) both;
}
.rekomendasi-card:nth-child(2) { animation-delay: 80ms;  }
.rekomendasi-card:nth-child(3) { animation-delay: 160ms; }
.rekomendasi-card:nth-child(4) { animation-delay: 240ms; }
@keyframes cardReveal {
    to { opacity: 1; transform: translateY(0); }
}

/* ── Prioritas item stagger ──────────────────────────────── */
.prioritas-item {
    opacity: 0;
    transform: translateX(-12px);
    animation: prioritasReveal 0.38s var(--ease-out-expo) both;
}
.prioritas-item:nth-child(2) { animation-delay: 60ms;  }
.prioritas-item:nth-child(3) { animation-delay: 120ms; }
.prioritas-item:nth-child(4) { animation-delay: 180ms; }
.prioritas-item:nth-child(5) { animation-delay: 240ms; }
@keyframes prioritasReveal {
    to { opacity: 1; transform: translateX(0); }
}

/* ── Marker drop + bounce ────────────────────────────────── */
.origin-marker-wrap {
    animation: markerDrop 0.55s var(--ease-spring) both;
}
.dest-marker-wrap {
    animation: markerDrop 0.55s var(--ease-spring) 0.18s both;
}
@keyframes markerDrop {
    from { transform: translateY(-40px) scale(0.6); opacity: 0; }
    to   { transform: translateY(0)     scale(1);   opacity: 1; }
}

/* ── Halte marker pop ────────────────────────────────────── */
.halte-marker {
    animation: haltePop 0.45s var(--ease-spring) both;
}
@keyframes haltePop {
    from { transform: scale(0); opacity: 0; }
    60%  { transform: scale(1.2); }
    to   { transform: scale(1);   opacity: 1; }
}

/* ── Dest pulse ring — diperkuat ────────────────────────── */
.dest-pulse-ring {
    animation: destPulse 2s ease-out infinite !important;
}
.dest-pulse-ring.r2 {
    animation-delay: 0.7s !important;
}
@keyframes destPulse {
    0%   { transform: scale(0.8); opacity: 0.8; }
    100% { transform: scale(2.6); opacity: 0;   }
}

/* ── GPS dot ping ────────────────────────────────────────── */
.gps-pulse-ring {
    animation: gpsPing 1.8s ease-out infinite !important;
}
@keyframes gpsPing {
    0%   { transform: scale(0.9); opacity: 0.7; }
    100% { transform: scale(2.8); opacity: 0;   }
}

/* ── Route info bar slide-in ─────────────────────────────── */
.route-info-bar {
    transition: transform 0.4s var(--ease-out-expo),
                opacity   0.3s ease !important;
}
.route-info-bar.visible {
    animation: ribSlideIn 0.4s var(--ease-out-expo) both;
}
@keyframes ribSlideIn {
    from { transform: translateY(-20px) translateX(-50%); opacity: 0; }
    to   { transform: translateY(0)     translateX(-50%); opacity: 1; }
}

/* ── Ant trail (segmen akses bergerak) ───────────────────── */
/* Diterapkan lewat JS ke SVG path Leaflet */
.ant-trail-path {
    stroke-dashoffset: 0;
    animation: antTrail 1.2s linear infinite;
}
@keyframes antTrail {
    to { stroke-dashoffset: -28; } /* 8+6+8+6 = offset satu siklus dash */
}

/* ── CO₂ counter ─────────────────────────────────────────── */
.co2-count {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    transition: color 0.3s ease;
}

/* ── Search button loading state ─────────────────────────── */
.search-btn.loading {
    pointer-events: none;
    position: relative;
    color: transparent !important;
}
.search-btn.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    margin: auto;
    width: 20px;
    height: 20px;
    border: 2.5px solid rgba(255,255,255,.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: btnSpin 0.7s linear infinite;
}
@keyframes btnSpin {
    to { transform: rotate(360deg); }
}

/* ── Panel header fade-in ─────────────────────────────────── */
.panel-header {
    animation: headerFadeIn 0.3s var(--ease-out-expo) both;
}
@keyframes headerFadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Route drawn flash ───────────────────────────────────── */
/* Class sementara saat polyline baru selesai digambar */
@keyframes routeFlash {
    0%   { opacity: 0.3; }
    50%  { opacity: 1;   }
    100% { opacity: 0.85; }
}
.route-flash {
    animation: routeFlash 0.5s ease both;
}

/* ── Polyline draw-on via SVG stroke-dashoffset ──────────── */
/* Kelas diterapkan lewat JS ke <path> SVG Leaflet */
.polyline-draw {
    stroke-dasharray: var(--path-len, 5000);
    stroke-dashoffset: var(--path-len, 5000);
    animation: polylineDraw var(--draw-dur, 1.2s) var(--ease-out-expo) forwards;
}
@keyframes polylineDraw {
    to { stroke-dashoffset: 0; }
}

/* ── Halte layer fade-in ─────────────────────────────────── */
.leaflet-marker-icon.halte-icon {
    animation: halteFadeIn 0.4s ease both;
}
@keyframes halteFadeIn {
    from { opacity: 0; transform: scale(0.7) translateY(6px); }
    to   { opacity: 1; transform: scale(1)   translateY(0); }
}

/* ── Weight card hover ────────────────────────────────────── */
.weight-card {
    transition: transform 0.18s var(--ease-spring),
                box-shadow 0.18s ease !important;
}
.weight-card:hover {
    transform: translateY(-2px) scale(1.03);
}
.weight-card:active {
    transform: scale(0.97);
}
.weight-card.active {
    animation: weightPulse 0.35s var(--ease-spring);
}
@keyframes weightPulse {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.07); }
    100% { transform: scale(1); }
}

/* ── gmaps-card entrance ─────────────────────────────────── */
.gmaps-card {
    animation: gmapsCardPop 0.4s var(--ease-spring) both !important;
}
@keyframes gmapsCardPop {
    from { transform: scale(0.85) translateY(20px); opacity: 0; }
    to   { transform: scale(1)    translateY(0);    opacity: 1; }
}

/* ── Tombol ripple (klik) ────────────────────────────────── */
.btn-ripple {
    position: relative;
    overflow: hidden;
}
.btn-ripple .ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,.35);
    transform: scale(0);
    animation: rippleGrow 0.5s linear;
    pointer-events: none;
}
@keyframes rippleGrow {
    to { transform: scale(4); opacity: 0; }
}

`;
    document.head.appendChild(style);
})();


// ============================================================
// SECTION 2 — SKELETON LOADING
// Tampilkan skeleton saat tombol Cari ditekan, hilang otomatis
// ============================================================

function showSkeletonLoading(panel) {
    panel.innerHTML = `
        <div class="sheet-handle"></div>
        <div class="skeleton-wrap">
            <div class="skel-line" style="height:22px;width:55%"></div>
            <div class="skel-card">
                <div class="skel-line skel-circle" style="width:40px;height:40px"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                    <div class="skel-line" style="height:14px;width:70%"></div>
                    <div class="skel-line" style="height:12px;width:45%"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                    <div class="skel-line" style="height:16px;width:48px"></div>
                    <div class="skel-line" style="height:12px;width:36px"></div>
                </div>
            </div>
            <div class="skel-card">
                <div class="skel-line skel-circle" style="width:40px;height:40px"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                    <div class="skel-line" style="height:14px;width:60%"></div>
                    <div class="skel-line" style="height:12px;width:40%"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                    <div class="skel-line" style="height:16px;width:48px"></div>
                    <div class="skel-line" style="height:12px;width:36px"></div>
                </div>
            </div>
            <div class="skel-card">
                <div class="skel-line skel-circle" style="width:40px;height:40px"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px">
                    <div class="skel-line" style="height:14px;width:65%"></div>
                    <div class="skel-line" style="height:12px;width:50%"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                    <div class="skel-line" style="height:16px;width:48px"></div>
                    <div class="skel-line" style="height:12px;width:36px"></div>
                </div>
            </div>
        </div>`;
    panel.classList.add('active');
}


// ============================================================
// SECTION 3 — POLYLINE DRAW-ON ANIMATION
// Setelah polyline ditambahkan ke peta, animasikan draw-on
// via stroke-dashoffset pada SVG path Leaflet
// ============================================================

function animatePolylineDraw(layer, durationMs = 1100) {
    // Leaflet render SVG; tunggu sebentar agar DOM siap
    requestAnimationFrame(() => {
        const el = layer.getElement?.();
        if (!el) return;

        // Leaflet pakai <path> di dalam SVG
        const path = el.tagName === 'path' ? el : el.querySelector('path');
        if (!path) return;

        const len = path.getTotalLength ? path.getTotalLength() : 2000;
        path.style.setProperty('--path-len', len);
        path.style.setProperty('--draw-dur', durationMs + 'ms');
        path.classList.add('polyline-draw');

        // Bersihkan class setelah animasi agar tidak ganggu ant-trail
        path.addEventListener('animationend', () => {
            path.classList.remove('polyline-draw');
            path.style.removeProperty('--path-len');
            path.style.removeProperty('--draw-dur');
            path.style.strokeDasharray = '';
            path.style.strokeDashoffset = '';
        }, { once: true });
    });
}


// ============================================================
// SECTION 4 — ANT TRAIL (segmen akses jalan/kendaraan)
// Animasikan dashOffset agar garis seolah "mengalir"
// ============================================================

function applyAntTrail(layer) {
    requestAnimationFrame(() => {
        const el = layer.getElement?.();
        if (!el) return;
        const path = el.tagName === 'path' ? el : el.querySelector('path');
        if (!path) return;
        path.classList.add('ant-trail-path');
    });
}


// ============================================================
// SECTION 5 — CO₂ COUNTER ROLL-UP
// Angka naik dari 0 ke target dalam 700ms
// ============================================================

function animateCO2Counter(el, targetValue, decimals = 3, durationMs = 700) {
    if (!el) return;
    const start     = performance.now();
    const startVal  = 0;

    function tick(now) {
        const progress = Math.min((now - start) / durationMs, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startVal + (targetValue - startVal) * eased;
        el.textContent = current.toFixed(decimals) + ' kg CO₂';
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = targetValue.toFixed(decimals) + ' kg CO₂';
    }
    requestAnimationFrame(tick);
}

// Helper: setelah panel detail dirender, cari semua elemen .co2-count dan animasikan
function triggerCO2Counters() {
    document.querySelectorAll('[data-co2]').forEach(el => {
        const val = parseFloat(el.getAttribute('data-co2'));
        if (!isNaN(val)) animateCO2Counter(el, val, 3, 700);
    });
}


// ============================================================
// SECTION 6 — BUTTON RIPPLE EFFECT
// Tambahkan efek ripple pada setiap .search-btn
// ============================================================

function addRipple(e) {
    const btn  = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x    = e.clientX - rect.left - size / 2;
    const y    = e.clientY - rect.top  - size / 2;

    const ripple       = document.createElement('span');
    ripple.className   = 'ripple-effect';
    ripple.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
    `;
    btn.classList.add('btn-ripple');
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

// Pasang ripple ke semua .search-btn — termasuk yang dibuat dinamis
document.addEventListener('click', e => {
    const btn = e.target.closest('.search-btn');
    if (btn) addRipple(e);
});


// ============================================================
// SECTION 7 — SEARCH BUTTON LOADING STATE
// Tombol Cari tampilkan spinner saat proses berjalan
// ============================================================

function setBtnLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.classList.add('loading');
        btn._origText = btn.innerHTML;
    } else {
        btn.classList.remove('loading');
        if (btn._origText) btn.innerHTML = btn._origText;
    }
}


// ============================================================
// SECTION 8 — SMOOTH FLY-TO BOUNDS setelah rute selesai
// Wrap fitBounds Leaflet agar selalu pakai animasi
// ============================================================

function animatedFitBounds(bounds, paddingOptions) {
    map.flyToBounds(bounds, {
        padding    : paddingOptions?.padding || [60, 100],
        animate    : true,
        duration   : 1.2,
        easeLinearity: 0.4,
        ...paddingOptions
    });
}


// ============================================================
// SECTION 9 — PATCH fungsi-fungsi utama di maps.js
// Semua patch dilakukan setelah maps.js selesai load.
// Menggunakan setTimeout(0) agar berjalan setelah stack kosong.
// ============================================================

setTimeout(() => {

    // ── 9A. Patch mainSearchBtn: loading state ────────────────
    const mainSearchBtn = document.querySelector('#routePanel .search-btn');
    if (mainSearchBtn) {
        const origClick = mainSearchBtn.onclick;

        // Intercept via capture — bekerja tanpa harus tahu nama fungsi aslinya
        mainSearchBtn.addEventListener('click', () => {
            setBtnLoading(mainSearchBtn, true);
            // Spinner hilang saat panel rekomendasi muncul (lihat 9C)
        }, true);
    }

    // ── 9B. Patch showPanel: reset animasi setiap kali panel muncul ──
    const origShowPanel = window.showPanel;
    if (origShowPanel) {
        window.showPanel = function(name) {
            origShowPanel(name);
            if (!name) return;

            const panel = document.getElementById(
                name === 'route'       ? 'routePanel'       :
                name === 'prioritas'   ? 'prioritasPanel'   :
                name === 'rekomendasi' ? 'rekomendasiPanel' :
                name === 'detail'      ? 'detailPanel'      : ''
            );
            if (!panel) return;

            // Force reflow → restart CSS animation
            panel.style.animation = 'none';
            panel.offsetHeight;
            panel.style.animation = '';
        };
    }

    // ── 9C. Patch tampilkanPanelRekomendasi ──────────────────
    const origTampilkanPanelRekomendasi = window.tampilkanPanelRekomendasi;
    if (origTampilkanPanelRekomendasi) {
        window.tampilkanPanelRekomendasi = function(...args) {
            // Matikan loading state tombol Cari
            const btn = document.querySelector('#routePanel .search-btn');
            setBtnLoading(btn, false);

            // Tampilkan skeleton 300ms dulu agar terasa responsif
            const panel = document.getElementById('rekomendasiPanel');
            showSkeletonLoading(panel);

            setTimeout(() => {
                origTampilkanPanelRekomendasi.apply(this, args);
            }, 320);
        };
    }

    // ── 9D. Patch tampilkanPanelDetail: CO₂ counters ─────────
    const origTampilkanPanelDetail = window.tampilkanPanelDetail;
    if (origTampilkanPanelDetail) {
        window.tampilkanPanelDetail = function(kendaraan, bobot, ...rest) {
            origTampilkanPanelDetail.apply(this, [kendaraan, bobot, ...rest]);

            // Setelah panel dirender, replace teks emisi dengan counter
            requestAnimationFrame(() => {
                // Cari semua teks yang mengandung "kg CO₂" di panel detail
                const detailPanel = document.getElementById('detailPanel');
                if (!detailPanel) return;

                // Ganti .jt-meta yang mengandung kg CO₂ dengan animated counter
                detailPanel.querySelectorAll('.jt-meta, .biaya-info strong, .rek-right .rek-waktu').forEach(el => {
                    const text = el.textContent;
                    const match = text.match(/([\d.]+)\s*kg CO₂/);
                    if (match) {
                        const val   = parseFloat(match[1]);
                        const parts = text.split(/([\d.]+\s*kg CO₂)/);
                        el.innerHTML = parts.map((p, i) => {
                            const m2 = p.match(/([\d.]+)\s*kg CO₂/);
                            if (m2) {
                                const v = parseFloat(m2[1]);
                                return `<span class="co2-count" data-co2="${v}">0.000 kg CO₂</span>`;
                            }
                            return p;
                        }).join('');
                    }
                });

                // Jalankan counter
                triggerCO2Counters();
            });
        };
    }

    // ── 9E. Patch gambatRuteBus: draw-on + ant trail ──────────
    const origGambatRuteBus = window.gambatRuteBus;
    if (origGambatRuteBus) {
        window.gambatRuteBus = function(kendaraan, ...rest) {
            origGambatRuteBus.apply(this, [kendaraan, ...rest]);

            // Tunggu polyline ditambahkan ke peta, lalu animasikan
            setTimeout(() => {
                activeRouteLayers.forEach((layer, i) => {
                    if (layer instanceof L.Polyline) {
                        const opts = layer.options;
                        if (!opts.dashArray) {
                            // Rute utama bus → draw-on
                            animatePolylineDraw(layer, 900 + i * 80);
                        } else {
                            // Segmen akses (dashed) → ant trail
                            applyAntTrail(layer);
                        }
                    }
                });
            }, 50);
        };
    }

    // ── 9F. Patch tampilkanDetailDanRute: draw-on motor/mobil ─
    const origTampilkanDetailDanRute = window.tampilkanDetailDanRute;
    if (origTampilkanDetailDanRute) {
        window.tampilkanDetailDanRute = function(kendaraan, bobot, ...rest) {
            origTampilkanDetailDanRute.apply(this, [kendaraan, bobot, ...rest]);

            if (kendaraan.id !== 'bus') {
                // Animasikan polyline motor/mobil setelah OSRM selesai
                // Polling ringan: cek apakah layer baru muncul
                let attempts = 0;
                const check = setInterval(() => {
                    attempts++;
                    const poly = activeRouteLayers.find(l => l instanceof L.Polyline && !l.options.dashArray);
                    if (poly) {
                        animatePolylineDraw(poly, 1100);
                        clearInterval(check);
                    }
                    if (attempts > 30) clearInterval(check); // timeout 3 detik
                }, 100);
            }
        };
    }

    // ── 9G. Patch fitBounds → animatedFitBounds ───────────────
    // Hanya untuk panggilan dari dalam maps.js — tidak override global
    const origFitBounds = map.fitBounds.bind(map);
    map.fitBounds = function(bounds, options) {
        // Gunakan flyToBounds untuk animasi smooth
        map.flyToBounds(bounds, {
            padding      : options?.padding || [60, 100],
            animate      : true,
            duration     : 1.1,
            easeLinearity: 0.4,
        });
    };

    // ── 9H. Pasangkan ripple ke konfirmasi Gmaps ──────────────
    document.addEventListener('click', e => {
        const btn = e.target.closest('.gmaps-lanjut, .gmaps-kembali, .back-btn');
        if (btn) addRipple(e);
    });

    console.log('[maps-anim] ✓ Semua patch animasi aktif');

}, 0);


// ============================================================
// SECTION 10 — EKSPOR HELPER (opsional, untuk dipakai di console/debug)
// ============================================================

window.mapsAnim = {
    animatePolylineDraw,
    applyAntTrail,
    animateCO2Counter,
    showSkeletonLoading,
    setBtnLoading,
    animatedFitBounds,
};