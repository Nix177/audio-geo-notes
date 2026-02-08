document.addEventListener('DOMContentLoaded', () => {
    // =========================================
    // 1. TOAST NOTIFICATION SYSTEM
    // =========================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'live' ? '🔴' : '📍'}</span> ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    const API_BASE_URL = window.VOCAL_WALLS_API_BASE || 'http://localhost:4000';
    let apiOnline = false;
    let apiOnlineToastShown = false;
    let apiOfflineToastShown = false;

    let archiveContent = [];
    let liveContent = [];

    function toInt(value, fallback = 0) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, Math.round(parsed));
    }

    function normalizeNote(note, fallbackIsLive = false) {
        const isLive = typeof note.isLive === 'boolean' ? note.isLive : fallbackIsLive;
        return {
            ...note,
            id: note.id || `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            title: note.title || 'Note audio',
            category: note.category || (isLive ? '🎙️ Live' : '🎧 Ambiance'),
            icon: note.icon || '🎧',
            type: note.type || (isLive ? 'live' : 'story'),
            author: note.author || 'Anonyme',
            duration: Math.max(10, toInt(note.duration, 120)),
            baseHealth: toInt(note.baseHealth, 80),
            likes: toInt(note.likes, 0),
            downvotes: toInt(note.downvotes, 0),
            reports: toInt(note.reports, 0),
            plays: toInt(note.plays, 0),
            listeners: toInt(note.listeners, 0),
            lat: Number.isFinite(Number(note.lat)) ? Number(note.lat) : null,
            lng: Number.isFinite(Number(note.lng)) ? Number(note.lng) : null,
            isLive: isLive,
            viewerVote: note.viewerVote || null,
            viewerReported: Boolean(note.viewerReported)
        };
    }

    function setApiStatus(isOnline, silent = false) {
        apiOnline = isOnline;
        if (isOnline) {
            apiOfflineToastShown = false;
            if (!apiOnlineToastShown && !silent) {
                showToast('Backend connecté - synchronisation active', 'success');
                apiOnlineToastShown = true;
            }
            return;
        }

        apiOnlineToastShown = false;
        if (!apiOfflineToastShown && !silent) {
            showToast('Backend indisponible - mode local actif', 'info');
            apiOfflineToastShown = true;
        }
    }

    async function apiRequest(path, options = {}) {
        const requestOptions = {
            method: options.method || 'GET',
            headers: { ...(options.headers || {}) }
        };
        if (options.body !== undefined) {
            requestOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
            requestOptions.headers['content-type'] = 'application/json';
        }

        const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        return payload.data;
    }

    function findNoteById(noteId) {
        return archiveContent.find((note) => note.id === noteId) || liveContent.find((note) => note.id === noteId) || null;
    }

    function upsertNote(note) {
        const normalized = normalizeNote(note, note.isLive);
        archiveContent = archiveContent.filter((entry) => entry.id !== normalized.id);
        liveContent = liveContent.filter((entry) => entry.id !== normalized.id);
        if (normalized.isLive) {
            liveContent.unshift(normalized);
        } else {
            archiveContent.unshift(normalized);
        }
        return normalized;
    }

    async function loadNotesFromApi(silent = false) {
        try {
            const [archiveData, liveData] = await Promise.all([
                apiRequest('/api/notes?mode=archive'),
                apiRequest('/api/notes?mode=live')
            ]);
            archiveContent = archiveData.map((note) => normalizeNote(note, false));
            liveContent = liveData.map((note) => normalizeNote(note, true));
            setApiStatus(true, silent);
            refreshMarkers();
        } catch (error) {
            setApiStatus(false, silent);
        }
    }

    async function createNoteThroughApi(notePayload) {
        if (apiOnline) {
            try {
                const created = await apiRequest('/api/notes', {
                    method: 'POST',
                    body: notePayload
                });
                return normalizeNote(created, notePayload.isLive);
            } catch (error) {
                setApiStatus(false, true);
            }
        }

        return normalizeNote({
            ...notePayload,
            id: `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            likes: 0,
            downvotes: 0,
            reports: 0,
            plays: 0
        }, notePayload.isLive);
    }

    // =========================================
    // 2. INITIALIZE MAP
    // =========================================
    const startCoords = [48.8566, 2.3522];
    const map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView(startCoords, 17); // Higher zoom for detail

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
    }).addTo(map);

    function updateZoneLabel(lat, lng) {
        const cell = document.getElementById('h3-cell');
        if (!cell) return;
        cell.textContent = `Zone: ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    }

    // =========================================
    // 3. MODE SYSTEM (Archive / Live)
    // =========================================
    let currentMode = 'archive'; // 'archive' or 'live'
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabel = document.getElementById('mode-label');

    if (modeToggle) {
        modeToggle.addEventListener('click', () => {
            currentMode = currentMode === 'archive' ? 'live' : 'archive';
            updateModeUI();
            updateRecordButton();
            refreshMarkers();
        });
    }

    function updateModeUI() {
        if (!modeLabel) return;
        if (currentMode === 'live') {
            modeLabel.textContent = '🔴 LIVE';
            modeLabel.classList.add('live');
            showToast('Mode Live activé - Streams en direct', 'live');
        } else {
            modeLabel.textContent = '📚 Archive';
            modeLabel.classList.remove('live');
            showToast('Mode Archive - Contenus validés', 'info');
        }
    }

    // =========================================
    // 4. USER GEOLOCATION
    // =========================================
    map.locate({ setView: true, maxZoom: 17 });

    const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="width: 14px; height: 14px; background: #3742fa; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #3742fa;"></div>',
        iconSize: [14, 14]
    });

    function onLocationFound(e) {
        L.marker(e.latlng, { icon: userIcon }).addTo(map);
        document.getElementById('location-name').textContent = 'Votre position';
        updateZoneLabel(e.latlng.lat, e.latlng.lng);
        showToast('📍 Position détectée', 'success');
    }

    map.on('locationfound', onLocationFound);
    map.on('locationerror', () => {
        document.getElementById('location-name').textContent = 'Paris, Marais';
        const center = map.getCenter();
        updateZoneLabel(center.lat, center.lng);
        showToast('Mode démo (Paris)', 'info');
    });

    // =========================================
    // 5. AUDIO ENGINE
    // =========================================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type, duration = 2) {
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const sounds = {
            guide: { freq: 330, type: 'sine' },
            story: { freq: 440, type: 'triangle' },
            music: { freq: 520, type: 'sawtooth' },
            live: { freq: 280, type: 'square' }
        };

        const sound = sounds[type] || sounds.story;
        osc.type = sound.type;
        osc.frequency.value = sound.freq;

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // =========================================
    // 6. MODAL SYSTEM
    // =========================================
    const modal = document.getElementById('audio-modal');
    const modalClose = document.getElementById('modal-close');
    const btnLike = document.getElementById('btn-like');
    const btnDislike = document.getElementById('btn-dislike');
    const btnShare = document.getElementById('btn-share');
    const btnReport = document.getElementById('btn-report');
    const modalScore = document.getElementById('modal-score');
    const modalDownvotes = document.getElementById('modal-downvotes');
    const modalReports = document.getElementById('modal-reports');
    const modalStatus = document.getElementById('modal-status');
    let currentNote = null;

    function computeVisibleScore(note) {
        return note.likes - note.downvotes - note.reports * 2;
    }

    function getModerationStatus(note) {
        const score = computeVisibleScore(note);
        if (note.reports >= 4 || score <= -10) {
            return { label: 'Contenu sous revue communautaire', className: 'critical' };
        }
        if (note.reports >= 2 || score < 20) {
            return { label: 'Visibilité réduite (signalements actifs)', className: 'warning' };
        }
        return { label: 'Contenu normal', className: 'ok' };
    }

    function updateVoteButtons() {
        if (!currentNote) return;
        if (btnLike) {
            btnLike.textContent = currentNote.viewerVote === 'like' ? 'Like ✓' : 'Like';
            btnLike.classList.toggle('active', currentNote.viewerVote === 'like');
        }
        if (btnDislike) {
            btnDislike.textContent = currentNote.viewerVote === 'dislike' ? 'Downvote ✓' : 'Downvote';
            btnDislike.classList.toggle('active', currentNote.viewerVote === 'dislike');
        }
        if (btnReport) {
            btnReport.disabled = Boolean(currentNote.viewerReported);
            btnReport.textContent = currentNote.viewerReported ? 'Signalé' : 'Reporter ce contenu';
        }
    }

    function updateModerationUI() {
        if (!currentNote) return;
        modalScore.textContent = computeVisibleScore(currentNote);
        modalDownvotes.textContent = currentNote.downvotes;
        modalReports.textContent = currentNote.reports;

        const status = getModerationStatus(currentNote);
        modalStatus.textContent = status.label;
        modalStatus.classList.remove('ok', 'warning', 'critical');
        modalStatus.classList.add(status.className);

        updateVoteButtons();
    }

    function applyServerNoteUpdate(serverNote) {
        const existing = findNoteById(serverNote.id);
        const merged = normalizeNote({
            ...(existing || {}),
            ...serverNote
        }, serverNote.isLive);
        const updated = upsertNote(merged);
        if (currentNote && currentNote.id === updated.id) {
            currentNote = {
                ...currentNote,
                ...updated
            };
            document.getElementById('modal-likes').textContent = currentNote.likes;
            document.getElementById('modal-plays').textContent = currentNote.plays;
            updateModerationUI();
        }
        refreshMarkers();
    }

    async function syncPlayCount(noteId) {
        if (!apiOnline || !noteId) return;
        try {
            const updated = await apiRequest(`/api/notes/${noteId}/play`, {
                method: 'POST'
            });
            applyServerNoteUpdate(updated);
        } catch (error) {
            setApiStatus(false, true);
        }
    }

    function openModal(note) {
        currentNote = note;
        currentNote.plays += 1;
        upsertNote(currentNote);
        document.getElementById('modal-title').textContent = note.title;
        document.getElementById('modal-author').textContent = `Par ${note.author}`;
        document.getElementById('modal-icon').textContent = note.icon;
        document.getElementById('modal-likes').textContent = currentNote.likes;
        document.getElementById('modal-plays').textContent = currentNote.plays;
        document.getElementById('modal-time').textContent = `0:00 / ${formatDuration(note.duration)}`;
        document.getElementById('modal-category').textContent = note.category;

        // Live indicator
        const liveIndicator = document.getElementById('modal-live');
        if (note.isLive) {
            liveIndicator.classList.remove('hidden');
            liveIndicator.textContent = `🔴 ${note.listeners} à l'écoute`;
        } else {
            liveIndicator.classList.add('hidden');
        }

        updateModerationUI();
        drawWaveform(note.isLive);
        if (!note.isLive) animateProgress(note.duration);

        modal.classList.remove('hidden');
        playSound(note.type, Math.min(note.duration, 2));
        void syncPlayCount(currentNote.id);
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (btnLike) btnLike.addEventListener('click', async () => {
        if (!currentNote) return;
        if (currentNote.viewerVote) {
            showToast('Vote déjà enregistré pour cette note', 'info');
            return;
        }

        currentNote.viewerVote = 'like';
        currentNote.likes += 1;
        upsertNote(currentNote);
        document.getElementById('modal-likes').textContent = currentNote.likes;
        updateModerationUI();
        showToast('Vote positif enregistré', 'success');

        if (!apiOnline || !currentNote.id) return;
        try {
            const updated = await apiRequest(`/api/notes/${currentNote.id}/votes`, {
                method: 'POST',
                body: { type: 'like' }
            });
            applyServerNoteUpdate(updated);
        } catch (error) {
            setApiStatus(false, true);
        }
    });

    if (btnDislike) btnDislike.addEventListener('click', async () => {
        if (!currentNote) return;
        if (currentNote.viewerVote) {
            showToast('Vote déjà enregistré pour cette note', 'info');
            return;
        }

        currentNote.viewerVote = 'dislike';
        currentNote.downvotes += 1;
        upsertNote(currentNote);
        document.getElementById('modal-likes').textContent = currentNote.likes;
        updateModerationUI();
        showToast('Downvote enregistré', 'info');

        if (!apiOnline || !currentNote.id) return;
        try {
            const updated = await apiRequest(`/api/notes/${currentNote.id}/votes`, {
                method: 'POST',
                body: { type: 'dislike' }
            });
            applyServerNoteUpdate(updated);
        } catch (error) {
            setApiStatus(false, true);
        }
    });

    if (btnReport) btnReport.addEventListener('click', async () => {
        if (!currentNote || currentNote.viewerReported) return;
        currentNote.viewerReported = true;
        currentNote.reports += 1;
        upsertNote(currentNote);
        updateModerationUI();
        showToast('Contenu signalé à la modération', 'info');

        if (!apiOnline || !currentNote.id) return;
        try {
            const updated = await apiRequest(`/api/notes/${currentNote.id}/report`, {
                method: 'POST'
            });
            applyServerNoteUpdate(updated);
        } catch (error) {
            setApiStatus(false, true);
        }
    });

    if (btnShare) btnShare.addEventListener('click', async () => {
        const shareUrl = currentNote ? `${window.location.href}#note=${encodeURIComponent(currentNote.id)}` : window.location.href;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
            await navigator.clipboard.writeText(shareUrl);
            showToast('Lien copié! 📋', 'success');
        } catch (error) {
            showToast('Copie impossible sur ce navigateur', 'info');
        }
    });

    function formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function drawWaveform(isLive) {
        const canvas = document.getElementById('waveform');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 35;
        const barWidth = canvas.width / bars;
        const color = isLive ? '#ff4757' : '#ff6b81';

        for (let i = 0; i < bars; i++) {
            const height = Math.random() * 35 + 8;
            const y = (canvas.height - height) / 2;
            ctx.fillStyle = i < bars * 0.3 ? color : `${color}50`;
            ctx.fillRect(i * barWidth + 1, y, barWidth - 2, height);
        }
    }

    function animateProgress(duration) {
        const progress = document.getElementById('waveform-progress');
        if (!progress) return;
        progress.style.width = '0%';
        progress.style.transition = `width ${Math.min(duration, 3)}s linear`;
        setTimeout(() => progress.style.width = '100%', 50);
    }

    // =========================================
    // 7. REALISTIC USE CASES (Content Database)
    // =========================================
    archiveContent = [
        {
            id: 'local_marais_history',
            title: "Histoire du Marais",
            category: "🏛️ Patrimoine",
            icon: "🏛️",
            type: "guide",
            author: "Office du Tourisme",
            duration: 180,
            baseHealth: 95,
            lat: 48.85818,
            lng: 2.35812,
            likes: 42,
            downvotes: 3,
            reports: 0,
            plays: 128
        },
        {
            id: 'local_jazz_1952',
            title: "Concert Jazz 1952",
            category: "🎵 Musique",
            icon: "🎷",
            type: "music",
            author: "Archives Paris",
            duration: 240,
            baseHealth: 88,
            lat: 48.8564,
            lng: 2.3529,
            likes: 55,
            downvotes: 6,
            reports: 1,
            plays: 214
        },
        {
            id: 'local_resistance_story',
            title: "Témoignage Résistance",
            category: "📜 Histoire",
            icon: "📜",
            type: "story",
            author: "Mémorial",
            duration: 300,
            baseHealth: 92,
            lat: 48.8601,
            lng: 2.3542,
            likes: 63,
            downvotes: 2,
            reports: 0,
            plays: 301
        },
        {
            id: 'local_cafe_flore',
            title: "Guide Café Flore",
            category: "☕ Culture",
            icon: "☕",
            type: "guide",
            author: "Guide Local",
            duration: 120,
            baseHealth: 85,
            lat: 48.8548,
            lng: 2.3331,
            likes: 38,
            downvotes: 5,
            reports: 0,
            plays: 167
        },
        {
            id: 'local_apollinaire',
            title: "Poème Apollinaire",
            category: "📖 Littérature",
            icon: "📖",
            type: "story",
            author: "BNF Audio",
            duration: 90,
            baseHealth: 90,
            lat: 48.8534,
            lng: 2.3487,
            likes: 44,
            downvotes: 1,
            reports: 0,
            plays: 146
        }
    ].map((note) => normalizeNote(note, false));

    liveContent = [
        {
            id: 'local_live_jazz',
            title: "Jazz Session",
            category: "🎵 Live",
            icon: "🎷",
            type: "live",
            author: "Piano Bar",
            listeners: 12,
            duration: 180,
            baseHealth: 80,
            lat: 48.8577,
            lng: 2.3502,
            likes: 26,
            downvotes: 1,
            reports: 0,
            plays: 89,
            isLive: true
        },
        {
            id: 'local_live_guide',
            title: "Visite Guidée",
            category: "🎙️ Live",
            icon: "🎙️",
            type: "live",
            author: "Marie Guide",
            listeners: 8,
            duration: 180,
            baseHealth: 79,
            lat: 48.8593,
            lng: 2.3605,
            likes: 30,
            downvotes: 2,
            reports: 0,
            plays: 104,
            isLive: true
        },
        {
            id: 'local_live_podcast',
            title: "Podcast Urbain",
            category: "🎧 Live",
            icon: "🎧",
            type: "live",
            author: "Radio Marais",
            listeners: 23,
            duration: 180,
            baseHealth: 78,
            lat: 48.8559,
            lng: 2.3561,
            likes: 34,
            downvotes: 4,
            reports: 1,
            plays: 122,
            isLive: true
        }
    ].map((note) => normalizeNote(note, true));

    // =========================================
    // 8. SMALLER BUBBLE MARKERS
    // =========================================
    const bubbleIcon = (note, isLive = false) => {
        const size = isLive ? 50 : 45;
        const borderColor = isLive ? '#ff4757' : (note.baseHealth > 85 ? '#2ed573' : '#ffa502');
        const bgColor = isLive ? 'rgba(255, 71, 87, 0.25)' : 'rgba(46, 213, 115, 0.15)';
        const pulseClass = isLive ? 'pulse-live' : 'pulse';

        const html = `
            <div class="bubble-mini ${pulseClass}" style="
                width: ${size}px; 
                height: ${size}px; 
                border-color: ${borderColor}; 
                background: ${bgColor};
            ">
                <span class="bubble-icon">${note.icon}</span>
                ${isLive ? '<span class="live-dot"></span>' : ''}
            </div>
        `;

        return L.divIcon({
            className: 'custom-bubble-mini',
            html: html,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
    };

    // =========================================
    // 9. SMART CLUSTERING (for dense areas)
    // =========================================
    const markersLayer = L.layerGroup().addTo(map);
    let allMarkers = [];

    function clearMarkers() {
        markersLayer.clearLayers();
        allMarkers = [];
    }

    function addMarkerWithLimit(note, coords, isLive = false) {
        // Check proximity to existing markers (avoid overlap)
        const minDistance = 0.0003; // ~30 meters
        const tooClose = allMarkers.some(m => {
            const d = Math.sqrt(
                Math.pow(m.coords[0] - coords[0], 2) +
                Math.pow(m.coords[1] - coords[1], 2)
            );
            return d < minDistance;
        });

        if (tooClose && allMarkers.length > 3) return; // Skip if too close and we have enough

        const fullNote = normalizeNote({
            ...note,
            lat: coords[0],
            lng: coords[1],
            isLive: isLive
        }, isLive);

        const marker = L.marker(coords, {
            icon: bubbleIcon(note, isLive)
        });

        marker.on('click', () => openModal(fullNote));
        marker.addTo(markersLayer);
        allMarkers.push({ coords, marker });
    }

    function refreshMarkers() {
        clearMarkers();
        const bounds = map.getBounds();
        const content = currentMode === 'live' ? liveContent : archiveContent;
        const maxMarkers = currentMode === 'live' ? 6 : 10;

        for (let i = 0; i < Math.min(content.length, maxMarkers); i++) {
            const note = content[i];
            const hasCoords = Number.isFinite(Number(note.lat)) && Number.isFinite(Number(note.lng));
            const lat = hasCoords ? Number(note.lat) : bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
            const lng = hasCoords ? Number(note.lng) : bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
            addMarkerWithLimit(note, [lat, lng], currentMode === 'live');
        }
    }

    // Initial load
    refreshMarkers();
    {
        const center = map.getCenter();
        updateZoneLabel(center.lat, center.lng);
    }
    map.on('moveend', () => {
        const center = map.getCenter();
        updateZoneLabel(center.lat, center.lng);
        refreshMarkers();
    });
    void loadNotesFromApi(false);
    setInterval(() => {
        void loadNotesFromApi(true);
    }, 30000);

    // =========================================
    // 10. RECORDING WITH VOTE SYSTEM
    // =========================================
    const recordBtn = document.getElementById('record-btn');
    let isRecording = false;
    let recordingTimer = null;
    let isLiveStreaming = false;

    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (currentMode === 'live') {
                isLiveStreaming ? stopLiveStream() : void startLiveStream();
            } else {
                isRecording ? void stopRecording() : startRecording();
            }
        });
    }

    function buildUserNotePayload(isLiveNote) {
        const center = map.getCenter();
        const timeLabel = new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        return {
            title: isLiveNote ? `Live utilisateur (${timeLabel})` : `Capsule locale (${timeLabel})`,
            category: isLiveNote ? '🎙️ Live' : '🎧 Communauté',
            icon: isLiveNote ? '🎙️' : '🎧',
            type: isLiveNote ? 'live' : 'story',
            author: 'Vous',
            duration: isLiveNote ? 180 : 120,
            isLive: isLiveNote,
            listeners: isLiveNote ? 1 : 0,
            lat: center.lat,
            lng: center.lng
        };
    }

    async function publishUserNote(isLiveNote) {
        const created = await createNoteThroughApi(buildUserNotePayload(isLiveNote));
        upsertNote(created);
        refreshMarkers();
        if (isLiveNote) {
            showToast('📡 Vous êtes en direct!', 'live');
        } else {
            showToast('📤 Note publiée sur la carte', 'success');
        }
    }

    function startRecording() {
        isRecording = true;
        updateRecordButton();
        showToast('🎙️ Enregistrement... (max 10 min)', 'info');

        recordingTimer = setTimeout(() => {
            void stopRecording();
            showToast('⏱️ Limite atteinte', 'info');
        }, 10 * 60 * 1000);
    }

    async function stopRecording() {
        isRecording = false;
        clearTimeout(recordingTimer);
        recordingTimer = null;
        updateRecordButton();
        await publishUserNote(false);
    }

    async function startLiveStream() {
        isLiveStreaming = true;
        updateRecordButton();
        await publishUserNote(true);
    }

    function stopLiveStream() {
        isLiveStreaming = false;
        updateRecordButton();
        showToast('Live terminé', 'info');
    }

    // Update button text based on mode
    function updateRecordButton() {
        if (!recordBtn) return;
        const icon = recordBtn.querySelector('.record-icon');
        const text = recordBtn.querySelector('.record-text');
        if (!icon || !text) return;

        if (currentMode === 'live') {
            if (isLiveStreaming) {
                icon.textContent = '⏹️';
                text.textContent = 'Stop Live';
                recordBtn.classList.add('recording');
            } else {
                icon.textContent = '📡';
                text.textContent = 'Go Live';
                recordBtn.classList.remove('recording');
            }
        } else {
            if (isRecording) {
                icon.textContent = '⏹️';
                text.textContent = 'Stop';
                recordBtn.classList.add('recording');
            } else {
                icon.textContent = '🎙️';
                text.textContent = 'Créer';
                recordBtn.classList.remove('recording');
            }
        }
    }

    // =========================================
    // 11. ANIMATED STATS
    // =========================================
    function animateStats() {
        const statNumbers = document.querySelectorAll('.stat-number');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.dataset.target);
                    animateValue(el, 0, target, 2000);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        statNumbers.forEach(el => observer.observe(el));
    }

    function animateValue(el, start, end, duration) {
        const range = end - start;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + range * easeOut);

            el.textContent = current.toLocaleString() + (el.dataset.target === '85' ? '%' : '+');

            if (progress < 1) requestAnimationFrame(update);
        }

        requestAnimationFrame(update);
    }

    updateRecordButton();
    animateStats();

    // =========================================
    // 12. SMOOTH SCROLL
    // =========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // Initial toast
    setTimeout(() => showToast('👋 Bienvenue! Cliquez sur une bulle', 'info'), 800);
});

