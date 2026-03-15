export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  column: string;
  position: number;
  isKanban: boolean;
  createdAt: string;
  updatedAt: string;
  folder?: string;
  isEncrypted?: boolean;
}

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
}

export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "inbox", title: "Inbox", order: 0 },
  { id: "in-progress", title: "In Progress", order: 1 },
  { id: "review", title: "Review", order: 2 },
  { id: "done", title: "Done", order: 3 },
];

export type ViewMode = "dashboard" | "notebook" | "kanban" | "graph" | "settings" | "agents";
