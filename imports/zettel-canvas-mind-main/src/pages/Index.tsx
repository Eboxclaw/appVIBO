import { useState, useEffect } from "react";
import { DashboardView } from "@/components/DashboardView";
import { NotebookView } from "@/components/NotebookView";
import { KanbanView } from "@/components/KanbanView";
import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { SettingsView } from "@/components/SettingsView";
import { AgentsView } from "@/components/AgentsView";
import { ChatAssistant } from "@/components/ChatAssistant";
import { BottomNav } from "@/components/BottomNav";
import { NewNoteDialog } from "@/components/NewNoteDialog";
import { LockScreen } from "@/components/LockScreen";
import { OnboardingWizard, isOnboardingDone } from "@/components/OnboardingWizard";
import type { OnboardingConfig } from "@/components/OnboardingWizard";
import { StoreProvider, useStore } from "@/lib/store";
import { getEncryptedNotes, decryptData, isPinSetup } from "@/lib/crypto";
import { Plus, MessageCircle, X, SquarePlus } from "lucide-react";
import logo from "@/assets/logo.svg";
import type { Note } from "@/lib/types";

interface ChatSession {
  id: string;
  label: string;
}

function WorkspaceContent() {
  const { activeView } = useStore();
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([{ id: crypto.randomUUID(), label: "1" }]);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0].id);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const addSession = () => {
    if (sessions.length >= 5) return;
    const newSession: ChatSession = { id: crypto.randomUUID(), label: String(sessions.length + 1) };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  };

  const closeSession = (id: string) => {
    if (sessions.length <= 1) return;
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[next.length - 1].id);
      }
      return next;
    });
  };

  // Chat panel height
  const chatHeight = chatOpen ? 320 : 40;

  return (
    <div className="h-[100dvh] flex flex-col w-full bg-background">
      {/* Top bar */}
      <header className="h-11 flex items-center border-b border-border px-3 gap-2 bg-card/60 backdrop-blur-xl shrink-0 shadow-ambient safe-area-top">
        <img src={logo} alt="ViBo AI" className="h-6 w-6" />
        <span className="text-sm font-bold text-foreground tracking-tight">ViBo AI</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Local · Private
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {activeView === "dashboard" && <DashboardView />}
        {activeView === "notebook" && <NotebookView />}
        {activeView === "kanban" && <KanbanView />}
        {activeView === "graph" && <KnowledgeGraph />}
        {activeView === "settings" && <SettingsView />}
        {activeView === "agents" && <AgentsView />}

        {/* Floating new note button — always above chat + bottom nav */}
        <button
          onClick={() => setNewNoteOpen(true)}
          className="fixed right-4 z-40 h-12 w-12 rounded-full bg-foreground text-background shadow-floating hover:opacity-90 transition-all hover:scale-105 flex items-center justify-center"
          style={{ bottom: `${chatHeight + 56 + 8}px` }}
        >
          <Plus className="h-5 w-5" />
        </button>
      </main>

      {/* Persistent Chat Assistant */}
      <div
        className={`shrink-0 border-t border-border bg-card/60 backdrop-blur-xl transition-all duration-300 overflow-hidden`}
        style={{ height: `${chatHeight}px` }}
      >
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="w-full h-10 flex items-center gap-2 px-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Ask assistant...</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="h-5 min-w-[20px] px-1 rounded bg-muted text-[10px] font-bold text-muted-foreground flex items-center justify-center">
                {sessions.length}
              </div>
            </div>
          </button>
        ) : (
          <div className="h-full flex flex-col">
            {/* Chat header with session controls */}
            <div className="flex items-center justify-between px-3 h-9 shrink-0 border-b border-border">
              <div className="flex items-center gap-1.5">
                {/* Session tabs with close */}
                {sessions.map((s, i) => (
                  <div key={s.id} className="flex items-center">
                    <button
                      onClick={() => setActiveSessionId(s.id)}
                      className={`h-5 min-w-[20px] px-1.5 rounded-l text-[9px] font-bold transition-colors ${
                        activeSessionId === s.id
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {i + 1}
                    </button>
                    {sessions.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                        className={`h-5 px-0.5 rounded-r text-[8px] transition-colors ${
                          activeSessionId === s.id
                            ? "bg-foreground/80 text-background hover:bg-foreground/60"
                            : "bg-muted text-muted-foreground/60 hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
                {/* New session button */}
                {sessions.length < 5 && (
                  <button
                    onClick={addSession}
                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <SquarePlus className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Page count badge */}
                <div className="h-5 min-w-[20px] px-1 rounded bg-muted/60 text-[9px] font-mono text-muted-foreground flex items-center justify-center ml-1">
                  {sessions.length}/5
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatAssistant compact sessionId={activeSessionId} />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
      <NewNoteDialog open={newNoteOpen} onOpenChange={setNewNoteOpen} />
    </div>
  );
}

const Index = () => {
  const [phase, setPhase] = useState<"onboarding" | "lock" | "app">("onboarding");
  const [pin, setPin] = useState("");
  const [initialNotes, setInitialNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (isOnboardingDone()) {
      setPhase("lock");
    }
  }, []);

  const handleOnboardingComplete = (_config: OnboardingConfig) => {
    setPhase("lock");
  };

  const handleUnlock = async (enteredPin: string) => {
    setPin(enteredPin);
    const encrypted = getEncryptedNotes();
    if (encrypted) {
      try {
        const decrypted = await decryptData(encrypted, enteredPin);
        setInitialNotes(JSON.parse(decrypted));
      } catch {
        setInitialNotes([]);
      }
    } else {
      try {
        const raw = localStorage.getItem("zettel-notes");
        const notes = raw ? JSON.parse(raw) : [];
        setInitialNotes(notes);
        localStorage.removeItem("zettel-notes");
      } catch {
        setInitialNotes([]);
      }
    }
    setPhase("app");
  };

  if (phase === "onboarding") {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  if (phase === "lock") {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <StoreProvider pin={pin} initialNotes={initialNotes}>
      <WorkspaceContent />
    </StoreProvider>
  );
};

export default Index;
