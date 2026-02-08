import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Audio } from "expo-av";
import * as Location from "expo-location";

const DEFAULT_API =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:4000";
const POLL_MS = 8000;

function score(note) {
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
    audioUrl: typeof note.audioUrl === "string" ? note.audioUrl : null
  };
}

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [apiInput, setApiInput] = useState(DEFAULT_API);
  const [mode, setMode] = useState("archive");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("Mobile User");
  const [coords, setCoords] = useState({ lat: 48.8566, lng: 2.3522 });

  const [recording, setRecording] = useState(null);
  const [recordingOn, setRecordingOn] = useState(false);
  const [recordedUri, setRecordedUri] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [playingId, setPlayingId] = useState("");
  const [votedMap, setVotedMap] = useState({});
  const [reportedMap, setReportedMap] = useState({});

  const [liveActive, setLiveActive] = useState(false);
  const [liveStreamId, setLiveStreamId] = useState("");
  const [liveBusy, setLiveBusy] = useState(false);

  const soundRef = useRef(null);
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

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      liveRef.current.active = false;
      if (liveRef.current.chunkRecording) {
        void liveRef.current.chunkRecording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const headerLabel = useMemo(
    () => (mode === "live" ? "Flux live" : "Archive"),
    [mode]
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

  const applyApiBase = useCallback(() => {
    const clean = apiInput.trim();
    if (!clean) return;
    setApiBase(clean.replace(/\/$/, ""));
    setApiOnline(false);
    setError("");
  }, [apiInput]);

  const ensureAudioPermissions = useCallback(async () => {
    const audioPerm = await Audio.requestPermissionsAsync();
    if (!audioPerm.granted) {
      throw new Error("Permission micro refusee");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false
    });
  }, []);

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
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setError("");
    } catch (locError) {
      setError(locError.message || "Localisation indisponible");
    }
  }, [ensureLocationPermissions]);

  const startRecord = useCallback(async () => {
    if (recordingOn) return;
    try {
      await ensureAudioPermissions();
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setRecordedUri("");
      setRecordingOn(true);
      setError("");
    } catch (recError) {
      setError(recError.message || "Impossible de demarrer l enregistrement");
      setRecordingOn(false);
      setRecording(null);
    }
  }, [ensureAudioPermissions, recordingOn]);

  const stopRecord = useCallback(async () => {
    if (!recording) return;
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
  }, [recording]);

  const clearRecorded = useCallback(() => {
    setRecordedUri("");
  }, []);

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
        lat: coords.lat,
        lng: coords.lng,
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
    } catch (requestError) {
      setApiOnline(Boolean(requestError?.status));
      setError(requestError.message || "Publication impossible");
    } finally {
      setPublishing(false);
    }
  }, [
    title,
    author,
    description,
    recordedUri,
    coords,
    apiRequest,
    buildFormData,
    upsertLocal
  ]);

  const submitVote = useCallback(
    async (note, type) => {
      if (votedMap[note.id]) return;

      setVotedMap((prev) => ({ ...prev, [note.id]: type }));
      upsertLocal({
        ...note,
        likes: type === "like" ? (note.likes || 0) + 1 : note.likes || 0,
        downvotes: type === "dislike" ? (note.downvotes || 0) + 1 : note.downvotes || 0
      });

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

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingId("");
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
        const { sound } = await Audio.Sound.createAsync(
          { uri: note.audioUrl },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        setPlayingId(note.id);

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            setPlayingId("");
            if (soundRef.current) {
              void soundRef.current.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          }
        });

        void apiRequest(`/api/notes/${note.id}/play`, { method: "POST" })
          .then((updated) => upsertLocal(updated))
          .catch(() => {});
      } catch (playError) {
        setError(playError.message || "Lecture impossible");
      }
    },
    [apiRequest, playingId, stopPlayback, upsertLocal]
  );

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

        if (!liveRef.current.active || liveRef.current.streamId !== streamId) {
          break;
        }

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
          // silent heartbeat issue
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
        lat: coords.lat,
        lng: coords.lng,
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
    apiRequest,
    author,
    buildFormData,
    coords,
    description,
    ensureAudioPermissions,
    recordedUri,
    runLiveLoop,
    title,
    upsertLocal
  ]);

  const stopLive = useCallback(async () => {
    const streamId = liveRef.current.streamId;
    if (!streamId) return;

    setLiveBusy(true);
    liveRef.current.active = false;

    if (liveRef.current.chunkRecording) {
      try {
        await liveRef.current.chunkRecording.stopAndUnloadAsync();
      } catch (_e) {
        // ignore
      }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Vocal Walls Mobile</Text>
          <Text style={styles.subtitle}>{headerLabel}</Text>
          <Text style={[styles.backend, apiOnline ? styles.online : styles.offline]}>
            API: {apiOnline ? "connectee" : "offline"}
          </Text>
          <View style={styles.apiRow}>
            <TextInput style={styles.apiInput} value={apiInput} onChangeText={setApiInput} />
            <Pressable style={styles.apiBtn} onPress={applyApiBase}>
              <Text style={styles.apiBtnText}>Appliquer</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, mode === "archive" && styles.modeBtnActive]} onPress={() => setMode("archive")}>
            <Text style={styles.modeText}>Archive</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === "live" && styles.modeBtnActive]} onPress={() => setMode("live")}>
            <Text style={styles.modeText}>Live</Text>
          </Pressable>
        </View>

        <View style={styles.cardCompose}>
          <Text style={styles.cardTitle}>Publier un son geolocalise</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Titre" placeholderTextColor="#81838f" />
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#81838f" />
          <TextInput style={styles.input} value={author} onChangeText={setAuthor} placeholder="Auteur" placeholderTextColor="#81838f" />
          <Text style={styles.meta}>Position: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => void updateLocation()}>
            <Text style={styles.secondaryBtnText}>Mettre a jour ma position</Text>
          </Pressable>

          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryBtn} onPress={() => (recordingOn ? void stopRecord() : void startRecord())}>
              <Text style={styles.secondaryBtnText}>{recordingOn ? "Stop rec" : "Record"}</Text>
            </Pressable>
            <Pressable style={[styles.secondaryBtn, !recordedUri && styles.disabled]} disabled={!recordedUri} onPress={clearRecorded}>
              <Text style={styles.secondaryBtnText}>Clear audio</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>{recordedUri ? "Audio pret" : "Aucun audio"}</Text>

          <Pressable style={[styles.primaryBtn, publishing && styles.disabled]} disabled={publishing} onPress={() => void publishNote()}>
            <Text style={styles.primaryBtnText}>{publishing ? "Publication..." : "Publier la capsule"}</Text>
          </Pressable>

          <View style={styles.actionsRow}>
            <Pressable style={[styles.liveBtn, (liveActive || liveBusy) && styles.disabled]} disabled={liveActive || liveBusy} onPress={() => void startLive()}>
              <Text style={styles.primaryBtnText}>Demarrer live</Text>
            </Pressable>
            <Pressable style={[styles.stopBtn, (!liveActive || liveBusy) && styles.disabled]} disabled={!liveActive || liveBusy} onPress={() => void stopLive()}>
              <Text style={styles.primaryBtnText}>Stop live</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>{liveActive ? `Live actif: ${liveStreamId}` : "Aucun live actif"}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff4757" />}
          renderItem={({ item }) => (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>{item.title}</Text>
              <Text style={styles.noteMeta}>{item.description || "Sans description"}</Text>
              <Text style={styles.noteMeta}>Par {item.author} · {item.category}</Text>
              <Text style={styles.noteMeta}>Score {score(item)} · Likes {item.likes} · Down {item.downvotes} · Reports {item.reports}</Text>
              {item.isLive ? <Text style={styles.liveTag}>LIVE {item.streamActive ? "ACTIVE" : "ENDED"} · Auditeurs {item.listeners}</Text> : null}

              <View style={styles.actionsRow}>
                <Pressable style={[styles.secondaryBtn, !item.audioUrl && styles.disabled]} disabled={!item.audioUrl} onPress={() => void playNote(item)}>
                  <Text style={styles.secondaryBtnText}>{playingId === item.id ? "Stop" : "Ecouter"}</Text>
                </Pressable>
                <Pressable style={[styles.secondaryBtn, votedMap[item.id] && styles.disabled]} disabled={Boolean(votedMap[item.id])} onPress={() => void submitVote(item, "like")}>
                  <Text style={styles.secondaryBtnText}>Like</Text>
                </Pressable>
                <Pressable style={[styles.secondaryBtn, votedMap[item.id] && styles.disabled]} disabled={Boolean(votedMap[item.id])} onPress={() => void submitVote(item, "dislike")}>
                  <Text style={styles.secondaryBtnText}>Downvote</Text>
                </Pressable>
                <Pressable style={[styles.secondaryBtn, reportedMap[item.id] && styles.disabled]} disabled={Boolean(reportedMap[item.id])} onPress={() => void submitReport(item)}>
                  <Text style={styles.secondaryBtnText}>Report</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1017"
  },
  scroll: {
    padding: 14,
    paddingBottom: 36
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f1017",
    justifyContent: "center",
    alignItems: "center",
    gap: 10
  },
  loadingText: {
    color: "#fff"
  },
  header: {
    marginBottom: 10
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: "#b5b8c7"
  },
  backend: {
    fontSize: 12,
    marginTop: 4
  },
  online: {
    color: "#2ed573"
  },
  offline: {
    color: "#ff6b81"
  },
  apiRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6
  },
  apiInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#34384c",
    borderRadius: 10,
    backgroundColor: "#0d0f18",
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12
  },
  apiBtn: {
    borderRadius: 10,
    backgroundColor: "#2b3043",
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  apiBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#35394b",
    backgroundColor: "#1c1e2a",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  modeBtnActive: {
    borderColor: "#ff4757",
    backgroundColor: "#2b1c26"
  },
  modeText: {
    color: "#fff",
    fontWeight: "700"
  },
  cardCompose: {
    backgroundColor: "#161824",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d3040",
    padding: 12,
    marginBottom: 10
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 8
  },
  input: {
    backgroundColor: "#0d0f18",
    borderWidth: 1,
    borderColor: "#2c3040",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#fff",
    marginBottom: 8
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap"
  },
  meta: {
    color: "#9ca1b5",
    fontSize: 12,
    marginTop: 6
  },
  primaryBtn: {
    backgroundColor: "#ff4757",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
    alignItems: "center"
  },
  liveBtn: {
    flex: 1,
    backgroundColor: "#ff4757",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  stopBtn: {
    flex: 1,
    backgroundColor: "#ffa502",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  secondaryBtn: {
    backgroundColor: "#222638",
    borderWidth: 1,
    borderColor: "#3a3f55",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center"
  },
  secondaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  },
  disabled: {
    opacity: 0.5
  },
  error: {
    color: "#ff808b",
    marginBottom: 8
  },
  noteCard: {
    backgroundColor: "#161824",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d3040",
    padding: 12,
    marginBottom: 10
  },
  noteTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 4
  },
  noteMeta: {
    color: "#b5b8c7",
    fontSize: 12,
    marginBottom: 2
  },
  liveTag: {
    color: "#ff6b81",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4
  }
});
