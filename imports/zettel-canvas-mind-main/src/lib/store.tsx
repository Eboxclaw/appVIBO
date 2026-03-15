import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Note, KanbanColumn, DEFAULT_COLUMNS, ViewMode } from "./types";
import { encryptData, decryptData, getEncryptedNotes, saveEncryptedNotes, loadAgentNotes, saveAgentNotes } from "./crypto";

const FOLDERS_KEY = "vibo-folders";

function loadFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]");
  } catch { return []; }
}
function saveFolders(folders: string[]) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

interface StoreContextType {
  notes: Note[];
  agentNotes: Note[];
  columns: KanbanColumn[];
  folders: string[];
  activeView: ViewMode;
  selectedNoteId: string | null;
  setActiveView: (v: ViewMode) => void;
  selectNote: (id: string | null) => void;
  addNote: (column?: string, isKanban?: boolean) => Note;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  moveNote: (id: string, column: string, position: number) => void;
  addAgentNote: (note: Partial<Note>) => Note;
  getAgentNotes: () => Note[];
  addFolder: (name: string) => void;
  moveNoteToFolder: (noteId: string, folder: string) => void;
  toggleNoteEncryption: (noteId: string) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

const COLUMNS_KEY = "zettel-columns";

function loadColumns(): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

interface StoreProviderProps {
  children: React.ReactNode;
  pin: string;
  initialNotes: Note[];
}

export function StoreProvider({ children, pin, initialNotes }: StoreProviderProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [agentNotes, setAgentNotes] = useState<Note[]>(() => {
    try { return JSON.parse(loadAgentNotes()); } catch { return []; }
  });
  const [columns] = useState<KanbanColumn[]>(loadColumns);
  const [folders, setFolders] = useState<string[]>(loadFolders);
  const [activeView, setActiveView] = useState<ViewMode>("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const pinRef = useRef(pin);

  useEffect(() => {
    const save = async () => {
      try {
        const encrypted = await encryptData(JSON.stringify(notes), pinRef.current);
        saveEncryptedNotes(encrypted);
      } catch (e) {
        console.error("Failed to encrypt notes:", e);
      }
    };
    save();
  }, [notes]);

  useEffect(() => {
    saveAgentNotes(JSON.stringify(agentNotes));
  }, [agentNotes]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  const addNote = useCallback((column = "inbox", isKanban = false) => {
    const now = new Date().toISOString();
    const kanbanTemplate = isKanban
      ? "## Task\n\n**Status:** To Do\n**Priority:** Medium\n\n### Description\n\n\n### Acceptance Criteria\n- [ ] \n"
      : "";
    const note: Note = {
      id: crypto.randomUUID(),
      title: "Untitled",
      content: kanbanTemplate,
      tags: [],
      column,
      position: Date.now(),
      isKanban,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((prev) => [note, ...prev]);
    setSelectedNoteId(note.id);
    return note;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      )
    );
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNoteId((prev) => (prev === id ? null : prev));
  }, []);

  const moveNote = useCallback((id: string, column: string, position: number) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, column, position, updatedAt: new Date().toISOString() } : n
      )
    );
  }, []);

  const selectNote = useCallback((id: string | null) => {
    setSelectedNoteId(id);
  }, []);

  const addAgentNote = useCallback((partial: Partial<Note>) => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: partial.title || "Agent Note",
      content: partial.content || "",
      tags: partial.tags || ["agent"],
      column: "agent",
      position: Date.now(),
      isKanban: false,
      createdAt: now,
      updatedAt: now,
    };
    setAgentNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const getAgentNotes = useCallback(() => agentNotes, [agentNotes]);

  const addFolder = useCallback((name: string) => {
    setFolders((prev) => {
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  const moveNoteToFolder = useCallback((noteId: string, folder: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, folder, updatedAt: new Date().toISOString() } : n
      )
    );
  }, []);

  const toggleNoteEncryption = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, isEncrypted: !n.isEncrypted, updatedAt: new Date().toISOString() } : n
      )
    );
  }, []);

  return (
    <StoreContext.Provider
      value={{
        notes,
        agentNotes,
        columns,
        folders,
        activeView,
        selectedNoteId,
        setActiveView,
        selectNote,
        addNote,
        updateNote,
        deleteNote,
        moveNote,
        addAgentNote,
        getAgentNotes,
        addFolder,
        moveNoteToFolder,
        toggleNoteEncryption,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be inside StoreProvider");
  return ctx;
}
