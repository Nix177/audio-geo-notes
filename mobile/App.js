import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";

const DEFAULT_API =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://31.97.77.6:4000";
const POLL_MS = 8000;
const METER_INTERVAL = 200;
const METER_BARS = 28;

function getScore(note) {
  return (note.likes || 0) - (note.downvotes || 0) - (note.reports || 0) * 2;
}

function normalize(note) {
  return {
    id: note.id,
    title: note.title || "Note",
    description: note.description || "",
    author: note.author || "Anonyme",
    category: note.category || "Communaute",
    isLive: Boolean(note.isLive),
    isStream: Boolean(note.isStream),
    streamActive: Boolean(note.streamActive),
    likes: Number.isFinite(Number(note.likes)) ? Number(note.likes) : 0,
    downvotes: Number.isFinite(Number(note.downvotes)) ? Number(note.downvotes) : 0,
    reports: Number.isFinite(Number(note.reports)) ? Number(note.reports) : 0,
    plays: Number.isFinite(Number(note.plays)) ? Number(note.plays) : 0,
    listeners: Number.isFinite(Number(note.listeners)) ? Number(note.listeners) : 0,
    lat: Number.isFinite(Number(note.lat)) ? Number(note.lat) : null,
    lng: Number.isFinite(Number(note.lng)) ? Number(note.lng) : null,
    audioUrl: typeof note.audioUrl === "string" ? note.audioUrl : null
  };
}

function formatTime(ms) {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

/* ── CustomPin Component ── */
function CustomPin({ scale = 1, opacity = 1, color = "#4f7cff" }) {
  return (
    <View style={[pinStyles.wrapper, { transform: [{ scale }], opacity }]}>
      <View style={[pinStyles.circle, { backgroundColor: color }]}>
        <Text style={pinStyles.emoji}>🎵</Text>
      </View>
      <View style={[pinStyles.triangle, { borderTopColor: color }]} />
    </View>
  );
}

const pinStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center', width: 40, height: 50 },
  circle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 3, elevation: 4
  },
  emoji: { fontSize: 16, lineHeight: 18 },
  triangle: {
    width: 0, height: 0, backgroundColor: 'transparent',
    borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6,
    borderTopWidth: 10, borderLeftColor: 'transparent',
    borderRightColor: 'transparent', marginTop: -2
  }
});

/* ── Pulsing Live Marker component ── */
function LivePulseMarker({ scale = 1, opacity = 1 }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <View style={livePulseStyles.container}>
      <Animated.View style={[
        livePulseStyles.ring, 
        { transform: [{ scale: ringScale }], opacity: ringOpacity }
      ]} />
      <CustomPin scale={scale} opacity={opacity} color="#ff4757" />
    </View>
  );
}

