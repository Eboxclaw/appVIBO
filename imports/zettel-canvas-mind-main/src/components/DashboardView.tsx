import { useStore } from "@/lib/store";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { FileText, Columns3, Bot, Lock, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useState, useEffect } from "react";
import { EncText, getAiConfig } from "./OnboardingWizard";

const AGENTS_KEY = "vibo-agents";

function getAgentCount(): number {
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    if (raw) return JSON.parse(raw).length;
  } catch {}
  return 1;
}

export function DashboardView() {
  const { notes, selectNote, setActiveView } = useStore();
  const [recentTab, setRecentTab] = useState<"notes" | "tasks">("notes");
  const [config] = useState(() => getAiConfig());
  const [titleKey, setTitleKey] = useState(0);
  const [agentCount] = useState(getAgentCount);

  useEffect(() => {
    setTitleKey((k) => k + 1);
  }, [config.userName]);

  const recentNotes = useMemo(
    () => [...notes].filter((n) => !n.isKanban).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [notes]
  );

  const recentTasks = useMemo(
    () => [...notes].filter((n) => n.isKanban).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [notes]
  );

  const kanbanCount = notes.filter((n) => n.isKanban).length;
  const doneCount = notes.filter((n) => n.isKanban && n.column === "done").length;
  const recentItems = recentTab === "notes" ? recentNotes : recentTasks;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4 pb-20">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-light text-foreground tracking-tight">
            <EncText key={titleKey} text={`${greeting}, ${config.userName || "User"}`} speed={22} />
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {notes.length} notes · {kanbanCount} tasks · All systems local
          </p>
        </div>

        {/* Task Progress */}
        <div className="flex gap-3">
          <div className="flex-1 card-3d rounded-2xl p-3 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-foreground shrink-0" strokeWidth={1.2} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground mb-0.5">Today's Tasks</div>
              <div className="text-[9px] font-mono text-muted-foreground tracking-wider">
                <EncText text={doneCount === kanbanCount && kanbanCount > 0 ? "ALL DONE" : `${kanbanCount - doneCount} PENDING`} speed={16} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-light text-foreground leading-none">
                {doneCount}<span className="text-xs text-muted-foreground">/{kanbanCount}</span>
              </div>
              <div className="text-[8px] font-mono text-muted-foreground tracking-widest">COMPLETE</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveView("notebook")}
            className="flex flex-col items-center gap-1 rounded-2xl card-3d p-3 hover:bg-accent transition-colors"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold text-foreground">{notes.filter(n => !n.isKanban).length}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-mono">Notes</span>
          </button>
          <button
            onClick={() => setActiveView("kanban")}
            className="flex flex-col items-center gap-1 rounded-2xl card-3d p-3 hover:bg-accent transition-colors"
          >
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold text-foreground">{kanbanCount}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-mono">Tasks</span>
          </button>
          <button
            onClick={() => setActiveView("agents")}
            className="flex flex-col items-center gap-1 rounded-2xl card-3d p-3 hover:bg-accent transition-colors"
          >
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg font-bold text-foreground">{agentCount}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-mono">Agents</span>
          </button>
        </div>

        {/* Knowledge Graph */}
        <div className="rounded-2xl card-3d-elevated overflow-hidden" style={{ height: "240px" }}>
          <KnowledgeGraph />
        </div>

        {/* Recent Notes / Tasks */}
        <div>
          <div className="flex items-center gap-1 mb-2 px-1">
            <button
              onClick={() => setRecentTab("notes")}
              className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-colors font-mono ${
                recentTab === "notes" ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Recent Notes
            </button>
            <button
              onClick={() => setRecentTab("tasks")}
              className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-colors font-mono ${
                recentTab === "tasks" ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Recent Tasks
            </button>
          </div>
          {recentItems.length > 0 ? (
            <div className="space-y-1.5">
              {recentItems.map((note) => (
                <button
                  key={note.id}
                  onClick={() => {
                    selectNote(note.id);
                    setActiveView(recentTab === "notes" ? "notebook" : "kanban");
                  }}
                  className="w-full flex items-center gap-3 rounded-xl card-3d px-3 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  {recentTab === "notes" ? (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Columns3 className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{note.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">
                      {recentTab === "tasks" ? note.column : (note.content.slice(0, 50) || "Empty")}
                    </div>
                  </div>
                  <Lock className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl card-3d px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground font-mono">
                No recent {recentTab === "notes" ? "notes" : "tasks"} yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
