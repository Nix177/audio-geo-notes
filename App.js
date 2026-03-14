import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import * as FileSystem from "expo-file-system";
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
    audioUrl: typeof note.audioUrl === "string" ? note.audioUrl : null,
    clientVote: note.clientVote === "like" || note.clientVote === "dislike" ? note.clientVote : null,
    clientReported: Boolean(note.clientReported),
    canDelete: Boolean(note.canDelete)
  };
}

function formatTime(ms) {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

/* Map marker visuals */
function getMarkerVisuals(note) {
  const negativeWeight = (note.downvotes || 0) + ((note.reports || 0) * 2);
  const positiveWeight = note.likes || 0;
  const totalWeight = positiveWeight + negativeWeight;
  let scale = note.isLive ? 1.08 : 1;
  let opacity = 1;
  let color = note.isLive ? "#ff4757" : "#4f7cff";
  let tone = note.isLive ? "#fff7f8" : "#f7fbff";
  let glow = note.isLive ? 0.16 : 0;

  if (totalWeight >= 3) {
    const ratio = (positiveWeight - negativeWeight) / totalWeight;
    if (ratio >= 0) {
      scale += Math.min(ratio * 0.55, 0.55);
      if (!note.isLive) {
        glow = Math.max(0, Math.min(1, (ratio - 0.28) / 0.42));
        if (glow > 0) {
          color = glow > 0.72 ? "#9dbdff" : "#78a2ff";
          tone = "#ffffff";
        }
      }
    } else {
      opacity = Math.max(0.2, 1 + (ratio * 1.55));
    }
  }

  if (!note.isLive && opacity < 0.86) {
    color = "#7f8ca8";
    tone = "#eef3ff";
    glow = 0;
  }

  return {
    markerScale: scale,
    markerOpacity: opacity,
    markerColor: color,
    markerTone: tone,
    markerGlow: glow
  };
}

function getNoteLabels(note) {
  const labels = [];
  const negativeWeight = (note.downvotes || 0) + ((note.reports || 0) * 2);
  const positiveWeight = note.likes || 0;
  const totalWeight = positiveWeight + negativeWeight;

  if (note.isLive) labels.push({ text: 'Live', tone: 'live' });
  if (!note.isLive && totalWeight <= 1 && (note.plays || 0) <= 2) labels.push({ text: 'Nouveau', tone: 'fresh' });
  if ((note.plays || 0) >= 30 || totalWeight >= 8) labels.push({ text: 'Tres ecoute', tone: 'popular' });
  if ((note.likes || 0) >= 4 || getScore(note) >= 5) labels.push({ text: 'Apprecie', tone: 'liked' });
  if (negativeWeight >= 3 && negativeWeight > positiveWeight) labels.push({ text: 'Controverse', tone: 'warning' });

  return labels.slice(0, 3);
}

function clusterNotes(entries, region) {
  if (!entries.length) return [];

  const latitudeDelta = Math.max(region?.latitudeDelta || 0.02, 0.0025);
  const longitudeDelta = Math.max(region?.longitudeDelta || 0.02, 0.0025);
  const latStep = Math.max(latitudeDelta / 7, 0.0011);
  const lngStep = Math.max(longitudeDelta / 6, 0.0011);
  const buckets = new Map();

  entries.forEach((note) => {
    if (!Number.isFinite(note.lat) || !Number.isFinite(note.lng)) return;
    const key = `${Math.round(note.lat / latStep)}:${Math.round(note.lng / lngStep)}`;
    const bucket = buckets.get(key) || [];
    bucket.push(note);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.values()).flatMap((group, index) => {
    if (group.length === 1) {
      return { type: "note", note: group[0] };
    }

    const lat = group.reduce((sum, note) => sum + note.lat, 0) / group.length;
    const lng = group.reduce((sum, note) => sum + note.lng, 0) / group.length;
    const liveCount = group.filter((note) => note.isLive).length;
    const latValues = group.map((note) => note.lat);
    const lngValues = group.map((note) => note.lng);
    const latSpread = Math.max(...latValues) - Math.min(...latValues);
    const lngSpread = Math.max(...lngValues) - Math.min(...lngValues);
    const canSpiderfy =
      latitudeDelta <= 0.012 &&
      longitudeDelta <= 0.012 &&
      latSpread <= 0.00008 &&
      lngSpread <= 0.00008;

    if (canSpiderfy) {
      const baseLatRadius = Math.min(Math.max(latitudeDelta * 0.11, 0.00007), 0.00018);
      const baseLngRadius = Math.min(Math.max(longitudeDelta * 0.11, 0.00007), 0.00018);

      return group.map((note, noteIndex) => {
        const ring = Math.floor(noteIndex / 6);
        const itemsInRing = Math.min(6, group.length - (ring * 6));
        const slot = noteIndex % 6;
        const angle = (-Math.PI / 2) + ((Math.PI * 2 * slot) / itemsInRing);
        const ringScale = 1 + (ring * 0.55);

        return {
          type: "note",
          note: {
            ...note,
            renderLat: lat + (Math.sin(angle) * baseLatRadius * ringScale),
            renderLng: lng + (Math.cos(angle) * baseLngRadius * ringScale),
            isSpiderfied: true
          }
        };
      });
    }

    return {
      type: "cluster",
      id: `cluster-${index}-${group[0].id}`,
      lat,
      lng,
      notes: group,
      liveCount,
      archiveCount: group.length - liveCount,
      latitudeDelta: Math.max(latitudeDelta * 0.45, 0.006),
      longitudeDelta: Math.max(longitudeDelta * 0.45, 0.006)
    };
  });
}

function SpeakerGlyph({ tone = "#f8fbff" }) {
  return (
    <View style={speakerStyles.wrapper}>
      <View style={[speakerStyles.box, { backgroundColor: tone }]} />
      <View style={[speakerStyles.cone, { borderLeftColor: tone }]} />
      <View style={[speakerStyles.waveOne, { borderColor: tone, borderLeftColor: "transparent", borderTopColor: "transparent", borderBottomColor: "transparent" }]} />
      <View style={[speakerStyles.waveTwo, { borderColor: tone, borderLeftColor: "transparent", borderTopColor: "transparent", borderBottomColor: "transparent" }]} />
    </View>
  );
}

function CustomPin({ scale = 1, opacity = 1, color = "#4f7cff", tone = "#f8fbff", glow = 0 }) {
  const haloOpacity = glow > 0 ? 0.16 + (glow * 0.28) : 0;
  const haloScale = 1 + (glow * 0.18);
  const circleGlow = glow > 0 ? {
    shadowColor: color,
    shadowOpacity: 0.26 + (glow * 0.18),
    shadowRadius: 8 + (glow * 4),
    elevation: 6 + Math.round(glow * 3),
    borderColor: glow > 0.72 ? "#fff6cf" : "#fff"
  } : null;

  return (
    <View style={[pinStyles.wrapper, { transform: [{ scale }], opacity }]}>
      {glow > 0 ? (
        <View
          style={[
            pinStyles.glow,
            {
              backgroundColor: color,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }]
            }
          ]}
        />
      ) : null}
      <View style={[pinStyles.circle, circleGlow, { backgroundColor: color }]}>
        <SpeakerGlyph tone={tone} />
      </View>
      <View style={[pinStyles.pointer, { borderTopColor: color }]} />
    </View>
  );
}

