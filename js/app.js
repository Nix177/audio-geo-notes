document.addEventListener('DOMContentLoaded', () => {
    // =========================================
    // 1. TOAST NOTIFICATION SYSTEM
    // =========================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : '📍'}</span> ${message}`;
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
    }).setView(startCoords, 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
    }).addTo(map);

    // =========================================
    // 3. USER GEOLOCATION
    // =========================================
    map.locate({ setView: true, maxZoom: 16 });

    const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="width: 20px; height: 20px; background: #3742fa; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 15px #3742fa;"></div>',
        iconSize: [20, 20]
    });

    function onLocationFound(e) {
        L.marker(e.latlng, { icon: userIcon }).addTo(map);
        document.getElementById('location-name').textContent = 'Votre position';
        document.getElementById('h3-cell').textContent = 'H3: ' + generateH3Cell();
        showToast('📍 Position détectée !', 'success');
    }

    function generateH3Cell() {
        return '89283' + Math.random().toString(36).substring(2, 8);
    }

    map.on('locationfound', onLocationFound);

    map.on('locationerror', () => {
        document.getElementById('location-name').textContent = 'Rue de Rivoli, Paris';
        document.getElementById('h3-cell').textContent = 'H3: 8928308280fffff';
        showToast('Mode démo activé (Paris)', 'info');
    });

    // =========================================
    // 4. AUDIO ENGINE
    // =========================================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type, duration = 2) {
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'jazz') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(330, audioCtx.currentTime + 0.3);
            osc.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.6);
        } else if (type === 'secret') {
            osc.type = 'triangle';
            osc.frequency.value = 600;
        } else {
            osc.type = 'sawtooth';
            osc.frequency.value = 300;
        }

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    // =========================================
    // 5. MODAL SYSTEM
    // =========================================
    const modal = document.getElementById('audio-modal');
    const modalClose = document.getElementById('modal-close');
    const btnLike = document.getElementById('btn-like');
    const btnShare = document.getElementById('btn-share');
    let currentNote = null;

    function openModal(note) {
        currentNote = note;
        document.getElementById('modal-title').textContent = note.label;
        document.getElementById('modal-author').textContent = `Par @${note.author || 'anonyme'}`;
        document.getElementById('modal-icon').textContent = note.type === 'jazz' ? '🎷' : '🔮';
        document.getElementById('modal-likes').textContent = note.likes || Math.floor(Math.random() * 100);
        document.getElementById('modal-plays').textContent = note.plays || Math.floor(Math.random() * 500);
        document.getElementById('modal-time').textContent = `0:00 / ${formatDuration(note.duration)}`;

        drawWaveform();
        animateProgress(note.duration);

        modal.classList.remove('hidden');
        playSound(note.type, Math.min(note.duration, 3));
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    btnLike.addEventListener('click', () => {
        const likesEl = document.getElementById('modal-likes');
        likesEl.textContent = parseInt(likesEl.textContent) + 1;
        btnLike.textContent = '❤️ Liked!';
        btnLike.style.background = 'var(--accent-color)';
        btnLike.style.color = 'white';
        showToast('Merci pour le like! 💖', 'success');
    });

    btnShare.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: 'Vocal Walls',
                text: `Écoute cette bulle sonore: ${currentNote?.label}`,
                url: window.location.href
            });
        } else {
            navigator.clipboard.writeText(window.location.href);
            showToast('Lien copié! 📋', 'success');
        }
    });

    function formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function drawWaveform() {
        const canvas = document.getElementById('waveform');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 40;
        const barWidth = canvas.width / bars;

        for (let i = 0; i < bars; i++) {
            const height = Math.random() * 40 + 10;
            const y = (canvas.height - height) / 2;

            ctx.fillStyle = i < bars * 0.3 ? '#ff4757' : 'rgba(255, 71, 87, 0.3)';
            ctx.fillRect(i * barWidth + 1, y, barWidth - 2, height);
        }
    }

    function animateProgress(duration) {
        const progress = document.getElementById('waveform-progress');
        progress.style.width = '0%';
        progress.style.transition = `width ${Math.min(duration, 3)}s linear`;
        setTimeout(() => progress.style.width = '100%', 50);
    }

    // =========================================
    // 6. BUBBLE MARKERS
    // =========================================
    const bubbleIcon = (type, label, health) => {
        const isSecret = type === 'secret';
        const color = isSecret ? '#2ed573' : '#ff4757';
        const colorStyle = isSecret
            ? `border-color: ${color}; background: rgba(46, 213, 115, 0.2);`
            : '';

        const html = `
            <div class="bubble-marker ${type}" style="${colorStyle}">
                <div>
                    <span>${label}</span>
                    <div class="decay-bar" style="width: 50px;">
                        <div class="decay-fill" style="width: ${health}%; ${isSecret ? `background: ${color};` : ''}"></div>
                    </div>
                </div>
            </div>
        `;

        return L.divIcon({
            className: 'custom-bubble',
            html: html,
            iconSize: [100, 100],
            iconAnchor: [50, 50]
        });
    };

    // =========================================
    // 7. LAZY LOADING (VIEWPORT BASED)
    // =========================================
    const markersLayer = L.layerGroup().addTo(map);
    const noteLabels = {
        jazz: ['Jazz Club', 'Rumeur', 'Mélodie', 'Groove', 'Session'],
        secret: ['Secret', 'Mystère', 'Légende', 'Écho', 'Whisper']
    };
    const authors = ['paul_75', 'marie_16', 'historien_paris', 'artiste_urbain', 'guide_local'];

    function generateMockNotes(bounds) {
        const notes = [];
        const count = Math.floor(Math.random() * 3) + 2;

        for (let i = 0; i < count; i++) {
            const lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
            const lng = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
            const type = Math.random() > 0.5 ? 'jazz' : 'secret';
            const labels = noteLabels[type];

            notes.push({
                coords: [lat, lng],
                type: type,
                label: labels[Math.floor(Math.random() * labels.length)],
                health: Math.floor(Math.random() * 60) + 40,
                duration: Math.floor(Math.random() * 540) + 60, // 1-10 min
                author: authors[Math.floor(Math.random() * authors.length)],
                likes: Math.floor(Math.random() * 100),
                plays: Math.floor(Math.random() * 500)
            });
        }
        return notes;
    }

    function loadNotesInViewport() {
        const bounds = map.getBounds();
        const newNotes = generateMockNotes(bounds);

        newNotes.forEach(note => {
            const marker = L.marker(note.coords, {
                icon: bubbleIcon(note.type, note.label, note.health)
            });

            marker.on('click', () => openModal(note));
            marker.addTo(markersLayer);
        });
    }

    // Initial notes
    const initialNotes = [
        { coords: [48.8566, 2.3522], type: 'jazz', label: 'Jazz Club', health: 85, duration: 150, author: 'paul_75', likes: 42, plays: 128 },
        { coords: [48.8575, 2.3530], type: 'secret', label: 'Secret', health: 45, duration: 300, author: 'historien_paris', likes: 89, plays: 312 },
        { coords: [48.8555, 2.3510], type: 'jazz', label: 'Groove', health: 70, duration: 180, author: 'artiste_urbain', likes: 23, plays: 67 }
    ];

    initialNotes.forEach(note => {
        const marker = L.marker(note.coords, {
            icon: bubbleIcon(note.type, note.label, note.health)
        });
        marker.on('click', () => openModal(note));
        marker.addTo(markersLayer);
    });

    map.on('moveend', loadNotesInViewport);

    // =========================================
    // 8. RECORDING SIMULATION
    // =========================================
    const recordBtn = document.getElementById('record-btn');
    let isRecording = false;
    let recordingTimer = null;

    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });

    function startRecording() {
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.record-text').textContent = 'Arrêter';
        recordBtn.querySelector('.record-icon').textContent = '⏹️';
        showToast('🎙️ Enregistrement... (max 10 min)', 'info');

        // Auto-stop after 10 minutes
        recordingTimer = setTimeout(() => {
            stopRecording();
            showToast('⏱️ Limite de 10 min atteinte', 'info');
        }, 10 * 60 * 1000);
    }

    function stopRecording() {
        isRecording = false;
        clearTimeout(recordingTimer);
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-text').textContent = 'Enregistrer';
        recordBtn.querySelector('.record-icon').textContent = '🎙️';

        // Add a new bubble at current map center
        const center = map.getCenter();
        const newNote = {
            coords: [center.lat, center.lng],
            type: 'jazz',
            label: 'Ma Note',
            health: 100,
            duration: Math.floor(Math.random() * 300) + 60,
            author: 'vous',
            likes: 0,
            plays: 0
        };

        const marker = L.marker(newNote.coords, {
            icon: bubbleIcon(newNote.type, newNote.label, newNote.health)
        });
        marker.on('click', () => openModal(newNote));
        marker.addTo(markersLayer);

        showToast('✅ Note créée avec succès!', 'success');
    }

    // =========================================
    // 9. ANIMATED STATS
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

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    animateStats();

    // =========================================
    // 10. SMOOTH SCROLL
    // =========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Initial toast
    setTimeout(() => {
        showToast('👋 Bienvenue sur Vocal Walls!', 'info');
    }, 1000);
});
