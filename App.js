import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:4000";

function scoreForNote(note) {
  return (note.likes || 0) - (note.downvotes || 0) - (note.reports || 0) * 2;
}

async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: { ...(options.headers || {}) }
  };

  if (options.body !== undefined) {
    requestOptions.headers["content-type"] = "application/json";
    requestOptions.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload.data;
}

export default function App() {
  const [mode, setMode] = useState("archive");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("Utilisateur Android");
  const [votedMap, setVotedMap] = useState({});
  const [reportedMap, setReportedMap] = useState({});

  const loadNotes = useCallback(
    async (targetMode = mode, silent = false) => {
      try {
        const data = await apiRequest(`/api/notes?mode=${targetMode}`);
        setNotes(data);
        setApiOnline(true);
        setError("");
      } catch (requestError) {
        setApiOnline(false);
        if (!silent) setError("Backend indisponible. Vérifie le serveur API.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mode]
  );

  React.useEffect(() => {
    loadNotes(mode);
  }, [mode, loadNotes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadNotes(mode, true);
  }, [loadNotes, mode]);

  const upsertNoteLocal = useCallback((updatedNote) => {
    setNotes((previous) => {
      const without = previous.filter((note) => note.id !== updatedNote.id);
      return [updatedNote, ...without];
    });
  }, []);

  const submitVote = useCallback(
    async (note, voteType) => {
      if (votedMap[note.id]) return;

      setVotedMap((previous) => ({ ...previous, [note.id]: voteType }));
      const optimistic = {
        ...note,
        likes: voteType === "like" ? (note.likes || 0) + 1 : note.likes || 0,
        downvotes:
          voteType === "dislike"
            ? (note.downvotes || 0) + 1
            : note.downvotes || 0
      };
      upsertNoteLocal(optimistic);

      try {
        const updated = await apiRequest(`/api/notes/${note.id}/votes`, {
          method: "POST",
          body: { type: voteType }
        });
        upsertNoteLocal(updated);
        setApiOnline(true);
      } catch (requestError) {
        setApiOnline(false);
        setError("Vote local appliqué, backend indisponible.");
      }
    },
    [upsertNoteLocal, votedMap]
  );

  const submitReport = useCallback(
    async (note) => {
      if (reportedMap[note.id]) return;

      setReportedMap((previous) => ({ ...previous, [note.id]: true }));
      upsertNoteLocal({ ...note, reports: (note.reports || 0) + 1 });

      try {
        const updated = await apiRequest(`/api/notes/${note.id}/report`, {
          method: "POST"
        });
        upsertNoteLocal(updated);
        setApiOnline(true);
      } catch (requestError) {
        setApiOnline(false);
        setError("Signalement local appliqué, backend indisponible.");
      }
    },
    [reportedMap, upsertNoteLocal]
  );

  const createNote = useCallback(async () => {
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim() || "Utilisateur Android";
    if (!cleanTitle) {
      setError("Le titre est requis.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const payload = {
        title: cleanTitle,
        author: cleanAuthor,
        category: mode === "live" ? "🎙️ Live" : "🎧 Communauté",
        icon: mode === "live" ? "🎙️" : "🎧",
        type: mode === "live" ? "live" : "story",
        duration: mode === "live" ? 180 : 120,
        isLive: mode === "live",
        lat: 48.8566,
        lng: 2.3522,
        listeners: mode === "live" ? 1 : 0
      };
      const created = await apiRequest("/api/notes", {
        method: "POST",
        body: payload
      });
      upsertNoteLocal(created);
      setTitle("");
      setApiOnline(true);
    } catch (requestError) {
      setApiOnline(false);
      setError("Création impossible: backend indisponible.");
    } finally {
      setCreating(false);
    }
  }, [author, mode, title, upsertNoteLocal]);

  const headerLabel = useMemo(
    () => (mode === "live" ? "Flux live" : "Archives"),
    [mode]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>Chargement des notes...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Vocal Walls Mobile</Text>
        <Text style={styles.subtitle}>{headerLabel}</Text>
        <Text style={[styles.backendStatus, apiOnline ? styles.online : styles.offline]}>
          API: {apiOnline ? "connectée" : "hors ligne"} ({API_BASE_URL})
        </Text>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === "archive" && styles.modeButtonActive]}
          onPress={() => setMode("archive")}
        >
          <Text style={styles.modeText}>Archive</Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === "live" && styles.modeButtonActive]}
          onPress={() => setMode("live")}
        >
          <Text style={styles.modeText}>Live</Text>
        </Pressable>
      </View>

      <View style={styles.composeCard}>
        <Text style={styles.composeTitle}>Créer une note</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Titre de la note"
          placeholderTextColor="#81838f"
        />
        <TextInput
          style={styles.input}
          value={author}
          onChangeText={setAuthor}
          placeholder="Auteur"
          placeholderTextColor="#81838f"
        />
        <Pressable
          style={[styles.createButton, creating && styles.buttonDisabled]}
          disabled={creating}
          onPress={() => void createNote()}
        >
          <Text style={styles.createButtonText}>
            {creating ? "Création..." : "Publier"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff4757" />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>
                {item.icon || "🎧"} {item.title}
              </Text>
              <Text style={styles.cardMeta}>{item.category}</Text>
              <Text style={styles.cardMeta}>Par {item.author}</Text>
              <Text style={styles.cardMeta}>Score: {scoreForNote(item)}</Text>
              <Text style={styles.cardMeta}>
                ❤️ {item.likes || 0} · ⬇️ {item.downvotes || 0} · 🚩 {item.reports || 0}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.actionButton,
                  votedMap[item.id] === "like" && styles.actionButtonActive
                ]}
                disabled={Boolean(votedMap[item.id])}
                onPress={() => void submitVote(item, "like")}
              >
                <Text style={styles.actionText}>Like</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionButton,
                  votedMap[item.id] === "dislike" && styles.actionButtonWarn
                ]}
                disabled={Boolean(votedMap[item.id])}
                onPress={() => void submitVote(item, "dislike")}
              >
                <Text style={styles.actionText}>Downvote</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionButton,
                  reportedMap[item.id] && styles.buttonDisabled
                ]}
                disabled={Boolean(reportedMap[item.id])}
                onPress={() => void submitReport(item)}
              >
                <Text style={styles.actionText}>Report</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1017",
    paddingHorizontal: 14,
    paddingTop: 12
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f1017",
    justifyContent: "center",
    alignItems: "center",
    gap: 10
  },
  loadingText: {
    color: "#ffffff"
  },
  header: {
    marginBottom: 10
  },
  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: "#b5b8c7",
    marginTop: 2
  },
  backendStatus: {
    marginTop: 6,
    fontSize: 12
  },
  online: {
    color: "#2ed573"
  },
  offline: {
    color: "#ff6b81"
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  modeButton: {
    flex: 1,
    backgroundColor: "#1c1e2a",
    borderWidth: 1,
    borderColor: "#35394b",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  modeButtonActive: {
    borderColor: "#ff4757",
    backgroundColor: "#2b1c26"
  },
  modeText: {
    color: "#fff",
    fontWeight: "700"
  },
  composeCard: {
    backgroundColor: "#161824",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2d3040"
  },
  composeTitle: {
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
  createButton: {
    backgroundColor: "#ff4757",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  createButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  error: {
    color: "#ff808b",
    marginBottom: 8
  },
  listContent: {
    paddingBottom: 40
  },
  card: {
    backgroundColor: "#161824",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d3040",
    padding: 12,
    marginBottom: 10
  },
  cardTop: {
    marginBottom: 10
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 4
  },
  cardMeta: {
    color: "#b5b8c7",
    fontSize: 12,
    marginBottom: 2
  },
  actions: {
    flexDirection: "row",
    gap: 8
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#222638",
    borderWidth: 1,
    borderColor: "#3a3f55",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center"
  },
  actionButtonActive: {
    backgroundColor: "#402029",
    borderColor: "#ff4757"
  },
  actionButtonWarn: {
    backgroundColor: "#3d3220",
    borderColor: "#ffa502"
  },
  actionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  },
  buttonDisabled: {
    opacity: 0.5
  }
});