const livePulseStyles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", width: 60, height: 60 },
  ring: {
    position: "absolute",
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 3, borderColor: "#ff4757",
    backgroundColor: "transparent"
  }
});

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [apiInput, setApiInput] = useState(DEFAULT_API);
  const [mode, setMode] = useState("archive");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("Mobile User");
  const [coords, setCoords] = useState({ lat: 48.8566, lng: 2.3522 });
  const [isManualPos, setIsManualPos] = useState(false);
  const [composerCoords, setComposerCoords] = useState({ lat: 48.8566, lng: 2.3522 });
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [showNoteDetails, setShowNoteDetails] = useState(false);

  const [recording, setRecording] = useState(null);
  const [recordingOn, setRecordingOn] = useState(false);
  const [recordedUri, setRecordedUri] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [meterLevels, setMeterLevels] = useState([]);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const [playingId, setPlayingId] = useState("");
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackDur, setPlaybackDur] = useState(0);
  const [votedMap, setVotedMap] = useState({});
  const [reportedMap, setReportedMap] = useState({});

  const [liveActive, setLiveActive] = useState(false);
  const [liveStreamId, setLiveStreamId] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);

  const soundRef = useRef(null);
  const previewSoundRef = useRef(null);
  const meterTimerRef = useRef(null);
  const liveRef = useRef({
    active: false,
    streamId: "",
    chunkRecording: null
  });

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const requestOptions = {
        method: options.method || "GET",
        headers: { ...(options.headers || {}) }
      };

      if (options.body !== undefined) {
        if (options.body instanceof FormData) {
          requestOptions.body = options.body;
        } else {
          requestOptions.headers["content-type"] = "application/json";
          requestOptions.body = JSON.stringify(options.body);
        }
      }

      const response = await fetch(`${apiBase}${path}`, requestOptions);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload.data;
    },
    [apiBase]
  );

  const loadNotes = useCallback(
    async (targetMode = mode, silent = false) => {
      try {
        const data = await apiRequest(`/api/notes?mode=${targetMode}`);
        setNotes(data.map((entry) => normalize(entry)));
        setApiOnline(true);
        if (!silent) setError("");
      } catch (requestError) {
        setApiOnline(false);
        if (!silent) setError("Backend indisponible");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiRequest, mode]
  );

  useEffect(() => {
    void loadNotes(mode);
    const timer = setInterval(() => {
      void loadNotes(mode, true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [mode, loadNotes]);

  // ── Feature 1: Request location on launch ──
  const ensureLocationPermissions = useCallback(async () => {
    const locationPerm = await Location.requestForegroundPermissionsAsync();
    if (!locationPerm.granted) {
      throw new Error("Permission localisation refusee");
    }
  }, []);

  const updateLocation = useCallback(async () => {
    try {
      await ensureLocationPermissions();
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCoords(next);
      setComposerCoords(next);
      setError("");
    } catch (locError) {
      setError(locError.message || "Localisation indisponible");
    }
  }, [ensureLocationPermissions]);

  useEffect(() => {
    // Auto-request location on mount
    void updateLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
      if (previewSoundRef.current) {
        void previewSoundRef.current.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      liveRef.current.active = false;
      if (liveRef.current.chunkRecording) {
        void liveRef.current.chunkRecording.stopAndUnloadAsync().catch(() => { });
      }
    };
  }, []);

  const mapNotes = useMemo(
    () =>
      notes.filter(
        (entry) =>
          (mode === "live" ? entry.isLive : !entry.isLive) &&
          Number.isFinite(entry.lat) &&
          Number.isFinite(entry.lng)
      ),
    [notes, mode]
  );
  const selectedNote = useMemo(
    () => notes.find((entry) => entry.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  const upsertLocal = useCallback((updated) => {
    const normalized = normalize(updated);
    setNotes((prev) => [normalized, ...prev.filter((n) => n.id !== normalized.id)]);
    return normalized;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadNotes(mode, true);
  }, [loadNotes, mode]);

  // ── Feature 2: Success message helper ──
  const showSuccess = useCallback((msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }, []);

  const ensureAudioPermissions = useCallback(async () => {
    const audioPerm = await Audio.requestPermissionsAsync();
    if (!audioPerm.granted) {
      throw new Error("Permission micro refusee");
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
  }, []);

  const updateComposerLocation = useCallback(async () => {
    if (isManualPos) return;
    try {
      await ensureLocationPermissions();
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCoords(next);
      setComposerCoords(next);
      setError("");
    } catch (locError) {
      setError("Impossible de recuperer votre position");
    }
  }, [ensureLocationPermissions, isManualPos]);

  // ── Feature 4: Waveform metering ──
  const startMeterPolling = useCallback((rec) => {
    setMeterLevels([]);
    meterTimerRef.current = setInterval(async () => {
      try {
        const status = await rec.getStatusAsync();
        if (status.isRecording && status.metering != null) {
          // metering is in dB (typically -160 to 0). Normalize to 0..1
          const db = status.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setMeterLevels((prev) => {
            const next = [...prev, normalized];
            return next.length > METER_BARS ? next.slice(-METER_BARS) : next;
          });
        }
      } catch (_e) {
        // ignore if recording ended
      }
    }, METER_INTERVAL);
  }, []);

  const stopMeterPolling = useCallback(() => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
  }, []);

  const startRecord = useCallback(async () => {
    if (recordingOn) return;
    try {
      await ensureAudioPermissions();
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true
      });
      await rec.startAsync();
      setRecording(rec);
      setRecordedUri("");
      setRecordingOn(true);
      setError("");
      startMeterPolling(rec);
    } catch (recError) {
      setError(recError.message || "Impossible de demarrer l enregistrement");
      setRecordingOn(false);
      setRecording(null);
    }
  }, [ensureAudioPermissions, recordingOn, startMeterPolling]);

  const stopRecord = useCallback(async () => {
    if (!recording) return;
    stopMeterPolling();
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI() || "";
      setRecordedUri(uri);
    } catch (recError) {
      setError(recError.message || "Arret enregistrement impossible");
    } finally {
      setRecordingOn(false);
      setRecording(null);
    }
  }, [recording, stopMeterPolling]);

  const clearRecorded = useCallback(() => {
    setRecordedUri("");
    setMeterLevels([]);
  }, []);

  // ── Feature 3: Preview recorded audio ──
  const togglePreview = useCallback(async () => {
    if (previewPlaying) {
      if (previewSoundRef.current) {
        await previewSoundRef.current.stopAsync().catch(() => { });
        await previewSoundRef.current.unloadAsync().catch(() => { });
        previewSoundRef.current = null;
      }
      setPreviewPlaying(false);
      return;
    }
    if (!recordedUri) return;
    try {
      // Reset audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: recordedUri },
        { shouldPlay: true }
      );
      previewSoundRef.current = sound;
      setPreviewPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPreviewPlaying(false);
          if (previewSoundRef.current) {
            void previewSoundRef.current.unloadAsync().catch(() => { });
            previewSoundRef.current = null;
          }
        }
      });
    } catch (_e) {
      setError("Impossible de lire l'aperçu");
    }
  }, [previewPlaying, recordedUri]);

  const audioTypeFromUri = (uri) => {
    if (uri.endsWith(".m4a")) return "audio/mp4";
    if (uri.endsWith(".caf")) return "audio/x-caf";
    if (uri.endsWith(".mp3")) return "audio/mpeg";
    return "audio/mp4";
  };

  const buildFormData = useCallback((payload, uri = "", filePrefix = "clip") => {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    if (uri) {
      const type = audioTypeFromUri(uri);
      const ext = type.includes("mpeg") ? "mp3" : "m4a";
      formData.append("audio", {
        uri,
        name: `${filePrefix}-${Date.now()}.${ext}`,
        type
      });
    }

    return formData;
  }, []);

  // ── Feature 2: Publish with confirmation ──
  const publishNote = useCallback(async () => {
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim() || "Mobile User";
    const cleanDescription = description.trim();

    if (!cleanTitle) {
      setError("Titre obligatoire");
      return;
    }
    if (!recordedUri) {
      setError("Enregistre un son avant de publier");
      return;
    }

    setPublishing(true);
    try {
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        author: cleanAuthor,
        category: "Communaute",
        icon: "AUDIO",
        type: "story",
        duration: 120,
        isLive: false,
        lat: composerCoords.lat,
        lng: composerCoords.lng,
        listeners: 0
      };
      const created = await apiRequest("/api/notes", {
        method: "POST",
        body: buildFormData(payload, recordedUri, "note")
      });
      upsertLocal(created);
      setApiOnline(true);
      setError("");
      setTitle("");
      setDescription("");
      setRecordedUri("");
      setMeterLevels([]);
      setComposerOpen(false);
      showSuccess("✅ Son publié sur la carte !");
    } catch (requestError) {
      setApiOnline(Boolean(requestError?.status));
      setError(requestError.message || "Publication impossible");
    } finally {
      setPublishing(false);
    }
  }, [
    title, author, description, recordedUri, composerCoords,
    apiRequest, buildFormData, upsertLocal, showSuccess
  ]);

  const submitVote = useCallback(
    async (note, type) => {
      const previousVote = votedMap[note.id];
      if (previousVote === type) return;

      setVotedMap((prev) => ({ ...prev, [note.id]: type }));

      let newLikes = note.likes || 0;
      let newDown = note.downvotes || 0;

      if (type === 'like') {
        newLikes++;
        if (previousVote === 'dislike') newDown = Math.max(0, newDown - 1);
      } else {
        newDown++;
        if (previousVote === 'like') newLikes = Math.max(0, newLikes - 1);
      }

      upsertLocal({ ...note, likes: newLikes, downvotes: newDown });

      try {
        const updated = await apiRequest(`/api/notes/${note.id}/votes`, {
          method: "POST",
          body: { type }
        });
        upsertLocal(updated);
        setApiOnline(true);
      } catch (requestError) {
        setApiOnline(Boolean(requestError?.status));
        setError("Vote local conserve, backend indisponible");
      }
    },
    [apiRequest, upsertLocal, votedMap]
  );

  const submitReport = useCallback(
    async (note) => {
      if (reportedMap[note.id]) return;
      setReportedMap((prev) => ({ ...prev, [note.id]: true }));
      upsertLocal({ ...note, reports: (note.reports || 0) + 1 });

      try {
        const updated = await apiRequest(`/api/notes/${note.id}/report`, {
          method: "POST"
        });
        upsertLocal(updated);
        setApiOnline(true);
      } catch (requestError) {
        setApiOnline(Boolean(requestError?.status));
        setError("Signalement local conserve, backend indisponible");
      }
    },
    [apiRequest, reportedMap, upsertLocal]
  );

  // ── Feature 5: Playback with progress ──
  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => { });
      await soundRef.current.unloadAsync().catch(() => { });
      soundRef.current = null;
    }
    setPlayingId("");
    setPlaybackPos(0);
    setPlaybackDur(0);
  }, []);

  const playNote = useCallback(
    async (note) => {
      if (!note.audioUrl) {
        setError("Aucun audio sur cette note");
        return;
      }

      if (playingId === note.id) {
        await stopPlayback();
        return;
      }

      try {
        await stopPlayback();
        // Make sure audio mode is set for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: note.audioUrl },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 }
        );
        soundRef.current = sound;
        setPlayingId(note.id);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded) {
            setPlaybackPos(status.positionMillis || 0);
            setPlaybackDur(status.durationMillis || 0);
          }
          if (status.didJustFinish) {
            setPlayingId("");
            setPlaybackPos(0);
            setPlaybackDur(0);
            if (soundRef.current) {
              void soundRef.current.unloadAsync().catch(() => { });
              soundRef.current = null;
            }
          }
        });

        void apiRequest(`/api/notes/${note.id}/play`, { method: "POST" })
          .then((updated) => upsertLocal(updated))
          .catch(() => { });
      } catch (playError) {
        setError(playError.message || "Lecture impossible");
      }
    },
    [apiRequest, playingId, stopPlayback, upsertLocal]
  );

  const seekPlayback = useCallback(async (ratio) => {
    if (!soundRef.current || !playbackDur) return;
    const pos = Math.floor(ratio * playbackDur);
    await soundRef.current.setPositionAsync(pos).catch(() => { });
  }, [playbackDur]);

  const uploadLiveChunk = useCallback(
    async (streamId, uri) => {
      if (!uri) return;
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: `stream-${Date.now()}.m4a`,
        type: audioTypeFromUri(uri)
      });
      const updated = await apiRequest(`/api/streams/${streamId}/audio`, {
        method: "POST",
        body: formData
      });
      upsertLocal(updated);
    },
    [apiRequest, upsertLocal]
  );

  const runLiveLoop = useCallback(
    async (streamId) => {
      while (liveRef.current.active && liveRef.current.streamId === streamId) {
        let chunkUri = "";
        try {
          const chunk = new Audio.Recording();
          liveRef.current.chunkRecording = chunk;
          await chunk.prepareToRecordAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          await chunk.startAsync();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await chunk.stopAndUnloadAsync();
          chunkUri = chunk.getURI() || "";
        } catch (_e) {
          chunkUri = "";
        } finally {
          liveRef.current.chunkRecording = null;
        }

        if (!liveRef.current.active || liveRef.current.streamId !== streamId) break;

        if (chunkUri) {
          try {
            await uploadLiveChunk(streamId, chunkUri);
          } catch (_e) {
            setError("Chunk live non envoye");
          }
        }

        try {
          const hb = await apiRequest(`/api/streams/${streamId}/heartbeat`, {
            method: "POST",
            body: { listeners: Math.max(1, Math.round(Math.random() * 20)) }
          });
          upsertLocal(hb);
        } catch (_e) {
          // silent
        }
      }
    },
    [apiRequest, uploadLiveChunk, upsertLocal]
  );

  const startLive = useCallback(async () => {
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim() || "Mobile User";
    const cleanDescription = description.trim();

    if (liveRef.current.active) return;
    if (!cleanTitle) {
      setError("Titre obligatoire pour le live");
      return;
    }

    setLiveBusy(true);
    try {
      await ensureAudioPermissions();
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        author: cleanAuthor,
        category: "Live",
        icon: "LIVE",
        type: "live",
        duration: 180,
        isLive: true,
        lat: composerCoords.lat,
        lng: composerCoords.lng,
        listeners: 1
      };
      const created = await apiRequest("/api/streams/start", {
        method: "POST",
        body: buildFormData(payload, recordedUri, "stream-start")
      });
      const streamId = created.id;

      liveRef.current.active = true;
      liveRef.current.streamId = streamId;
      setLiveActive(true);
      setLiveStreamId(streamId);
      setRecordedUri("");
      upsertLocal(created);
      setError("");
      setApiOnline(true);

      void runLiveLoop(streamId);
    } catch (requestError) {
      setApiOnline(Boolean(requestError?.status));
      setError(requestError.message || "Demarrage live impossible");
    } finally {
      setLiveBusy(false);
    }
  }, [
    apiRequest, author, buildFormData, composerCoords, description,
    ensureAudioPermissions, recordedUri, runLiveLoop, title, upsertLocal
  ]);

  const stopLive = useCallback(async () => {
    const streamId = liveRef.current.streamId;
    if (!streamId) return;

    setLiveBusy(true);
    liveRef.current.active = false;

    if (liveRef.current.chunkRecording) {
      try {
        await liveRef.current.chunkRecording.stopAndUnloadAsync();
      } catch (_e) { /* ignore */ }
      liveRef.current.chunkRecording = null;
    }

    try {
      const stopped = await apiRequest(`/api/streams/${streamId}/stop`, {
        method: "POST"
      });
      upsertLocal(stopped);
      setApiOnline(true);
      setError("");
    } catch (requestError) {
      setApiOnline(Boolean(requestError?.status));
      setError(requestError.message || "Arret live impossible");
    } finally {
      liveRef.current.streamId = "";
      setLiveActive(false);
      setLiveStreamId("");
      setLiveBusy(false);
      void loadNotes(mode, true);
    }
  }, [apiRequest, loadNotes, mode, upsertLocal]);

  // ── Feature 8: Listen to live stream ──
  const listenToLive = useCallback(async (note) => {
    if (!note.audioUrl) {
      setError("Aucun flux audio disponible");
      return;
    }
    try {
      await stopPlayback();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: note.audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 }
      );
      soundRef.current = sound;
      setPlayingId(note.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPlaybackPos(status.positionMillis || 0);
          setPlaybackDur(status.durationMillis || 0);
        }
        if (status.didJustFinish) {
          setPlayingId("");
          setPlaybackPos(0);
          setPlaybackDur(0);
          if (soundRef.current) {
            void soundRef.current.unloadAsync().catch(() => { });
            soundRef.current = null;
          }
        }
      });
    } catch (playError) {
      setError(playError.message || "Impossible d'écouter le live");
    }
  }, [stopPlayback]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // ── Progress bar ratio ──
  const progressRatio = playbackDur > 0 ? playbackPos / playbackDur : 0;

  // --- UI RENDER ---

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* FULLSCREEN MAP */}
      <MapView
        style={styles.mapFullscreen}
        initialRegion={{
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        }}
        region={{
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        }}
        onPress={(event) => {
          if (!composerOpen) {
            setSelectedNoteId("");
            setShowNoteDetails(false);
          }
        }}
      >
        {/* Single pin: green when browsing, red when composing */}
        {composerOpen ? (
          <Marker
            coordinate={{ latitude: composerCoords.lat, longitude: composerCoords.lng }}
            draggable={isManualPos}
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setComposerCoords({ lat: latitude, lng: longitude });
            }}
            title="Position du son"
            tracksViewChanges={false}
          >
            <CustomPin scale={1.1} opacity={1} color="#ff4757" />
          </Marker>
        ) : (
          <Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }} title="Moi" tracksViewChanges={false}>
            <CustomPin color="#2ed573" />
          </Marker>
        )}

        {/* Feature 7: Live notes get pulsing markers, archive notes get normal pins */}
        {mapNotes.map((entry) => {
          const likes = entry.likes || 0;
          const downvotes = entry.downvotes || 0;
          const reports = entry.reports || 0;
          const neg = downvotes + (reports * 2);
          const totalWeight = likes + neg;
          
          let scale = 1.0;
          let opacity = 1.0;

          if (totalWeight >= 3) {
            const s = posW - neg;
            const ratio = s / totalWeight;
            if (s >= 0) {
              scale = 1.0 + Math.min(ratio * 0.5, 0.5);
            } else {
              // Threshold 10% for archive, 15% for stream (handled by opacity)
              opacity = Math.max(0.1, 1.0 + (ratio * 1.5));
            }
          }

          if (entry.isLive) {
            return (
              <Marker
                key={entry.id}
                coordinate={{ latitude: entry.lat, longitude: entry.lng }}
                title={entry.title}
                description={entry.author}
                tracksViewChanges={true}
                onPress={() => {
                  setSelectedNoteId(entry.id);
                  setShowNoteDetails(true);
                  setComposerOpen(false);
                }}
              >
                <LivePulseMarker scale={scale} opacity={opacity} />
              </Marker>
            );
          }

          return (
            <Marker
              key={entry.id}
              coordinate={{ latitude: entry.lat, longitude: entry.lng }}
              title={entry.title}
              description={entry.author}
              tracksViewChanges={false}
              onPress={() => {
                setSelectedNoteId(entry.id);
                setShowNoteDetails(true);
                setComposerOpen(false);
              }}
            >
              <CustomPin scale={scale} opacity={opacity} color={opacity < 0.9 ? "#a4b0be" : "#4f7cff"} />
            </Marker>
          );
        })}
      </MapView>

      {/* TOP OVERLAYS */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>Vocal Walls</Text>
            <View style={styles.modeToggle}>
              <Pressable style={[styles.modePill, mode === "archive" && styles.modePillActive]} onPress={() => setMode("archive")}>
                <Text style={styles.modeText}>Archive</Text>
              </Pressable>
              <Pressable style={[styles.modePill, mode === "live" && styles.modePillActive]} onPress={() => setMode("live")}>
                <Text style={styles.modeText}>Live</Text>
              </Pressable>
            </View>
          </View>
        </View>
        {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
        {successMsg ? <View style={styles.successBanner}><Text style={styles.successText}>{successMsg}</Text></View> : null}
      </SafeAreaView>

      {/* BOTTOM SHEET / COMPOSER / DETAILS */}
      <KeyboardAvoidingView
        style={styles.bottomSheetContainer}
        pointerEvents="box-none"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >

        {/* COMPOSER PANEL */}
        {composerOpen && (
          <View style={[styles.panel, styles.composerPanel]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Nouveau Son</Text>
              <Pressable onPress={() => setComposerOpen(false)}>
                <Text style={styles.closeText}>Fermer</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.composerScroll} contentContainerStyle={styles.composerContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <View style={styles.locToggleRow}>
                <Text style={styles.locToggleLabel}>Position manuelle (vie privée)</Text>
                <Switch
                  value={isManualPos}
                  onValueChange={setIsManualPos}
                  trackColor={{ false: "#767577", true: "#ff4757" }}
                />
              </View>

              {!isManualPos && (
                <Pressable style={styles.usePosBtn} onPress={() => void updateComposerLocation()}>
                  <Text style={styles.usePosText}>📍 Forcer la mise à jour GPS</Text>
                </Pressable>
              )}
              {isManualPos && (
                <Text style={styles.manualHint}>Déplacez le pin rouge sur la carte</Text>
              )}
              
              <Text style={styles.coordText}>
                {composerCoords.lat.toFixed(4)}, {composerCoords.lng.toFixed(4)} • {isManualPos ? "Position choisie manuellement" : "Localisation automatique par GPS"}
              </Text>

              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Titre du son..." placeholderTextColor="#81838f" />
              <TextInput style={styles.inputDesc} value={description} onChangeText={setDescription} placeholder="Description (optionnel)" placeholderTextColor="#81838f" multiline />
              <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Votre pseudo" placeholderTextColor="#81838f" />

              <View style={styles.recordSection}>
                <Pressable
                  style={[styles.recordBtn, recordingOn && styles.recordBtnActive]}
                  onPress={() => (recordingOn ? void stopRecord() : void startRecord())}
                >
                  <View style={[styles.recordInner, recordingOn && styles.recordInnerActive]} />
                </Pressable>
                <Text style={styles.recordStatus}>
                  {recordingOn ? "Enregistrement en cours..." : recordedUri ? "Audio enregistré ✅" : "Appuyez pour enregistrer"}
                </Text>

                {/* Feature 4: Waveform bars */}
                {recordingOn && meterLevels.length > 0 && (
                  <View style={styles.waveformContainer}>
                    {meterLevels.map((level, i) => (
                      <View
                        key={i}
                        style={[
                          styles.waveformBar,
                          { height: Math.max(4, level * 36) }
                        ]}
                      />
                    ))}
                  </View>
                )}

                {/* Feature 3: Preview button */}
                {recordedUri && !recordingOn && (
                  <View style={styles.previewRow}>
                    <Pressable onPress={togglePreview} style={styles.previewBtn}>
                      <Text style={styles.previewText}>{previewPlaying ? "⏹ Arrêter" : "▶ Réécouter"}</Text>
                    </Pressable>
                    <Pressable onPress={clearRecorded} style={styles.clearBtn}>
                      <Text style={styles.clearText}>Effacer</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable style={[styles.publishBtn, (publishing || !recordedUri || !title) && styles.disabled]} disabled={publishing || !recordedUri || !title} onPress={() => void publishNote()}>
                <Text style={styles.publishText}>{publishing ? "Envoi..." : "Publier sur la carte"}</Text>
              </Pressable>

              <View style={styles.liveSection}>
                <Text style={styles.liveLabel}>Ou démarrer un direct :</Text>
                <View style={styles.liveActions}>
                  <Pressable style={[styles.miniBtn, liveActive && styles.disabled]} onPress={() => void startLive()} disabled={liveActive}>
                    <Text style={styles.miniBtnText}>Go Live</Text>
                  </Pressable>
                  <Pressable style={[styles.miniBtn, !liveActive && styles.disabled]} onPress={() => void stopLive()} disabled={!liveActive}>
                    <Text style={styles.miniBtnText}>Stop Live</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        )}

        {/* NOTE DETAILS PANEL */}
        {showNoteDetails && selectedNote && !composerOpen && (
          <View style={[styles.panel, styles.detailsPanel]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle} numberOfLines={1}>{selectedNote.title}</Text>
              <Pressable onPress={() => { setShowNoteDetails(false); void stopPlayback(); }}>
                <Text style={styles.closeText}>Fermer</Text>
              </Pressable>
            </View>
            <Text style={styles.noteAuthor}>Par {selectedNote.author}</Text>
            {selectedNote.isLive && <Text style={styles.liveBadge}>🔴 En direct</Text>}
            <Text style={styles.noteDesc}>{selectedNote.description}</Text>

            <View style={styles.playSection}>
              {/* Feature 8: Live listen button */}
              {selectedNote.isLive ? (
                <Pressable
                  style={[styles.playBtn, styles.livePlayBtn, !selectedNote.audioUrl && styles.disabled]}
                  onPress={() => void (playingId === selectedNote.id ? stopPlayback() : listenToLive(selectedNote))}
                  disabled={!selectedNote.audioUrl}
                >
                  <Text style={styles.playText}>
                    {playingId === selectedNote.id ? "⏹ Arrêter" : "🔴 Écouter en direct"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.playBtn, !selectedNote.audioUrl && styles.disabled]}
                  onPress={() => void playNote(selectedNote)}
                  disabled={!selectedNote.audioUrl}
                >
                  <Text style={styles.playText}>
                    {playingId === selectedNote.id ? "⏹ Arrêter" : "▶ Écouter"}
                  </Text>
                </Pressable>
              )}

              {/* Feature 5: Playback progress bar */}
              {playingId === selectedNote.id && playbackDur > 0 && (
                <View style={styles.progressSection}>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressTime}>{formatTime(playbackPos)}</Text>
                    <Pressable
                      style={styles.progressBarOuter}
                      onPress={(e) => {
                        const { locationX } = e.nativeEvent;
                        // Approximate bar width
                        const barWidth = 220;
                        const ratio = Math.max(0, Math.min(1, locationX / barWidth));
                        void seekPlayback(ratio);
                      }}
                    >
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%` }]} />
                      </View>
                    </Pressable>
                    <Text style={styles.progressTime}>{formatTime(playbackDur)}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.voteRow}>
              {/* UPVOTE */}
              <View style={styles.voteItem}>
                <Pressable
                  style={[styles.arrowBtn, votedMap[selectedNote.id] === 'like' && styles.arrowBtnActive]}
                  onPress={() => void submitVote(selectedNote, "like")}
                >
                  <Text style={styles.arrowText}>▲</Text>
                </Pressable>
                <Text style={styles.voteCount}>{Math.max(0, getScore(selectedNote))}</Text>
              </View>

              {/* DOWNVOTE */}
              <Pressable
                style={[styles.arrowBtn, votedMap[selectedNote.id] === 'dislike' && styles.arrowBtnActive]}
                onPress={() => void submitVote(selectedNote, "dislike")}
              >
                <Text style={styles.arrowText}>▼</Text>
              </Pressable>

              {/* REPORT */}
              <Pressable style={styles.reportBtn} onPress={() => void submitReport(selectedNote)}>
                <Text style={styles.reportText}>🚩 Signaler</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* FAB BUTTON (Add Sound) */}
        {!composerOpen && !showNoteDetails && (
          <Pressable style={styles.fab} onPress={() => { setComposerOpen(true); setComposerCoords(coords); }}>
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        )}

      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1017"
  },
  mapFullscreen: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f1017",
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: { color: "#fff", marginTop: 10 },

  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingHorizontal: 20
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 16, 23, 0.8)',
    padding: 10,
    borderRadius: 12,
  },
  title: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#1f2029',
    borderRadius: 8,
    padding: 2
  },
  modePill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  modePillActive: {
    backgroundColor: '#ff4757'
  },
  modeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: "600"
  },
  errorBanner: {
    backgroundColor: '#ff4757',
    padding: 8,
    borderRadius: 8,
    marginTop: 8
  },
  errorText: { color: "#fff", fontSize: 12, textAlign: "center" },
  successBanner: {
    backgroundColor: '#2ed573',
    padding: 10,
    borderRadius: 8,
    marginTop: 8
  },
  successText: { color: "#fff", fontSize: 14, textAlign: "center", fontWeight: "bold" },

  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end'
  },
  panel: {
    backgroundColor: '#1f2029',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    maxHeight: "60%"
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },
  panelTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", flex: 1 },
  closeText: { color: "#ff4757", fontWeight: "600" },

  composerScroll: {
    flexGrow: 0
  },
  usePosBtn: {
    backgroundColor: '#2d3436',
    padding: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 5
  },
  usePosText: { color: '#74b9ff', fontWeight: "600", fontSize: 13 },
  locToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  locToggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  manualHint: {
    color: '#ff4757',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 10,
    textAlign: 'center',
  },
  coordText: { color: '#a4b0be', fontSize: 12, marginBottom: 15 },

  input: {
    backgroundColor: '#2f3542',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  inputDesc: {
    backgroundColor: '#2f3542',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    height: 60,
    textAlignVertical: 'top'
  },

  recordSection: {
    alignItems: 'center',
    marginVertical: 15
  },
  recordBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#ff4757',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  recordBtnActive: {
    borderColor: '#fff'
  },
  recordInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ff4757'
  },
  recordInnerActive: {
    width: 24,
    height: 24,
    borderRadius: 4
  },
  recordStatus: { color: '#ff6b81', fontSize: 13, fontWeight: '600' },

  // Feature 4: Waveform
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 40,
    marginTop: 10,
    gap: 2
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#ff4757',
    borderRadius: 2,
    minHeight: 4
  },

  // Feature 3: Preview
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 15
  },
  previewBtn: {
    backgroundColor: '#2f3542',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  previewText: { color: '#74b9ff', fontWeight: '600', fontSize: 13 },
  clearBtn: { marginTop: 0 },
  clearText: { color: '#a4b0be', fontSize: 12, textDecorationLine: 'underline' },

  publishBtn: {
    backgroundColor: '#ff4757',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20
  },
  publishText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  disabled: { opacity: 0.5 },

  liveSection: {
    borderTopWidth: 1,
    borderTopColor: '#2f3542',
    paddingTop: 15,
    marginTop: 5
  },
  liveLabel: { color: '#a4b0be', marginBottom: 10, fontSize: 12 },
  liveActions: { flexDirection: 'row', gap: 10 },
  miniBtn: {
    backgroundColor: '#eccc68',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  miniBtnText: { color: '#2f3542', fontWeight: 'bold', fontSize: 12 },

  fab: {
    alignSelf: 'flex-end',
    margin: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ff4757',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6
  },
  fabText: { color: '#fff', fontSize: 30, marginTop: -2 },

  detailsPanel: {
    paddingBottom: 40
  },
  noteAuthor: { color: '#ff4757', fontWeight: "bold", marginBottom: 5 },
  liveBadge: {
    color: '#ff4757',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8
  },
  noteDesc: { color: '#dfe4ea', marginBottom: 20, fontSize: 15, lineHeight: 22 },
  playSection: { marginBottom: 20 },
  playBtn: {
    backgroundColor: '#2f3542',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  livePlayBtn: {
    backgroundColor: '#c0392b'
  },
  playText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Feature 5: Progress bar
  progressSection: {
    marginTop: 12
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  progressTime: {
    color: '#a4b0be',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 32
  },
  progressBarOuter: {
    flex: 1,
    paddingVertical: 8
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#2f3542',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#ff4757',
    borderRadius: 2
  },

  voteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2f3542',
    paddingTop: 15
  },
  voteItem: {
    flexDirection: 'column',
    alignItems: 'center'
  },
  voteCount: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 2
  },
  arrowBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#2f3542'
  },
  arrowBtnActive: {
    backgroundColor: '#ff4757'
  },
  arrowText: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28
  },
  reportBtn: {
    padding: 10
  },
  reportText: {
    color: '#a4b0be',
    fontSize: 12
  }
});
