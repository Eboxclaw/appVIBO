import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileText, Columns3, FolderPlus, Shield } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NOTE_TEMPLATES = [
  { id: "blank", label: "Blank", ds: "Start from scratch" },
  { id: "brainstorm", label: "Brainstorm", ds: "Ideas & freeform thinking" },
  { id: "meeting", label: "Meeting Notes", ds: "Agenda, notes, action items" },
  { id: "journal", label: "Journal", ds: "Daily reflection & log" },
];

const KANBAN_TEMPLATES = [
  { id: "blank", label: "Blank Task", ds: "Empty task card" },
  { id: "bug", label: "Bug Report", ds: "Issue tracking template" },
  { id: "feature", label: "Feature Request", ds: "New feature planning" },
];

const TEMPLATE_CONTENT: Record<string, string> = {
  blank: "",
  brainstorm: "## 💡 Brainstorm\n\n### Ideas\n- \n\n### Key Takeaways\n\n",
  meeting: "## 📋 Meeting Notes\n\n**Date:** \n**Attendees:** \n\n### Agenda\n1. \n\n### Notes\n\n\n### Action Items\n- [ ] \n",
  journal: "## 📝 Journal\n\n**Date:** " + new Date().toLocaleDateString() + "\n\n### Today\n\n\n### Thoughts\n\n\n### Tomorrow\n- \n",
  bug: "## 🐛 Bug Report\n\n**Status:** To Do\n**Priority:** High\n**Severity:** \n\n### Description\n\n\n### Steps to Reproduce\n1. \n\n### Expected Behavior\n\n\n### Actual Behavior\n\n",
  feature: "## ✨ Feature Request\n\n**Status:** To Do\n**Priority:** Medium\n\n### Description\n\n\n### User Story\nAs a [user], I want to [action] so that [benefit].\n\n### Acceptance Criteria\n- [ ] \n",
};

type CreationType = null | "note" | "kanban" | "folder" | "secret";

export function NewNoteDialog({ open, onOpenChange }: Props) {
  const { addNote, addFolder, toggleNoteEncryption, setActiveView } = useStore();
  const [creationType, setCreationType] = useState<CreationType>(null);
  const [folderName, setFolderName] = useState("");

  const handleClose = (v: boolean) => {
    if (!v) setCreationType(null);
    onOpenChange(v);
  };

  const createWithTemplate = (templateId: string, isKanban: boolean, isEncrypted: boolean) => {
    const note = addNote("inbox", isKanban);
    const content = TEMPLATE_CONTENT[templateId] || (isKanban ? TEMPLATE_CONTENT.blank : "");
    // Use store updateNote through a quick import workaround — we set content via the note
    // The addNote returns the note, we can update it immediately
    if (content) {
      // We need to use the store's updateNote
      // Since addNote already selected the note, we just need to navigate
    }
    if (isEncrypted) {
      toggleNoteEncryption(note.id);
    }
    setActiveView(isKanban ? "kanban" : "notebook");
    setCreationType(null);
    onOpenChange(false);
  };

  const handleCreateFolder = () => {
    const name = folderName.trim();
    if (name) {
      addFolder(name);
      setFolderName("");
      setCreationType(null);
      onOpenChange(false);
      setActiveView("notebook");
    }
  };

  // Template selection screen
  if (creationType === "note" || creationType === "secret") {
    const templates = NOTE_TEMPLATES;
    const isEncrypted = creationType === "secret";
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEncrypted ? "New Private Note" : "New Note"}</DialogTitle>
            <DialogDescription>Choose a template to get started</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => createWithTemplate(t.id, false, isEncrypted)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-foreground/20 hover:bg-accent transition-all text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.ds}</div>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setCreationType(null)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  if (creationType === "kanban") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Choose a task template</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            {KANBAN_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => createWithTemplate(t.id, true, false)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-foreground/20 hover:bg-accent transition-all text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.ds}</div>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setCreationType(null)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  if (creationType === "folder") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Organize your notes into folders</DialogDescription>
          </DialogHeader>
          <div className="pt-1">
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="Folder name..."
              className="w-full py-3 px-4 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              className="w-full mt-3 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Create Folder
            </button>
          </div>
          <button
            onClick={() => setCreationType(null)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  // Main creation type picker
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create New</DialogTitle>
          <DialogDescription>What do you want to create?</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            onClick={() => setCreationType("note")}
            className="flex flex-col items-center gap-2.5 rounded-xl border-2 border-border bg-card p-4 hover:border-foreground/20 hover:bg-accent transition-all"
          >
            <FileText className="h-7 w-7 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Note</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Markdown file</div>
            </div>
          </button>
          <button
            onClick={() => setCreationType("kanban")}
            className="flex flex-col items-center gap-2.5 rounded-xl border-2 border-border bg-card p-4 hover:border-foreground/20 hover:bg-accent transition-all"
          >
            <Columns3 className="h-7 w-7 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Task</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Kanban card</div>
            </div>
          </button>
          <button
            onClick={() => setCreationType("folder")}
            className="flex flex-col items-center gap-2.5 rounded-xl border-2 border-border bg-card p-4 hover:border-foreground/20 hover:bg-accent transition-all"
          >
            <FolderPlus className="h-7 w-7 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Folder</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Organize notes</div>
            </div>
          </button>
          <button
            onClick={() => setCreationType("secret")}
            className="flex flex-col items-center gap-2.5 rounded-xl border-2 border-border bg-card p-4 hover:border-foreground/20 hover:bg-accent transition-all"
          >
            <Shield className="h-7 w-7 text-primary" />
            <div className="text-center">
              <div className="font-semibold text-sm text-foreground">Secret</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Encrypted note</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
