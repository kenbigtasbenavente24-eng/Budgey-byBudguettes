import { useEffect, useRef, useState } from "react";
import Camera from "./Camera";
import PhotoTag from "./Phototag";
import Gallery from "./Gallery";
import Settings from "./Settings";
import { classifyForTag } from "./api";
import { loadSettings, saveSettings } from "./settingsStore";

const STORAGE_KEY = "budgey:entries";

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Shrink photos so many of them fit in browser storage
function shrinkPhoto(dataUrl, maxSide = 900) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function App() {
  const [screen, setScreen] = useState("camera");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [classification, setClassification] = useState(null);
  const classifyId = useRef(0);
  const [editing, setEditing] = useState(null);
  const [entries, setEntries] = useState(loadEntries);
  const [settings, setSettings] = useState(loadSettings);

  // New photo: open the tag screen right away, and ask the classifier for a
  // category in the background. If the backend is off or fails, the user just
  // picks the category themselves like before.
  const handleCapture = (photo) => {
  const id = ++classifyId.current;
  setClassification({ status: "loading" });
  setPendingPhoto(photo);
  shrinkPhoto(photo)
    .then(classifyForTag)
    .then((result) => {
      if (id === classifyId.current) {
        setClassification({ status: "done", ...result });
      }
    })
    .catch((err) => {
      console.warn("Classifier unavailable:", err);
      if (id === classifyId.current) setClassification({ status: "error" });
    });
};

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn("Could not save entries:", err);
    }
  }, [entries]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const saveEntry = async (entry) => {
    const photo = await shrinkPhoto(entry.photo);
    setEntries((prev) => [
      {
        ...entry,
        photo,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setPendingPhoto(null);
    setScreen("gallery");
  };

  const updateEntry = (id, changes) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              name: changes.name,
              amount: changes.amount,
              category: changes.category,
              reason: changes.reason,
            }
          : e
      )
    );
    setEditing(null);
  };

  const deleteEntry = (id) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  // New photo: tag it
  if (pendingPhoto) {
    return (
      <PhotoTag
        photo={pendingPhoto}
        classification={classification}
        onClose={() => setPendingPhoto(null)}
        onSave={saveEntry}
      />
    );
  }

  // Existing photo: edit its details
  if (editing) {
    return (
      <PhotoTag
        photo={editing.photo}
        initial={editing}
        submitLabel="Save changes"
        onClose={() => setEditing(null)}
        onSave={(changes) => updateEntry(editing.id, changes)}
      />
    );
  }

  if (screen === "settings") {
    return (
      <Settings
        targetWeekly={settings.targetWeekly}
        onSave={(targetWeekly) => setSettings((s) => ({ ...s, targetWeekly }))}
        onBack={() => setScreen("gallery")}
      />
    );
  }

  if (screen === "gallery") {
    return (
      <Gallery
        entries={entries}
        onNavigate={setScreen}
        onDelete={deleteEntry}
        onEdit={setEditing}
        onOpenSettings={() => setScreen("settings")}
      />
    );
  }

  return (
    <Camera
      onCapture={handleCapture}
      onOpenGallery={() => setScreen("gallery")}
      latestPhoto={entries[0]?.photo}
    />
  );
}