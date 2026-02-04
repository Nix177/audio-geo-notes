document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Map
    // Coordinates for Rue de Rivoli, Paris (Fallback)
    const startCoords = [48.8566, 2.3522];
    const map = L.map('map', {
        zoomControl: false, // Cleaner look for mobile mockup
        attributionControl: false
    }).setView(startCoords, 16);

    // 2. Dark Mode Tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
    }).addTo(map);

    // *NEW* 2.1 User Geolocation
    map.locate({ setView: true, maxZoom: 16 });

    const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="width: 20px; height: 20px; background: #3742fa; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #3742fa;"></div>',
        iconSize: [20, 20]
    });

    function onLocationFound(e) {
        L.marker(e.latlng, { icon: userIcon }).addTo(map).bindPopup("Vous êtes ici").openPopup();
    }

    map.on('locationfound', onLocationFound);

    function onLocationError(e) {
        console.warn(e.message);
        // Fallback to Rivoli is already set
    }

    map.on('locationerror', onLocationError);


    // 3. Audio Engine (Simple Oscillator for now)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type) {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'jazz') {
            // Jazz-ish chord (minor 7th)
            osc.frequency.value = 440; // A4
            osc.type = 'sine';
            setTimeout(() => { osc.frequency.value = 523.25; }, 200); // C5

            // Envelope
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2);

            osc.start();
            osc.stop(audioCtx.currentTime + 2);
        } else {
            // "Secret" / Sci-fi ping
            osc.frequency.value = 800;
            osc.type = 'triangle';

            // Envelope
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1);

            osc.start();
            osc.stop(audioCtx.currentTime + 1);
        }
    }

    // 4. Custom Markers (Bubbles)
    const bubbleIcon = (type, label, color) => {
        const isSecret = type === 'secret';
        const colorStyle = isSecret
            ? `border-color: #2ed573; background: rgba(46, 213, 115, 0.2);`
            : ``;

        const html = `
            <div class="bubble-marker ${type}" style="${colorStyle}">
                <div>
                    <span>${label}</span>
                    <div class="decay-bar" style="width: ${isSecret ? '60px' : '50px'};">
                        <div class="decay-fill" style="width: ${isSecret ? '40%' : '80%'}; ${isSecret ? 'background: #2ed573;' : ''}"></div>
                    </div>
                </div>
            </div>
        `;

        return L.divIcon({
            className: 'custom-bubble',
            html: html,
            iconSize: [100, 100],
            iconAnchor: [50, 50] // Center the bubble
        });
    };

    // *NEW* 5. Lazy Loading Logic (Viewport Based)
    let markersLayer = L.layerGroup().addTo(map);

    function generateMockNotes(bounds) {
        const notes = [];
        const count = Math.floor(Math.random() * 3) + 2; // Generate 2-5 notes per move

        for (let i = 0; i < count; i++) {
            const lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
            const lng = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());

            // *NEW* Duration Constraint (Simulation)
            const duration = Math.floor(Math.random() * 600) + 10; // 10s to 600s (10min)
            if (duration > 600) return; // Should not happen with logic above, but enforces rule

            const types = ['jazz', 'secret'];
            const type = types[Math.floor(Math.random() * types.length)];

            notes.push({
                coords: [lat, lng],
                type: type,
                label: type === 'jazz' ? 'Rumeur' : 'Secret',
                color: type === 'jazz' ? '#ff4757' : '#2ed573',
                duration: duration
            });
        }
        return notes;
    }

    function loadNotesInViewport() {
        // In a real app, we would fetch from API with bounds
        const bounds = map.getBounds();

        // Simulating fetch
        const newNotes = generateMockNotes(bounds);

        newNotes.forEach(note => {
            const marker = L.marker(note.coords, {
                icon: bubbleIcon(note.type, note.label, note.color)
            });

            marker.on('click', (e) => {
                // *NEW* Display duration info (Console for now, or Toast)
                console.log(`Playing note. Duration: ${Math.floor(note.duration / 60)}m ${note.duration % 60}s`);

                playSound(note.type);

                // Visual Pulse Effect
                const el = e.target.getElement().querySelector('.bubble-marker');
                el.style.animation = 'none';
                el.offsetHeight; /* trigger reflow */
                el.style.animation = 'pulse 0.5s ease-out';

                // Reset animation after play
                setTimeout(() => {
                    el.style.animation = 'pulse 2s infinite';
                }, 500);
            });

            // Add to layer group
            marker.addTo(markersLayer);
        });
    }

    // Initial Loading
    // Generating some fixed initial points for demo stability
    const initialNotes = [
        { coords: [48.8566, 2.3522], type: 'jazz', label: 'Jazz', color: '#ff4757', duration: 120 },
        { coords: [48.8575, 2.3530], type: 'secret', label: 'Secret', color: '#2ed573', duration: 300 }
    ];
    initialNotes.forEach(note => {
        const marker = L.marker(note.coords, {
            icon: bubbleIcon(note.type, note.label, note.color)
        });
        marker.on('click', () => playSound(note.type));
        marker.addTo(markersLayer);
    });

    // Listen to move events to load more
    map.on('moveend', () => {
        loadNotesInViewport();
    });

    // 6. Interaction: Map Click (Mock "Add Note")
    map.on('click', (e) => {
        console.log("Map clicked at", e.latlng);
        // Logic to add note would go here, enforcing max duration < 10min
    });
});