function ClusterPin({ archiveCount = 0, liveCount = 0 }) {
  return (
    <View style={clusterPinStyles.wrapper}>
      <View style={clusterPinStyles.row}>
        <View style={[clusterPinStyles.half, clusterPinStyles.archiveHalf]}>
          <Text style={clusterPinStyles.count}>{archiveCount}</Text>
          <Text style={clusterPinStyles.label}>sons</Text>
        </View>
        <View style={[clusterPinStyles.half, clusterPinStyles.liveHalf]}>
          <Text style={clusterPinStyles.count}>{liveCount}</Text>
          <Text style={clusterPinStyles.label}>live</Text>
        </View>
      </View>
      <View style={clusterPinStyles.pointer} />
    </View>
  );
}

function UserPin() {
  return (
    <View style={userPinStyles.wrapper}>
      <View style={userPinStyles.circle}>
        <View style={userPinStyles.dot} />
      </View>
      <View style={userPinStyles.pointer} />
    </View>
  );
}

const speakerStyles = StyleSheet.create({
  wrapper: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center"
  },
  box: {
    position: "absolute",
    left: 1,
    width: 6,
    height: 8,
    borderRadius: 2
  },
  cone: {
    position: "absolute",
    left: 6,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: "transparent",
    borderBottomColor: "transparent"
  },
  waveOne: {
    position: "absolute",
    left: 10,
    width: 8,
    height: 8,
    borderWidth: 2,
    borderRadius: 999
  },
  waveTwo: {
    position: "absolute",
    left: 10,
    width: 12,
    height: 12,
    borderWidth: 2,
    borderRadius: 999
  }
});

const pinStyles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center", width: 48, height: 58 },
  glow: {
    position: "absolute",
    top: 4,
    width: 42,
    height: 42,
    borderRadius: 21
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 6,
    elevation: 5
  },
  pointer: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2
  }
});

const clusterPinStyles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center", width: 78, height: 62 },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4
  },
  half: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  archiveHalf: { backgroundColor: "#4f7cff" },
  liveHalf: { backgroundColor: "#ff4757" },
  count: { color: "#fff", fontWeight: "800", fontSize: 14, lineHeight: 16 },
  label: { color: "rgba(255,255,255,0.8)", fontSize: 9, textTransform: "uppercase" },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#2b3042",
    marginTop: -1
  }
});

const userPinStyles = StyleSheet.create({
  wrapper: { alignItems: "center", justifyContent: "center", width: 28, height: 34 },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#2ed573",
    borderWidth: 2,
    borderColor: "#f7fff9",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#f7fff9"
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#2ed573",
    marginTop: -1
  }
});

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
      <CustomPin scale={scale} opacity={opacity} color="#ff4757" tone="#fff7f8" />
    </View>
  );
}

const livePulseStyles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", width: 60, height: 60 },
  ring: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: "#ff4757",
    backgroundColor: "transparent"
  }
});

function FloatingSurface({ children, style, visible = true, delay = 0 }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      delay,
      useNativeDriver: true
    }).start();
  }, [delay, progress, visible]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }
          ]
        }
      ]}
    >
      {children}
    </Animated.View>
  );
}

function MiniPlayerWave({ active = false, color = "#ff8a97" }) {
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      wave.stopAnimation();
      wave.setValue(0);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 380, useNativeDriver: true })
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, wave]);

  return (
    <View style={miniWaveStyles.row}>
      {[0, 1, 2].map((index) => {
        const scaleY = active
          ? wave.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange:
              index === 1 ? [0.7, 1.22, 0.7] : index === 0 ? [0.58, 1, 0.58] : [0.48, 0.84, 0.48]
          })
          : 1;
        return (
          <Animated.View
            key={index}
            style={[miniWaveStyles.bar, { backgroundColor: color, transform: [{ scaleY }] }]}
          />
        );
      })}
    </View>
  );
}

const miniWaveStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginRight: 10 },
  bar: { width: 3, height: 16, borderRadius: 999, opacity: 0.95 }
});
export default function App() {
  const [apiBase] = useState(DEFAULT_API);
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
  const [creationMenuOpen, setCreationMenuOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState("audio");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [showNoteDetails, setShowNoteDetails] = useState(false);
  const [showExpandedDetails, setShowExpandedDetails] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02
  });

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
  const [liveBusy, setLiveBusy] = useState(false);

  const mapRef = useRef(null);
  const hasCenteredOnUser = useRef(false);
  const soundRef = useRef(null);
  const previewSoundRef = useRef(null);
  const meterTimerRef = useRef(null);
  const successTimerRef = useRef(null);
  const errorTimerRef = useRef(null);
  const clientIdRef = useRef("");
  const locationAlertOpenRef = useRef(false);
  const liveRef = useRef({
    active: false,
    streamId: "",
    chunkRecording: null
  });
  const fabProgress = useRef(new Animated.Value(0)).current;
  const ensureClientId = useCallback(async () => {
    if (clientIdRef.current) return clientIdRef.current;
    const baseUri = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseUri) return "";

    const clientIdUri = `${baseUri}vocal-walls-client-id.txt`;
    try {
      const info = await FileSystem.getInfoAsync(clientIdUri);
      if (info.exists) {
        const stored = (await FileSystem.readAsStringAsync(clientIdUri)).trim();
        if (stored) {
          clientIdRef.current = stored;
          return stored;
        }
      }
    } catch (_readError) {}

    const created = `vw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await FileSystem.writeAsStringAsync(clientIdUri, created);
    } catch (_writeError) {}
    clientIdRef.current = created;
    return created;
  }, []);
  const apiRequest = useCallback(
    async (path, options = {}) => {
      const requestOptions = {
        method: options.method || "GET",
        headers: { ...(options.headers || {}) }
      };
      const clientId = await ensureClientId();
      if (clientId) {
        requestOptions.headers["x-client-id"] = clientId;
      }

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
    [apiBase, ensureClientId]
  );

  const loadNotes = useCallback(
    async (silent = false) => {
      try {
        const [archiveNotes, liveNotes] = await Promise.all([
          apiRequest("/api/notes?mode=archive"),
          apiRequest("/api/streams?active=true")
        ]);
        const merged = [...liveNotes, ...archiveNotes].map((entry) => normalize(entry));
        const deduped = Array.from(new Map(merged.map((entry) => [entry.id, entry])).values());
        const nextVotes = {};
        const nextReports = {};
        deduped.forEach((entry) => {
          if (entry.clientVote) nextVotes[entry.id] = entry.clientVote;
          if (entry.clientReported) nextReports[entry.id] = true;
        });
        setNotes(deduped);
        setVotedMap(nextVotes);
        setReportedMap(nextReports);
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
    [apiRequest]
  );

  useEffect(() => {
    void ensureClientId();
    void loadNotes(false);
    const timer = setInterval(() => {
      void loadNotes(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [ensureClientId, loadNotes]);
  const showLocationSettingsPrompt = useCallback(() => {
    if (locationAlertOpenRef.current) return;
    locationAlertOpenRef.current = true;
    Alert.alert(
      "Localisation requise",
      "Activez la localisation pour explorer la carte, publier au bon endroit et limiter la triche.",
      [
        {
          text: "Plus tard",
          style: "cancel",
          onPress: () => {
            locationAlertOpenRef.current = false;
          }
        },
        {
          text: "Reglages",
          onPress: () => {
            locationAlertOpenRef.current = false;
            void Linking.openSettings().catch(() => {});
          }
        }
      ],
      {
        cancelable: true,
        onDismiss: () => {
          locationAlertOpenRef.current = false;
        }
      }
    );
  }, []);
  const ensureLocationPermissions = useCallback(async (options = {}) => {
    const promptIfPossible = options.promptIfPossible !== false;
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      setError("Activez la localisation sur votre appareil.");
      showLocationSettingsPrompt();
      throw new Error("Localisation desactivee");
    }

    const currentPerm = await Location.getForegroundPermissionsAsync();
    if (currentPerm.granted) {
      return currentPerm;
    }

    if (promptIfPossible && currentPerm.canAskAgain !== false) {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (requested.granted) {
        setError("");
        return requested;
      }
      if (requested.canAskAgain === false) {
        setError("Autorisez la localisation dans Reglages.");
        showLocationSettingsPrompt();
      }
      throw new Error("Permission localisation refusee");
    }

    setError("Autorisez la localisation dans Reglages.");
    showLocationSettingsPrompt();
    throw new Error("Permission localisation refusee");
  }, [showLocationSettingsPrompt]);

  const readLocation = useCallback(async (accuracy = Location.Accuracy.Balanced) => {
    await ensureLocationPermissions();
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy,
        maximumAge: 5000,
        timeout: 8000
      });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch (locError) {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 120000,
        requiredAccuracy: 500
      });
      if (lastKnown?.coords) {
        return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
      }
      throw locError;
    }
  }, [ensureLocationPermissions]);
  const updateLocation = useCallback(async () => {
    try {
      const next = await readLocation(Location.Accuracy.Balanced);
      setCoords(next);
      setComposerCoords(next);
      setError("");

      if (!hasCenteredOnUser.current) {
        const nextRegion = {
          latitude: next.lat,
          longitude: next.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        };
        setMapRegion(nextRegion);
        if (mapRef.current?.animateToRegion) {
          mapRef.current.animateToRegion(nextRegion, 450);
        }
        hasCenteredOnUser.current = true;
      }
    } catch (locError) {
      setError(locError.message || "Localisation indisponible");
    }
  }, [readLocation]);
  useEffect(() => {
    if (!composerOpen && !isManualPos) {
      setComposerCoords(coords);
    }
  }, [composerOpen, coords, isManualPos]);


  useEffect(() => {
    void ensureLocationPermissions({ promptIfPossible: true })
      .then(() => updateLocation())
      .catch(() => {});
  }, [ensureLocationPermissions, updateLocation]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void ensureLocationPermissions({ promptIfPossible: false })
        .then(() => updateLocation())
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [ensureLocationPermissions, updateLocation]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
      if (previewSoundRef.current) {
        void previewSoundRef.current.unloadAsync();
      }
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
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

  useEffect(() => {
    Animated.spring(fabProgress, {
      toValue: creationMenuOpen ? 1 : 0,
      stiffness: 260,
      damping: 18,
      mass: 0.8,
      useNativeDriver: true
    }).start();
  }, [creationMenuOpen, fabProgress]);

  const mapNotes = useMemo(
    () =>
      notes
        .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng))
        .map((entry) => {
          const visuals = getMarkerVisuals(entry);
          const isFocused = entry.id === selectedNoteId || entry.id === playingId;
          const hasFocus = Boolean(selectedNoteId || playingId);

          return {
            ...entry,
            ...visuals,
            markerScale: isFocused ? visuals.markerScale + 0.12 : visuals.markerScale,
            markerOpacity: hasFocus && !isFocused ? Math.max(0.24, visuals.markerOpacity * 0.62) : visuals.markerOpacity,
            markerGlow: isFocused ? Math.min(1, visuals.markerGlow + 0.22) : visuals.markerGlow
          };
        }),
    [notes, playingId, selectedNoteId]
  );
  const selectedNote = useMemo(
    () => notes.find((entry) => entry.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );
  const playbackNote = useMemo(
    () => notes.find((entry) => entry.id === playingId) || null,
    [notes, playingId]
  );
  const visibleMarkers = useMemo(
    () => clusterNotes(mapNotes, mapRegion),
    [mapNotes, mapRegion]
  );
  const detailNotes = useMemo(
    () => mapNotes.slice().sort((left, right) => Number(right.isLive) - Number(left.isLive)),
    [mapNotes]
  );
  const selectedDetailIndex = useMemo(
    () => detailNotes.findIndex((entry) => entry.id === selectedNoteId),
    [detailNotes, selectedNoteId]
  );

  const focusNote = useCallback(
    (note, options = {}) => {
      if (!note) return;
      const shouldAnimate = options.animate !== false;
      setSelectedNoteId(note.id);
      setShowNoteDetails(true);
      setShowExpandedDetails(false);
      setComposerOpen(false);
      setCreationMenuOpen(false);
      setMenuOpen(false);
      setSelectedCluster(null);
      if (shouldAnimate && mapRef.current?.animateToRegion) {
        mapRef.current.animateToRegion(
          {
            latitude: note.lat,
            longitude: note.lng,
            latitudeDelta: Math.max((mapRegion?.latitudeDelta || 0.02) * 0.7, 0.006),
            longitudeDelta: Math.max((mapRegion?.longitudeDelta || 0.02) * 0.7, 0.006)
          },
          350
        );
      }
    },
    [mapRegion]
  );


  const openCluster = useCallback(
    (cluster) => {
      if (!cluster) return;
      setSelectedCluster(cluster);
      setSelectedNoteId("");
      setShowNoteDetails(false);
      setShowExpandedDetails(false);
      setComposerOpen(false);
      setCreationMenuOpen(false);
      setMenuOpen(false);
    },
    []
  );

  const stepSelectedNote = useCallback(
    (direction) => {
      if (!detailNotes.length) return;
      const currentIndex = detailNotes.findIndex((entry) => entry.id === selectedNoteId);
      const baseIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex = (baseIndex + direction + detailNotes.length) % detailNotes.length;
      focusNote(detailNotes[nextIndex]);
    },
    [detailNotes, focusNote, selectedNoteId]
  );

  const jumpToExplore = useCallback(
    (mode) => {
      const pool = mapNotes.filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng));
      if (!pool.length) return;

      let target = null;
      if (mode === 'live') {
        target = pool.filter((entry) => entry.isLive).sort((left, right) => (right.listeners || 0) - (left.listeners || 0) || (right.plays || 0) - (left.plays || 0) || getScore(right) - getScore(left))[0] || null;
      } else if (mode === 'top') {
        target = pool.slice().sort((left, right) => getScore(right) - getScore(left) || (right.plays || 0) - (left.plays || 0) || Number(right.isLive) - Number(left.isLive))[0] || null;
      } else {
        target = pool.slice().sort((left, right) => {
          const leftDist = Math.abs(left.lat - coords.lat) + Math.abs(left.lng - coords.lng);
          const rightDist = Math.abs(right.lat - coords.lat) + Math.abs(right.lng - coords.lng);
          return leftDist - rightDist || Number(right.isLive) - Number(left.isLive) || (right.plays || 0) - (left.plays || 0);
        })[0] || null;
      }

      if (!target) {
        showTransientError(mode === 'live' ? 'Aucun live pour le moment' : 'Aucun son disponible');
        return;
      }
      setError("");
      focusNote(target);
    },
    [coords.lat, coords.lng, focusNote, mapNotes, showTransientError]
  );

  const upsertLocal = useCallback((updated) => {
    const normalized = normalize(updated);
    setVotedMap((prev) => {
      const next = { ...prev };
      if (normalized.clientVote) {
        next[normalized.id] = normalized.clientVote;
      } else {
        delete next[normalized.id];
      }
      return next;
    });
    setReportedMap((prev) => {
      const next = { ...prev };
      if (normalized.clientReported) {
        next[normalized.id] = true;
      } else {
        delete next[normalized.id];
      }
      return next;
    });
    setNotes((prev) => [normalized, ...prev.filter((n) => n.id !== normalized.id)]);
    return normalized;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadNotes(true);
  }, [loadNotes]);
  const showSuccess = useCallback((msg) => {
    setSuccessMsg(msg);
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      setSuccessMsg("");
      successTimerRef.current = null;
    }, 1500);
  }, []);
  const showTransientError = useCallback((msg, duration = 2000) => {
    setError(msg);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = setTimeout(() => {
      setError("");
      errorTimerRef.current = null;
    }, duration);
  }, []);

  const recenterMap = useCallback(() => {
    const nextRegion = {
      latitude: coords.lat,
      longitude: coords.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02
    };
    setSelectedCluster(null);
    setMenuOpen(false);
    setCreationMenuOpen(false);
    setMapRegion(nextRegion);
    if (mapRef.current?.animateToRegion) {
      mapRef.current.animateToRegion(nextRegion, 320);
    }
  }, [coords.lat, coords.lng]);

  const refreshMap = useCallback(() => {
    setMenuOpen(false);
    onRefresh();
  }, [onRefresh]);

  const openLocationSettings = useCallback(() => {
    setMenuOpen(false);
    void Linking.openSettings().catch(() => {});
  }, []);

  const openComposerFor = useCallback((mode) => {
    setComposerIntent(mode);
    if (mode !== "live") setIsManualPos(false);
    setComposerCoords(mode === "live" && isManualPos ? composerCoords : coords);
    setSelectedCluster(null);
    setSelectedNoteId("");
    setShowNoteDetails(false);
    setShowExpandedDetails(false);
    setMenuOpen(false);
    setCreationMenuOpen(false);
    setComposerOpen(true);
  }, [composerCoords, coords, isManualPos]);


  const openQuickHelp = useCallback(() => {
    setMenuOpen(false);
    Alert.alert(
      "Aide rapide",
      "Le point vert, c'est vous.\nLes lives sont rouges.\nZoomez pour separer les groupes.\nTouchez un son pour l'ouvrir."
    );
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
      const next = await readLocation(Location.Accuracy.High);
      setCoords(next);
      setComposerCoords(next);
      setError("");
    } catch (_locError) {
      setError("Impossible de recuperer votre position. Activez la localisation precise sur votre appareil.");
    }
  }, [isManualPos, readLocation]);  const startMeterPolling = useCallback((rec) => {
    setMeterLevels([]);
    meterTimerRef.current = setInterval(async () => {
      try {
        const status = await rec.getStatusAsync();
        if (status.isRecording && status.metering != null) {          const db = status.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setMeterLevels((prev) => {
            const next = [...prev, normalized];
            return next.length > METER_BARS ? next.slice(-METER_BARS) : next;
          });
        }
      } catch (_e) {      }
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
  }, []);  const togglePreview = useCallback(async () => {
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
    try {      await Audio.setAudioModeAsync({
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
      setError("Impossible de lire l'apercu");
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
  }, []);  const publishNote = useCallback(async () => {
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
      const noteCoords = await readLocation(Location.Accuracy.Balanced);
      setCoords(noteCoords);
      if (!isManualPos) {
        setComposerCoords(noteCoords);
      }
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        author: cleanAuthor,
        category: "Communaute",
        icon: "AUDIO",
        type: "story",
        duration: 120,
        isLive: false,
        lat: noteCoords.lat,
        lng: noteCoords.lng,
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
      showSuccess("Son publie sur la carte.");
    } catch (requestError) {
      setApiOnline(Boolean(requestError?.status));
      setError(requestError.message || "Publication impossible");
    } finally {
      setPublishing(false);
    }
  }, [
    title, author, description, recordedUri, composerCoords,
    apiRequest, buildFormData, isManualPos, readLocation, upsertLocal, showSuccess
  ]);

  const submitVote = useCallback(
    async (note, type) => {
      const previousVote = votedMap[note.id];
      const nextVote = previousVote === type ? null : type;

      setVotedMap((prev) => {
        const next = { ...prev };
        if (nextVote) {
          next[note.id] = nextVote;
        } else {
          delete next[note.id];
        }
        return next;
      });

      let newLikes = note.likes || 0;
      let newDown = note.downvotes || 0;

      if (previousVote === "like") {
        newLikes = Math.max(0, newLikes - 1);
      } else if (previousVote === "dislike") {
        newDown = Math.max(0, newDown - 1);
      }

      if (nextVote === "like") {
        newLikes++;
      } else if (nextVote === "dislike") {
        newDown++;
      }

      upsertLocal({ ...note, likes: newLikes, downvotes: newDown, clientVote: nextVote });

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


  const deleteOwnNote = useCallback(
    (note) => {
      if (!note?.canDelete) return;
      Alert.alert(
        "Supprimer ce son ?",
        "Cette suppression est definitive.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  if (playingId === note.id) {
                    await stopPlayback();
                  }
                  await apiRequest(`/api/notes/${note.id}`, { method: "DELETE" });
                  setNotes((prev) => prev.filter((entry) => entry.id !== note.id));
                  setVotedMap((prev) => {
                    const next = { ...prev };
                    delete next[note.id];
                    return next;
                  });
                  setReportedMap((prev) => {
                    const next = { ...prev };
                    delete next[note.id];
                    return next;
                  });
                  setSelectedNoteId((prev) => (prev === note.id ? "" : prev));
                  setShowExpandedDetails(false);
                  setShowNoteDetails(false);
                  showSuccess(note.isLive ? "Live supprime." : "Son supprime.");
                  setApiOnline(true);
                } catch (requestError) {
                  setApiOnline(Boolean(requestError?.status));
                  setError(requestError.message || "Suppression impossible");
                }
              })();
            }
          }
        ]
      );
    },
    [apiRequest, playingId, showSuccess, stopPlayback]
  );
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
        await stopPlayback();        await Audio.setAudioModeAsync({
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
        } catch (_e) {        }
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
      const liveCoords = isManualPos
        ? composerCoords
        : await readLocation(Location.Accuracy.High);
      if (!isManualPos) {
        setCoords(liveCoords);
        setComposerCoords(liveCoords);
      }
      const payload = {
        title: cleanTitle,
        description: cleanDescription,
        author: cleanAuthor,
        category: "Live",
        icon: "LIVE",
        type: "live",
        duration: 180,
        isLive: true,
        lat: liveCoords.lat,
        lng: liveCoords.lng,
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
    ensureAudioPermissions, isManualPos, readLocation, recordedUri, runLiveLoop, title, upsertLocal
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
      setLiveBusy(false);
      void loadNotes(true);
    }
  }, [apiRequest, loadNotes, upsertLocal]);  const listenToLive = useCallback(async (note) => {
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
      setError(playError.message || "Impossible d'ecouter le live");
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
  }  const progressRatio = playbackDur > 0 ? playbackPos / playbackDur : 0;
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <MapView
        ref={mapRef}
        style={styles.mapFullscreen}
        initialRegion={mapRegion}
        onRegionChangeComplete={(nextRegion) => {
          setMapRegion(nextRegion);
        }}
        onPress={(event) => {
          if (composerOpen && composerIntent === "live" && isManualPos) {
            const next = {
              lat: event.nativeEvent.coordinate.latitude,
              lng: event.nativeEvent.coordinate.longitude
            };
            setComposerCoords(next);
            return;
          }

          if (!composerOpen) {
            setSelectedNoteId("");
            setShowNoteDetails(false);
            setSelectedCluster(null);
            setMenuOpen(false);
            setCreationMenuOpen(false);
          }
        }}
      >
        {composerOpen ? (
          <Marker
            coordinate={{ latitude: composerCoords.lat, longitude: composerCoords.lng }}
            draggable={composerIntent === "live" && isManualPos}
            onDragEnd={(event) => {
              const { latitude, longitude } = event.nativeEvent.coordinate;
              setComposerCoords({ lat: latitude, lng: longitude });
            }}
            title="Position du son"
            tracksViewChanges={false}
          >
            <CustomPin
              scale={1.08}
              opacity={1}
              color={composerIntent === "live" && isManualPos ? "#ff7a59" : "#ff4757"}
              tone="#fff8f4"
            />
          </Marker>
        ) : (
          <Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }} title="Moi" tracksViewChanges={false}>
            <UserPin />
          </Marker>
        )}

        {visibleMarkers.map((entry) => {
          if (entry.type === "cluster") {
            return (
              <Marker
                key={entry.id}
                coordinate={{ latitude: entry.lat, longitude: entry.lng }}
                tracksViewChanges={false}
                onSelect={() => openCluster(entry)}
                onPress={(event) => {
                  event.stopPropagation?.();
                  openCluster(entry);
                }}
              >
                <ClusterPin archiveCount={entry.archiveCount} liveCount={entry.liveCount} />
              </Marker>
            );
          }

          const note = entry.note;

          return (
            <Marker
              key={note.id}
              coordinate={{
                latitude: Number.isFinite(note.renderLat) ? note.renderLat : note.lat,
                longitude: Number.isFinite(note.renderLng) ? note.renderLng : note.lng
              }}
              title={note.title}
              description={note.author}
              tracksViewChanges={note.isLive}
              onSelect={() => focusNote(note, { animate: false })}
              onPress={(event) => {
                event.stopPropagation?.();
                focusNote(note, { animate: false });
              }}
            >
              {note.isLive ? (
                <LivePulseMarker scale={note.markerScale} opacity={note.markerOpacity} />
              ) : (
                <CustomPin
                  scale={note.markerScale}
                  opacity={note.markerOpacity}
                  color={note.markerColor}
                  tone={note.markerTone}
                  glow={note.markerGlow}
                />
              )}
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.headerTop}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Vocal Walls</Text>
            <Text style={styles.headerBadge}>{apiOnline ? "Carte sonore mixte" : "Mode hors ligne"}</Text>
          </View>
          <Pressable style={styles.menuButton} onPress={() => { setSelectedCluster(null); setCreationMenuOpen(false); setMenuOpen((prev) => !prev); }}>
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
        </View>
        {menuOpen ? (
          <View style={styles.menuPanel}>
            <Text style={styles.menuPanelTitle}>Menu</Text>
            <Text style={styles.menuPanelText}>Le plus simple pour explorer la carte sans vous perdre.</Text>
            <Pressable style={styles.menuAction} onPress={recenterMap}>
              <Text style={styles.menuActionText}>Me recentrer</Text>
            </Pressable>
            <Pressable style={styles.menuAction} onPress={refreshMap}>
              <Text style={styles.menuActionText}>Rafraichir la carte</Text>
            </Pressable>
            <Pressable style={styles.menuAction} onPress={openLocationSettings}>
              <Text style={styles.menuActionText}>Activer la localisation</Text>
            </Pressable>
            <Pressable style={styles.menuAction} onPress={openQuickHelp}>
              <Text style={styles.menuActionText}>Aide rapide</Text>
            </Pressable>
          </View>
        ) : null}
        {!composerOpen ? (
          <View style={styles.quickExploreRow}>
            <Pressable style={styles.quickExploreBtn} onPress={recenterMap}>
              <Text style={styles.quickExploreText}>Centrer</Text>
            </Pressable>
            <Pressable style={styles.quickExploreBtn} onPress={() => jumpToExplore('live')}>
              <Text style={styles.quickExploreText}>Live</Text>
            </Pressable>
          </View>
        ) : null}
        {!composerOpen && error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View> : null}
        {successMsg ? (
          <FloatingSurface style={styles.successBanner} delay={40}>
            <Text style={styles.successText}>{successMsg}</Text>
          </FloatingSurface>
        ) : null}
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.bottomSheetContainer}
        pointerEvents="box-none"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {composerOpen && (
          <View style={[styles.panel, styles.composerPanel]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{composerIntent === "live" ? "Nouveau live" : "Nouveau son"}</Text>
              <Pressable onPress={() => setComposerOpen(false)}>
                <Text style={styles.closeText}>Fermer</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.composerScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {composerIntent === "audio" ? (
                <>
                  <Text style={styles.coordText}>Son classique: GPS reel</Text>
                  <Pressable style={styles.usePosBtn} onPress={() => void updateLocation()}>
                    <Text style={styles.usePosText}>Mettre a jour ma position GPS</Text>
                  </Pressable>
                  <Text style={styles.coordText}>
                    {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} - GPS reel
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
                      {recordingOn ? "Enregistrement en cours..." : recordedUri ? "Audio pret" : "Appuyez pour enregistrer"}
                    </Text>

                    {recordingOn && meterLevels.length > 0 ? (
                      <View style={styles.waveformContainer}>
                        {meterLevels.map((level, index) => (
                          <View
                            key={index}
                            style={[
                              styles.waveformBar,
                              { height: Math.max(4, level * 36) }
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}

                    {recordedUri && !recordingOn ? (
                      <View style={styles.previewRow}>
                        <Pressable onPress={togglePreview} style={styles.previewBtn}>
                          <Text style={styles.previewText}>{previewPlaying ? "Arreter" : "Reecouter"}</Text>
                        </Pressable>
                        <Pressable onPress={clearRecorded} style={styles.clearBtn}>
                          <Text style={styles.clearText}>Effacer</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                  <Pressable style={[styles.publishBtn, (publishing || !recordedUri || !title) && styles.disabled]} disabled={publishing || !recordedUri || !title} onPress={() => void publishNote()}>
                    <Text style={styles.publishText}>{publishing ? "Envoi..." : "Publier"}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Titre du live..." placeholderTextColor="#81838f" />
                  <TextInput style={styles.inputDesc} value={description} onChangeText={setDescription} placeholder="Description (optionnel)" placeholderTextColor="#81838f" multiline />
                  <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Votre pseudo" placeholderTextColor="#81838f" />

                  <View style={styles.liveSection}>
                    <Text style={styles.liveLabel}>Parametres du direct</Text>
                    <View style={styles.locToggleRow}>
                      <Text style={styles.locToggleLabel}>Vie privee du live</Text>
                      <Switch
                        value={isManualPos}
                        onValueChange={setIsManualPos}
                        trackColor={{ false: "#767577", true: "#ff4757" }}
                      />
                    </View>

                    {!isManualPos ? (
                      <Pressable style={styles.usePosBtn} onPress={() => void updateComposerLocation()}>
                        <Text style={styles.usePosText}>Utiliser ma position actuelle pour le live</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.manualHint}>Touchez la carte ou deplacez le pin pour choisir la zone du live.</Text>
                    )}

                    <Text style={styles.coordText}>
                      Live: {composerCoords.lat.toFixed(4)}, {composerCoords.lng.toFixed(4)} - {isManualPos ? "Position privee" : "GPS reel"}
                    </Text>
                    <View style={styles.liveActions}>
                      <Pressable style={[styles.miniBtn, liveActive && styles.disabled]} onPress={() => void startLive()} disabled={liveActive || liveBusy}>
                        <Text style={styles.miniBtnText}>Go Live</Text>
                      </Pressable>
                      <Pressable style={[styles.miniBtn, !liveActive && styles.disabled]} onPress={() => void stopLive()} disabled={!liveActive || liveBusy}>
                        <Text style={styles.miniBtnText}>Stop Live</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        )}

        {!composerOpen && !showNoteDetails && selectedCluster ? (
          <View style={[styles.panel, styles.clusterPanel]}>
            <View style={styles.panelHeader}>
              <View style={styles.clusterHeaderCopy}>
                <Text style={styles.panelTitle}>Zone dense</Text>
                <Text style={styles.clusterSummary}>{`${selectedCluster.liveCount} live - ${selectedCluster.archiveCount} sons`}</Text>
              </View>
              <Pressable onPress={() => setSelectedCluster(null)}>
                <Text style={styles.closeText}>Fermer</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.clusterZoomBtn}
              onPress={() => {
                mapRef.current?.animateToRegion(
                  {
                    latitude: selectedCluster.lat,
                    longitude: selectedCluster.lng,
                    latitudeDelta: selectedCluster.latitudeDelta,
                    longitudeDelta: selectedCluster.longitudeDelta
                  },
                  280
                );
                setSelectedCluster(null);
              }}
            >
              <Text style={styles.clusterZoomText}>Zoomer ici</Text>
            </Pressable>
            <ScrollView style={styles.clusterList} showsVerticalScrollIndicator={false}>
              {selectedCluster.notes.slice(0, 6).map((note) => (
                <Pressable key={note.id} style={styles.clusterItem} onPress={() => focusNote(note, { animate: false })}>
                  <View style={[styles.clusterItemDot, note.isLive ? styles.clusterItemDotLive : styles.clusterItemDotArchive]} />
                  <View style={styles.clusterItemCopy}>
                    <Text style={styles.clusterItemTitle} numberOfLines={1}>{note.title}</Text>
                    <Text style={styles.clusterItemMeta} numberOfLines={1}>{`${note.isLive ? "Live" : "Son"} - ${note.author || "Mobile User"}`}</Text>
                  </View>
                  <Text style={styles.clusterItemArrow}>></Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {showNoteDetails && selectedNote && !composerOpen ? (
          showExpandedDetails ? (
            <FloatingSurface style={[styles.panel, styles.expandedDetailsCard]} delay={35}>
              <View style={styles.panelHeader}>
                <Pressable style={styles.secondaryActionBtn} onPress={() => setShowExpandedDetails(false)}>
                  <Text style={styles.secondaryActionText}>Retour</Text>
                </Pressable>
                <Text style={styles.panelTitle} numberOfLines={1}>{selectedNote.title}</Text>
                <Pressable onPress={() => { setShowExpandedDetails(false); setShowNoteDetails(false); }}>
                  <Text style={styles.closeText}>Fermer</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.expandedDetailsScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.noteAuthor}>Par {selectedNote.author}</Text>
                <View style={styles.noteLabelRow}>
                  {getNoteLabels(selectedNote).map((label) => (
                    <View key={label.text} style={[styles.noteLabel, styles[`noteLabel_${label.tone}`]]}>
                      <Text style={styles.noteLabelText}>{label.text}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.panelMetaRow}>
                  <View style={styles.panelMetaPill}><Text style={styles.panelMetaText}>{selectedNote.isLive ? "Live" : "Son"}</Text></View>
                  <View style={styles.panelMetaPill}><Text style={styles.panelMetaText}>Ecoutes {selectedNote.plays || 0}</Text></View>
                </View>

                <Text style={styles.expandedNoteDesc}>{selectedNote.description || "Aucune description."}</Text>

                <View style={styles.playSection}>
                  {selectedNote.isLive ? (
                    <Pressable
                      style={[styles.playBtn, styles.livePlayBtn, !selectedNote.audioUrl && styles.disabled]}
                      onPress={() => void (playingId === selectedNote.id ? stopPlayback() : listenToLive(selectedNote))}
                      disabled={!selectedNote.audioUrl}
                    >
                      <Text style={styles.playText}>{playingId === selectedNote.id ? "Arreter" : "Ecouter en direct"}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.playBtn, !selectedNote.audioUrl && styles.disabled]}
                      onPress={() => void playNote(selectedNote)}
                      disabled={!selectedNote.audioUrl}
                    >
                      <Text style={styles.playText}>{playingId === selectedNote.id ? "Arreter" : "Ecouter"}</Text>
                    </Pressable>
                  )}

                  {playingId === selectedNote.id && playbackDur > 0 ? (
                    <View style={styles.progressSection}>
                      <View style={styles.progressRow}>
                        <Text style={styles.progressTime}>{formatTime(playbackPos)}</Text>
                        <Pressable
                          style={styles.progressBarOuter}
                          onPress={(event) => {
                            const { locationX } = event.nativeEvent;
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
                  ) : null}
                </View>

                <View style={styles.voteRow}>
                  <View style={styles.voteSummary}>
                    <Text style={styles.voteSummaryLabel}>Likes</Text>
                    <Text style={styles.voteSummaryCount}>{selectedNote.likes || 0}</Text>
                  </View>

                  <View style={styles.voteActions}>
                    <Pressable
                      style={[styles.arrowBtn, votedMap[selectedNote.id] === "like" && styles.arrowBtnLikeActive]}
                      onPress={() => void submitVote(selectedNote, "like")}
                    >
                      <Text style={[styles.arrowText, votedMap[selectedNote.id] === "like" && styles.arrowTextLikeActive]}>{"\u2191"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.arrowBtn, votedMap[selectedNote.id] === "dislike" && styles.arrowBtnDislikeActive]}
                      onPress={() => void submitVote(selectedNote, "dislike")}
                    >
                      <Text style={[styles.arrowText, votedMap[selectedNote.id] === "dislike" && styles.arrowTextDislikeActive]}>{"\u2193"}</Text>
                    </Pressable>
                    <Pressable style={styles.reportBtn} onPress={() => void submitReport(selectedNote)}>
                      <Text style={styles.reportText}>Signaler</Text>
                    </Pressable>
                    {selectedNote.canDelete && !selectedNote.isLive ? (
                      <Pressable style={styles.deleteBtn} onPress={() => deleteOwnNote(selectedNote)}>
                        <Text style={styles.deleteText}>Supprimer</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            </FloatingSurface>
          ) : (
            <FloatingSurface style={[styles.panel, styles.miniDetailsCard]} delay={20}>
              <View style={styles.panelHeader}>
                <View style={styles.miniDetailsHeaderCopy}>
                  <Text style={styles.panelTitle} numberOfLines={1}>{selectedNote.title}</Text>
                  <Text style={styles.noteAuthor} numberOfLines={1}>Par {selectedNote.author}</Text>
                </View>
                <Pressable onPress={() => { setShowExpandedDetails(false); setShowNoteDetails(false); }}>
                  <Text style={styles.closeText}>Fermer</Text>
                </Pressable>
              </View>

              <View style={styles.noteLabelRow}>
                {getNoteLabels(selectedNote).slice(0, 3).map((label) => (
                  <View key={label.text} style={[styles.noteLabel, styles[`noteLabel_${label.tone}`]]}>
                    <Text style={styles.noteLabelText}>{label.text}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.miniNoteDesc} numberOfLines={2}>
                {selectedNote.description || "Touchez Ecouter pour lancer ce son."}
              </Text>

              <View style={styles.miniDetailsMetaRow}>
                <View style={styles.panelMetaPill}><Text style={styles.panelMetaText}>{selectedNote.isLive ? "Live" : "Son"}</Text></View>
                {selectedNote.isLive ? <Text style={styles.liveBadge}>En direct</Text> : null}
              </View>

              <View style={styles.miniDetailsActions}>
                <View style={styles.voteRow}>
                  <View style={styles.voteSummary}>
                    <Text style={styles.voteSummaryLabel}>Likes</Text>
                    <Text style={styles.voteSummaryCount}>{selectedNote.likes || 0}</Text>
                  </View>
                  <View style={styles.voteActions}>
                    <Pressable
                      style={[styles.arrowBtn, votedMap[selectedNote.id] === "like" && styles.arrowBtnLikeActive]}
                      onPress={() => void submitVote(selectedNote, "like")}
                    >
                      <Text style={[styles.arrowText, votedMap[selectedNote.id] === "like" && styles.arrowTextLikeActive]}>{"\u2191"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.arrowBtn, votedMap[selectedNote.id] === "dislike" && styles.arrowBtnDislikeActive]}
                      onPress={() => void submitVote(selectedNote, "dislike")}
                    >
                      <Text style={[styles.arrowText, votedMap[selectedNote.id] === "dislike" && styles.arrowTextDislikeActive]}>{"\u2193"}</Text>
                    </Pressable>
                    <Pressable style={styles.reportBtn} onPress={() => void submitReport(selectedNote)}>
                      <Text style={styles.reportText}>Signaler</Text>
                    </Pressable>
                    {selectedNote.canDelete && !selectedNote.isLive ? (
                      <Pressable style={styles.deleteBtn} onPress={() => deleteOwnNote(selectedNote)}>
                        <Text style={styles.deleteText}>Supprimer</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.playSection}>
                  {selectedNote.isLive ? (
                    <Pressable
                      style={[styles.playBtn, styles.livePlayBtn, !selectedNote.audioUrl && styles.disabled]}
                      onPress={() => void (playingId === selectedNote.id ? stopPlayback() : listenToLive(selectedNote))}
                      disabled={!selectedNote.audioUrl}
                    >
                      <Text style={styles.playText}>{playingId === selectedNote.id ? "Arreter" : "Ecouter en direct"}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.playBtn, !selectedNote.audioUrl && styles.disabled]}
                      onPress={() => void playNote(selectedNote)}
                      disabled={!selectedNote.audioUrl}
                    >
                      <Text style={styles.playText}>{playingId === selectedNote.id ? "Arreter" : "Ecouter"}</Text>
                    </Pressable>
                  )}
                  {playingId === selectedNote.id && playbackDur > 0 ? (
                    <View style={styles.progressSection}>
                      <View style={styles.progressRow}>
                        <Text style={styles.progressTime}>{formatTime(playbackPos)}</Text>
                        <Pressable
                          style={styles.progressBarOuter}
                          onPress={(event) => {
                            const { locationX } = event.nativeEvent;
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
                  ) : null}
                </View>

                <Pressable style={styles.secondaryActionBtn} onPress={() => setShowExpandedDetails(true)}>
                  <Text style={styles.secondaryActionText}>Voir plus</Text>
                </Pressable>
              </View>
            </FloatingSurface>
          )
        ) : null}

        {!composerOpen && !showNoteDetails && !selectedCluster && playbackNote ? (
          <FloatingSurface style={styles.miniPlayer} delay={50}>
            <Pressable style={styles.miniPlayerMain} onPress={() => focusNote(playbackNote)}>
              <View style={styles.miniPlayerLead}>
                <View style={styles.miniPlayerDot} />
                <MiniPlayerWave active={Boolean(playingId === playbackNote.id)} color={playbackNote.isLive ? "#ff8a97" : "#8fb2ff"} />
              </View>
              <View style={styles.miniPlayerCopy}>
                <Text style={styles.miniPlayerTitle} numberOfLines={1}>{playbackNote.title}</Text>
                <Text style={styles.miniPlayerMeta}>
                  {playbackNote.isLive
                    ? `${Math.max(1, playbackNote.listeners || 0)} en direct`
                    : `${formatTime(playbackPos)} / ${formatTime(playbackDur || 0)}`}
                </Text>
              </View>
            </Pressable>
            <Pressable style={styles.miniPlayerStop} onPress={() => void stopPlayback()}>
              <Text style={styles.miniPlayerStopText}>Stop</Text>
            </Pressable>
          </FloatingSurface>
        ) : null}

        {!composerOpen && !showNoteDetails && !selectedCluster ? (
          <>
            {creationMenuOpen ? <Pressable style={styles.fabBackdrop} onPress={() => setCreationMenuOpen(false)} /> : null}
            {creationMenuOpen ? (
              <FloatingSurface style={styles.fabMenu} delay={25}>
                <Pressable style={[styles.fabOption, styles.fabOptionAudio]} onPress={() => openComposerFor("audio")}>
                  <Text style={styles.fabOptionText}>Audio</Text>
                </Pressable>
                <Pressable style={[styles.fabOption, styles.fabOptionLive]} onPress={() => openComposerFor("live")}>
                  <Text style={styles.fabOptionText}>Live</Text>
                </Pressable>
              </FloatingSurface>
            ) : null}
            <Pressable
              style={styles.fab}
              onPress={() => {
                setMenuOpen(false);
                setSelectedCluster(null);
                setCreationMenuOpen((prev) => !prev);
              }}
            >
              <Animated.Text
                style={[
                  styles.fabText,
                  {
                    transform: [
                      {
                        rotate: fabProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "45deg"]
                        })
                      },
                      {
                        scale: fabProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.08]
                        })
                      }
                    ]
                  }
                ]}
              >
                +
              </Animated.Text>
            </Pressable>
          </>
        ) : null}
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
    backgroundColor: 'rgba(12, 15, 24, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7
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
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(11, 15, 24, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(143,178,255,0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7
  },
  successText: { color: "#f7fbff", fontSize: 12, textAlign: "center", fontWeight: "700", letterSpacing: 0.2 },
  quickExploreRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  quickExploreBtn: {
    backgroundColor: 'rgba(14, 17, 26, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5
  },
  quickExploreText: {
    color: '#f7fbff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2
  },

  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(11, 15, 24, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(143,178,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 10
  },
  miniPlayerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingLeft: 15,
    paddingRight: 10
  },
  miniPlayerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 42,
    marginRight: 10
  },
  miniPlayerDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: '#ff5e70',
    marginRight: 10,
    shadowColor: '#ff5e70',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  miniPlayerCopy: {
    flex: 1
  },
  miniPlayerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  miniPlayerMeta: {
    color: '#9fb2cc',
    fontSize: 12,
    marginTop: 3
  },
  miniPlayerStop: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,71,87,0.14)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.06)'
  },
  miniPlayerStopText: {
    color: '#ff9aa4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2
  },

  bottomSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end'
  },
  panel: {
    backgroundColor: '#161922',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.34,
    shadowRadius: 16,
    elevation: 9,
    maxHeight: "68%"
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  panelTitle: { color: "#fff", fontSize: 18, fontWeight: "800", flex: 1 },
  closeText: { color: "#ff6f7d", fontWeight: "700" },

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
  recordStatus: { color: '#ff6b81', fontSize: 13, fontWeight: '600' },  waveformContainer: {
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
  },  previewRow: {
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
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ff4757',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#ff4757",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 10
  },
  noteLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  noteLabel: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999
  },
  noteLabel_live: { backgroundColor: 'rgba(255,71,87,0.16)' },
  noteLabel_fresh: { backgroundColor: 'rgba(46,213,115,0.18)' },
  noteLabel_popular: { backgroundColor: 'rgba(79,124,255,0.16)' },
  noteLabel_liked: { backgroundColor: 'rgba(255,255,255,0.12)' },
  noteLabel_warning: { backgroundColor: 'rgba(255,184,77,0.18)' },
  noteLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },
  fabText: { color: '#fff', fontSize: 31, marginTop: -2, fontWeight: '700' },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent"
  },
  fabMenu: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 194,
    height: 194,
    pointerEvents: "box-none"
  },
  fabOption: {
    position: "absolute",
    width: 82,
    height: 82,
    borderRadius: 999,
    backgroundColor: "#ff4757",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff4757",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8
  },
  fabOptionAudio: {
    right: 60,
    bottom: 118
  },
  fabOptionLive: {
    right: 112,
    bottom: 58
  },
  fabOptionText: {
    color: "#0f1017",
    fontSize: 14,
    fontWeight: "700"
  },

  clusterPanel: {
    paddingBottom: 20,
    maxHeight: "44%"
  },
  clusterHeaderCopy: {
    flex: 1,
    paddingRight: 12
  },
  clusterSummary: {
    color: "#a4b0be",
    fontSize: 12,
    marginTop: 4
  },
  clusterZoomBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(79,124,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(116,185,255,0.22)",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 14
  },
  clusterZoomText: {
    color: "#dfe8ff",
    fontSize: 12,
    fontWeight: "700"
  },
  clusterList: {
    flexGrow: 0
  },
  clusterItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10
  },
  clusterItemDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: 12
  },
  clusterItemDotLive: { backgroundColor: "#ff4757" },
  clusterItemDotArchive: { backgroundColor: "#4f7cff" },
  clusterItemCopy: {
    flex: 1
  },
  clusterItemTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700"
  },
  clusterItemMeta: {
    color: "#a4b0be",
    fontSize: 12,
    marginTop: 3
  },
  clusterItemArrow: {
    color: "#8ea4ff",
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 10
  },

  detailsPanel: {
    paddingBottom: 40
  },
  miniDetailsCard: {
    paddingBottom: 22,
    maxHeight: 340
  },
  expandedDetailsCard: {
    paddingBottom: 18,
    maxHeight: "76%"
  },
  expandedDetailsScroll: {
    flexGrow: 0
  },
  expandedNoteDesc: {
    color: '#dfe4ea',
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 22
  },
  secondaryActionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  secondaryActionText: {
    color: '#dfe7ff',
    fontSize: 12,
    fontWeight: '700'
  },
  miniDetailsHeaderCopy: {
    flex: 1,
    paddingRight: 12
  },
  noteAuthor: { color: '#ff4757', fontWeight: "bold", marginBottom: 0 },
  liveBadge: {
    color: '#ff4757',
    fontSize: 13,
    fontWeight: 'bold'
  },
  miniNoteDesc: {
    color: '#dfe4ea',
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20
  },
  miniDetailsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  miniDetailsActions: {
    gap: 14
  },
  playSection: { marginBottom: 0 },
  playBtn: {
    backgroundColor: '#ff5b6d',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#ff5b6d',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 7
  },
  livePlayBtn: {
    backgroundColor: '#ff4757'
  },
  playText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },  progressSection: {
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
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#ff4757',
    borderRadius: 999
  },

  voteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2f3542',
    paddingTop: 15
  },
  voteSummary: {
    minWidth: 78,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  voteSummaryLabel: {
    color: '#a4b0be',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  voteSummaryCount: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginTop: 4
  },
  voteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  arrowBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#2f3542'
  },
  arrowBtnLikeActive: {
    backgroundColor: 'rgba(46,213,115,0.16)'
  },
  arrowBtnDislikeActive: {
    backgroundColor: 'rgba(255,71,87,0.16)'
  },
  arrowText: {
    color: '#9aa4bf',
    fontSize: 24,
    lineHeight: 28
  },
  arrowTextLikeActive: {
    color: '#2ed573'
  },
  arrowTextDislikeActive: {
    color: '#ff4757'
  },
  reportBtn: {
    padding: 10
  },
  reportText: {
    color: '#a4b0be',
    fontSize: 12
  },
  deleteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 6
  },
  deleteText: {
    color: '#ff6b81',
    fontSize: 12,
    fontWeight: '700'
  },

  headerInfo: {
    flex: 1
  },
  headerBadge: {
    color: "#aab4cf",
    fontSize: 12,
    marginTop: 2
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(31, 32, 41, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  menuLine: {
    width: 18,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#ffffff"
  },
  menuPanel: {
    position: "absolute",
    top: 56,
    right: 0,
    width: 220,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(20, 22, 31, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 8
  },
  menuPanelTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 8
  },
  menuPanelText: {
    color: "#b2bdd9",
    fontSize: 13,
    lineHeight: 18
  },
  menuAction: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)"
  },
  menuActionText: {
    color: "#f7fbff",
    fontSize: 13,
    fontWeight: "700"
  },
  panelNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10
  },
  panelNavBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#2f3542"
  },
  panelNavText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  },
  panelNavCount: {
    color: "#8fa1c7",
    fontSize: 12,
    fontWeight: "700"
  },
  panelMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16
  },
  panelMetaPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#2a3141"
  },
  panelMetaText: {
    color: "#dfe7ff",
    fontSize: 12,
    fontWeight: "600"
  }
});




