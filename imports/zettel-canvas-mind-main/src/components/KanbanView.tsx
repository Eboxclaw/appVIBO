import { useState, useMemo, useRef } from "react";
import { useStore } from "@/lib/store";
import { NoteEditor } from "./NoteEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function KanbanView() {
  const { notes, columns, addNote, moveNote } = useStore();
  const [sheetNoteId, setSheetNoteId] = useState<string | null>(null);
  const dragRef = useRef<{ noteId: string; sourceColumn: string } | null>(null);

  const kanbanNotes = useMemo(() => notes.filter((n) => n.isKanban), [notes]);

  const notesByColumn = useMemo(() => {
    const map: Record<string, typeof notes> = {};
    columns.forEach((c) => {
      map[c.id] = kanbanNotes
        .filter((n) => n.column === c.id)
        .sort((a, b) => a.position - b.position);
    });
    return map;
  }, [kanbanNotes, columns]);

  const handleDragStart = (noteId: string, column: string) => {
    dragRef.current = { noteId, sourceColumn: column };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (columnId: string) => {
    if (dragRef.current) {
      moveNote(dragRef.current.noteId, columnId, Date.now());
      dragRef.current = null;
    }
  };

  return (
    <>
      <div className="flex h-full overflow-x-auto gap-2 p-3">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex flex-col w-56 shrink-0 rounded-xl bg-muted/30 border border-border"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-border">
              <h3 className="font-semibold text-xs text-foreground">{col.title}</h3>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {notesByColumn[col.id]?.length || 0}
              </Badge>
            </div>

            {/* Cards */}
            <ScrollArea className="flex-1 p-1.5">
              <div className="space-y-1.5">
                {notesByColumn[col.id]?.map((note) => (
                  <div
                    key={note.id}
                    draggable
                    onDragStart={() => handleDragStart(note.id, col.id)}
                    onClick={() => setSheetNoteId(note.id)}
                    className="group cursor-pointer rounded-lg border border-border bg-card px-2.5 py-2 shadow-ambient hover:shadow-elevated transition-shadow"
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate text-foreground">
                          {note.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                          {note.content.slice(0, 60) || "Empty"}
                        </div>
                        {note.tags.length > 0 && (
                          <div className="flex gap-0.5 mt-1.5 flex-wrap">
                            {note.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="text-[9px] bg-accent text-accent-foreground px-1 py-0.5 rounded"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Add card */}
            <div className="p-1.5 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground text-xs h-7"
                onClick={() => addNote(col.id, true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Note editor sheet */}
      <Sheet open={!!sheetNoteId} onOpenChange={(open) => !open && setSheetNoteId(null)}>
        <SheetContent className="w-full sm:w-[500px] sm:max-w-[500px] p-0">
          {sheetNoteId && (
            <NoteEditor noteId={sheetNoteId} onClose={() => setSheetNoteId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
