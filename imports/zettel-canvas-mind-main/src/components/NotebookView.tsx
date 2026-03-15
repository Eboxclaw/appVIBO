import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { NoteEditor } from "./NoteEditor";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, FileText, ArrowLeft, Lock, FolderOpen, FolderPlus, ChevronRight, ChevronDown, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type NoteTab = "notes" | "private";

export function NotebookView() {
  const { notes, folders, selectedNoteId, selectNote, addNote, addFolder } = useStore();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NoteTab>("notes");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([""]));
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (n.isKanban) return false;
      const isPrivate = n.isEncrypted === true;
      if (activeTab === "private" && !isPrivate) return false;
      if (activeTab === "notes" && isPrivate) return false;
      const matchSearch =
        !search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase());
      const matchTag = !tagFilter || n.tags.includes(tagFilter);
      return matchSearch && matchTag;
    });
  }, [notes, search, tagFilter, activeTab]);

  // Group notes by folder
  const groupedNotes = useMemo(() => {
    const groups: Record<string, typeof filtered> = { "": [] };
    for (const f of folders) groups[f] = [];
    for (const n of filtered) {
      const folder = n.folder || "";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(n);
    }
    return groups;
  }, [filtered, folders]);

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleAddFolder = () => {
    const name = newFolderName.trim();
    if (name) {
      addFolder(name);
      setExpandedFolders((prev) => new Set([...prev, name]));
    }
    setNewFolderName("");
    setShowNewFolder(false);
  };

  // If a note is selected, show the editor full-screen
  if (selectedNoteId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60 backdrop-blur-xl">
          <button
            onClick={() => selectNote(null)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground truncate">
            {notes.find((n) => n.id === selectedNoteId)?.title || "Note"}
          </span>
          {notes.find((n) => n.id === selectedNoteId)?.isEncrypted && (
            <Lock className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <NoteEditor noteId={selectedNoteId} />
        </div>
      </div>
    );
  }

  // Note list view
  return (
    <div className="flex flex-col h-full">
      {/* Top tabs: Notes / Private */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card/60 backdrop-blur-xl shrink-0">
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-colors ${
            activeTab === "notes"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <FileText className="h-3 w-3" />
          Notes
        </button>
        <button
          onClick={() => setActiveTab("private")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-colors ${
            activeTab === "private"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Shield className="h-3 w-3" />
          Private
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="New Folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search + Tags */}
      <div className="p-3 border-b border-border space-y-2 bg-card/60 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "private" ? "Search private notes..." : "Search notes..."}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {/* New Folder inline input */}
        {showNewFolder && (
          <div className="flex items-center gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
              placeholder="Folder name..."
              className="h-8 text-xs flex-1"
              autoFocus
            />
            <Button size="sm" variant="default" className="h-8 text-xs" onClick={handleAddFolder}>
              Create
            </Button>
          </div>
        )}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tagFilter && (
              <Badge
                variant="default"
                className="cursor-pointer"
                onClick={() => setTagFilter(null)}
              >
                #{tagFilter} ✕
              </Badge>
            )}
            {allTags
              .filter((t) => t !== tagFilter)
              .slice(0, 6)
              .map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent text-xs"
                  onClick={() => setTagFilter(tag)}
                >
                  #{tag}
                </Badge>
              ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* Root notes (no folder) */}
          {(groupedNotes[""] || []).map((note) => (
            <NoteListItem key={note.id} note={note} onSelect={selectNote} />
          ))}

          {/* Folder groups */}
          {folders.map((folder) => {
            const folderNotes = groupedNotes[folder] || [];
            const isExpanded = expandedFolders.has(folder);
            return (
              <div key={folder}>
                <button
                  onClick={() => toggleFolder(folder)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{folder}</span>
                  <span className="text-[9px] text-muted-foreground ml-auto">{folderNotes.length}</span>
                </button>
                {isExpanded && folderNotes.map((note) => (
                  <div key={note.id} className="ml-5">
                    <NoteListItem note={note} onSelect={selectNote} />
                  </div>
                ))}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{activeTab === "private" ? "No private notes" : "No notes found"}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function NoteListItem({ note, onSelect }: { note: { id: string; title: string; content: string; tags: string[]; isEncrypted?: boolean }; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(note.id)}
      className="w-full text-left px-3 py-2.5 rounded-xl card-3d hover:bg-accent transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-sm truncate text-foreground flex-1">{note.title}</span>
        {note.isEncrypted && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {note.content.slice(0, 60) || "Empty note"}
      </div>
      {note.tags.length > 0 && (
        <div className="flex gap-1 mt-1">
          {note.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
