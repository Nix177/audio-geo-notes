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
        showToast('📍 Position détectée', 'success');
    }

    map.on('locationfound', onLocationFound);
    map.on('locationerror', () => {
        document.getElementById('location-name').textContent = 'Paris, Marais';
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
    const btnShare = document.getElementById('btn-share');
    let currentNote = null;

    function openModal(note) {
        currentNote = note;
        document.getElementById('modal-title').textContent = note.title;
        document.getElementById('modal-author').textContent = `Par ${note.author}`;
        document.getElementById('modal-icon').textContent = note.icon;
        document.getElementById('modal-likes').textContent = note.likes;
        document.getElementById('modal-plays').textContent = note.plays;
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

        drawWaveform(note.isLive);
        if (!note.isLive) animateProgress(note.duration);

        modal.classList.remove('hidden');
        playSound(note.type, Math.min(note.duration, 2));
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (btnLike) btnLike.addEventListener('click', () => {
        const likesEl = document.getElementById('modal-likes');
        likesEl.textContent = parseInt(likesEl.textContent) + 1;
        btnLike.textContent = '❤️ Merci!';
        showToast('Vote enregistré! 💖', 'success');
    });

    if (btnShare) btnShare.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href);
        showToast('Lien copié! 📋', 'success');
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
    const archiveContent = [
        { title: "Histoire du Marais", category: "🏛️ Patrimoine", icon: "🏛️", type: "guide", author: "Office du Tourisme", duration: 180, baseHealth: 95 },
        { title: "Concert Jazz 1952", category: "🎵 Musique", icon: "🎷", type: "music", author: "Archives Paris", duration: 240, baseHealth: 88 },
        { title: "Témoignage Résistance", category: "📜 Histoire", icon: "📜", type: "story", author: "Mémorial", duration: 300, baseHealth: 92 },
        { title: "Guide Café Flore", category: "☕ Culture", icon: "☕", type: "guide", author: "Guide Local", duration: 120, baseHealth: 85 },
        { title: "Poème Apollinaire", category: "📖 Littérature", icon: "📖", type: "story", author: "BNF Audio", duration: 90, baseHealth: 90 },
        { title: "Ambiance Marché", category: "🎧 Ambiance", icon: "🎧", type: "music", author: "Sound Designer", duration: 60, baseHealth: 75 },
        { title: "Anecdote Picasso", category: "🎨 Art", icon: "🎨", type: "story", author: "Musée Picasso", duration: 150, baseHealth: 88 }
    ];

    const liveContent = [
        { title: "Jazz Session", category: "🎵 Live", icon: "🎷", type: "live", author: "Piano Bar", listeners: 12 },
        { title: "Visite Guidée", category: "🎙️ Live", icon: "🎙️", type: "live", author: "Marie Guide", listeners: 8 },
        { title: "Podcast Urbain", category: "🎧 Live", icon: "🎧", type: "live", author: "Radio Marais", listeners: 23 },
        { title: "Cours de Dessin", category: "🎨 Live", icon: "🎨", type: "live", author: "Atelier 75", listeners: 5 }
    ];

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

        const fullNote = {
            ...note,
            coords: coords,
            isLive: isLive,
            likes: Math.floor(Math.random() * 80) + 20,
            plays: Math.floor(Math.random() * 300) + 50,
            duration: note.duration || 120,
            listeners: note.listeners || 0
        };

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
        const maxMarkers = currentMode === 'live' ? 3 : 5;

        // Generate positions within bounds
        for (let i = 0; i < Math.min(content.length, maxMarkers); i++) {
            const lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
            const lng = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
            addMarkerWithLimit(content[i], [lat, lng], currentMode === 'live');
        }
    }

    // Initial load
    refreshMarkers();
    map.on('moveend', refreshMarkers);

    // =========================================
    // 10. RECORDING WITH VOTE SYSTEM
    // =========================================
    const recordBtn = document.getElementById('record-btn');
    let isRecording = false;
    let recordingTimer = null;

    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (currentMode === 'live') {
                startLiveStream();
            } else {
                isRecording ? stopRecording() : startRecording();
            }
        });
    }

    function startRecording() {
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-text').textContent = 'Stop';
        recordBtn.querySelector('.record-icon').textContent = '⏹️';
        showToast('🎙️ Enregistrement... (max 10 min)', 'info');

        recordingTimer = setTimeout(() => {
            stopRecording();
            showToast('⏱️ Limite atteinte', 'info');
        }, 10 * 60 * 1000);
    }

    function stopRecording() {
        isRecording = false;
        clearTimeout(recordingTimer);
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-text').textContent = currentMode === 'live' ? 'Go Live' : 'Créer';
        recordBtn.querySelector('.record-icon').textContent = currentMode === 'live' ? '📡' : '🎙️';

        // Show vote confirmation
        showVoteModal();
    }

    function startLiveStream() {
        showToast('📡 Vous êtes en direct!', 'live');
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-text').textContent = 'Stop Live';

        // Add live marker at current position
        const center = map.getCenter();
        const liveNote = {
            title: "Mon Stream",
            category: "🎙️ Live",
            icon: "🎙️",
            type: "live",
            author: "Vous",
            listeners: 1
        };
        addMarkerWithLimit(liveNote, [center.lat, center.lng], true);
    }

    function showVoteModal() {
        // Simple confirmation - in real app this would be a proper modal
        showToast('📤 Note soumise au vote communautaire!', 'success');
        setTimeout(() => {
            showToast('✅ 5 votes reçus - Note publiée!', 'success');
        }, 2000);
    }

    // Update button text based on mode
    function updateRecordButton() {
        if (!recordBtn) return;
        const icon = recordBtn.querySelector('.record-icon');
        const text = recordBtn.querySelector('.record-text');

        if (currentMode === 'live') {
            icon.textContent = '📡';
            text.textContent = 'Go Live';
        } else {
            icon.textContent = '🎙️';
            text.textContent = 'Créer';
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
