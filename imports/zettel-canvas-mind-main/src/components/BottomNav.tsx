import { useStore } from "@/lib/store";
import { Home, BookOpen, Columns3, Bot, Settings } from "lucide-react";
import type { ViewMode } from "@/lib/types";

const tabs: { id: ViewMode; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "notebook", label: "Notes", icon: BookOpen },
  { id: "kanban", label: "Tasks", icon: Columns3 },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const { activeView, setActiveView } = useStore();

  return (
    <nav className="shrink-0 border-t border-border bg-card/80 backdrop-blur-lg safe-area-bottom">
      <div className="flex items-stretch justify-around h-14">
        {tabs.map((tab) => {
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
