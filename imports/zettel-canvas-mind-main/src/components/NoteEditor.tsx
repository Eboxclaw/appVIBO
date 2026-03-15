import { useState, useRef } from "react";
import { useStore } from "@/lib/store";
import { extractWikiLinks, getBacklinks } from "@/lib/wiki-links";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Eye, Edit2, X, Plus, Lock, Unlock, FolderOpen } from "lucide-react";
import type { Note } from "@/lib/types";

export function NoteEditor({ noteId, onClose }: { noteId: string; onClose?: () => void }) {
  const { notes, folders, updateNote, deleteNote, selectNote, toggleNoteEncryption, moveNoteToFolder } = useStore();
  const note = notes.find((n) => n.id === noteId);
  const [preview, setPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showLinkSuggest, setShowLinkSuggest] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");

  if (!note) return null;

  const backlinks = getBacklinks(note.title, notes);
  const wikiLinks = extractWikiLinks(note.content);

  const handleContentChange = (value: string) => {
    updateNote(noteId, { content: value });
    const textarea = textareaRef.current;
    if (textarea) {
      const pos = textarea.selectionStart;
      const textBefore = value.substring(0, pos);
      const match = textBefore.match(/\[\[([^\]]*)$/);
      if (match) {
        setShowLinkSuggest(true);
        setLinkQuery(match[1].toLowerCase());
      } else {
        setShowLinkSuggest(false);
      }
    }
  };

  const insertLink = (title: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const content = note.content;
    const before = content.substring(0, pos);
    const after = content.substring(pos);
    const bracketStart = before.lastIndexOf("[[");
    const newContent = before.substring(0, bracketStart) + `[[${title}]]` + after;
    updateNote(noteId, { content: newContent });
    setShowLinkSuggest(false);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !note.tags.includes(tag)) {
      updateNote(noteId, { tags: [...note.tags, tag] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    updateNote(noteId, { tags: note.tags.filter((t) => t !== tag) });
  };

  const handleWikiLinkClick = (linkTitle: string) => {
    const target = notes.find(
      (n) => n.title.toLowerCase() === linkTitle.toLowerCase()
    );
    if (target) selectNote(target.id);
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.id !== noteId &&
      n.title.toLowerCase().includes(linkQuery)
  );

  const renderContent = (content: string) => {
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[\[([^\]]+)\]\]$/);
      if (match) {
        return (
          <button
            key={i}
            onClick={() => handleWikiLinkClick(match[1])}
            className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
          >
            {match[1]}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 p-3 border-b border-border">
        <Input
          value={note.title}
          onChange={(e) => updateNote(noteId, { title: e.target.value })}
          className="text-lg font-bold border-none shadow-none focus-visible:ring-0 px-0 bg-transparent flex-1"
          placeholder="Note title..."
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => toggleNoteEncryption(noteId)}
          title={note.isEncrypted ? "Decrypt note" : "Encrypt note"}
        >
          {note.isEncrypted ? <Lock className="h-3.5 w-3.5 text-primary" /> : <Unlock className="h-3.5 w-3.5" />}
        </Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowFolderMenu(!showFolderMenu)}
            title="Move to folder"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
          {showFolderMenu && (
            <div className="absolute right-0 top-9 z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                onClick={() => { moveNoteToFolder(noteId, ""); setShowFolderMenu(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent ${!note.folder ? "text-primary font-medium" : "text-foreground"}`}
              >
                No folder
              </button>
              {folders.map((f) => (
                <button
                  key={f}
                  onClick={() => { moveNoteToFolder(noteId, f); setShowFolderMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent ${note.folder === f ? "text-primary font-medium" : "text-foreground"}`}
                >
                  📁 {f}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPreview(!preview)}
          title={preview ? "Edit" : "Preview"}
        >
          {preview ? <Edit2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => {
            deleteNote(noteId);
            onClose?.();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border flex-wrap">
        {note.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="cursor-pointer gap-1 text-[10px]" onClick={() => removeTag(tag)}>
            #{tag}
            <X className="h-2.5 w-2.5" />
          </Badge>
        ))}
        <div className="flex items-center gap-1">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="add tag..."
            className="h-6 w-24 text-xs border-none shadow-none focus-visible:ring-0 px-1 bg-transparent"
          />
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={addTag}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-auto p-4">
        {preview ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">
            {renderContent(note.content)}
          </div>
        ) : (
          <div className="relative h-full">
            <Textarea
              ref={textareaRef}
              value={note.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing... Use [[Note Title]] to link to other notes."
              className="h-full min-h-[300px] resize-none border-none shadow-none focus-visible:ring-0 bg-transparent font-mono text-sm"
            />
            {showLinkSuggest && filteredNotes.length > 0 && (
              <div className="absolute left-4 top-12 z-50 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
                {filteredNotes.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => insertLink(n.title)}
                    className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent text-foreground"
                  >
                    {n.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <div className="border-t border-border p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Backlinks ({backlinks.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {backlinks.map((bl) => (
              <Badge
                key={bl.id}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => selectNote(bl.id)}
              >
                {bl.title}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing links */}
      {wikiLinks.length > 0 && (
        <div className="border-t border-border p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Links ({wikiLinks.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {wikiLinks.map((link) => (
              <Badge
                key={link}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => handleWikiLinkClick(link)}
              >
                {link}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
