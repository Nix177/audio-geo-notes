# Technical Architecture : Vocal Walls

## Core Systems

### 1. Geo-Location Engine (`H3Indexer.js`)
- **Technology**: Uber H3 Hexagonal Grid system.
- **Purpose**: Ultra-precise geofencing with minimal battery impact.
- **Logic**: Users subscribe to H3 cells. Updates only occur when crossing cell boundaries.

### 2. Spatial Audio Engine (`SpatialAudioEngine.ts`)
- **SDK**: **Agora SDK**.
- **Features**: 
    - Full 3D Audio spatialization.
    - Head orientation tracking (if supported by device) to modulate sound source direction.
    - Distance attenuation curves.

### 3. Entropy & life-cycle (`DecayService.py`)
- **Concept**: Digital Entropy.
- **Mechanism**: 
    - Every bubble starts with a `Health` score (e.g., 100%).
    - `Health` decreases linearly over time (`-1% / hour`).
    - **Recharge**: User interactions ("Likes", "Listens") add `Health`.
    - If `Health <= 0`, the bubble fades/is archived.

## Data Store
- **PostgreSQL + PostGIS**: Storing H3 indices and spatial queries.
- **S3 / R2**: Audio blob storage.
