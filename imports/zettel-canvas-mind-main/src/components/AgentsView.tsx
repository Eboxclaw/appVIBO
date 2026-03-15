import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Plus, Trash2, Upload, FileText } from "lucide-react";
import { getAiConfig } from "./OnboardingWizard";

type AgentTab = "agents" | "skills" | "roles";

interface Agent {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
}

interface RoleItem {
  id: string;
  name: string;
  description: string;
}

const AGENTS_KEY = "vibo-agents";
const SKILLS_KEY = "vibo-skills";
const ROLES_KEY = "vibo-roles";

const AGENT_MAP: Record<string, { name: string; role: string }> = {
  manager: { name: "Manager", role: "Coordinator" },
  assistant: { name: "Assistant", role: "General Help" },
  coder: { name: "Code Assistant", role: "Coder" },
  writer: { name: "Content Writer", role: "Writer" },
};

function loadAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const config = getAiConfig();
  const starter = AGENT_MAP[config.starterAgent] || AGENT_MAP.assistant;
  return [{ id: "1", name: starter.name, role: starter.role, active: true }];
}

function saveAgents(agents: Agent[]) {
  localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
}

function loadItems(key: string): (SkillItem | RoleItem)[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveItems(key: string, items: (SkillItem | RoleItem)[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

const configTabs: { id: AgentTab; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "skills", label: "Skills" },
  { id: "roles", label: "Roles" },
];

function AgentsContent({ agents, setAgents }: { agents: Agent[]; setAgents: React.Dispatch<React.SetStateAction<Agent[]>> }) {
  const activeAgents = agents.filter((a) => a.active);
  const inactiveAgents = agents.filter((a) => !a.active);

  const addAgent = () => {
    setAgents((prev) => [...prev, { id: crypto.randomUUID(), name: `Agent ${prev.length + 1}`, role: "Unassigned", active: true }]);
  };

  const deleteAgent = (id: string) => setAgents((prev) => prev.filter((a) => a.id !== id));
  const toggleAgent = (id: string) => setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));

  return (
    <div className="flex flex-col gap-4 p-4 pb-20">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Active ({activeAgents.length})
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {activeAgents.map((agent) => (
            <div key={agent.id} className="card-3d rounded-xl px-2.5 py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="h-6 w-6 rounded-md bg-foreground/10 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-foreground" />
                </div>
                <button onClick={() => deleteAgent(agent.id)} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
              <div className="text-[10px] font-semibold text-foreground truncate">{agent.name}</div>
              <div className="text-[9px] text-muted-foreground">{agent.role}</div>
              <button onClick={() => toggleAgent(agent.id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-accent rounded px-1.5 py-0.5 transition-colors self-start mt-0.5">
                Deactivate
              </button>
            </div>
          ))}
          <button onClick={addAgent} className="rounded-xl border border-dashed border-border px-2.5 py-2 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
            <Plus className="h-4 w-4" />
            <span className="text-[9px] font-medium">New Agent</span>
          </button>
        </div>
      </div>

      {inactiveAgents.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            Inactive ({inactiveAgents.length})
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {inactiveAgents.map((agent) => (
              <div key={agent.id} className="card-3d rounded-xl px-2.5 py-2 flex flex-col gap-1 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-6 rounded-md bg-foreground/5 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <button onClick={() => deleteAgent(agent.id)} className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
                <div className="text-[10px] font-semibold text-foreground truncate">{agent.name}</div>
                <div className="text-[9px] text-muted-foreground">{agent.role}</div>
                <button onClick={() => toggleAgent(agent.id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-accent rounded px-1.5 py-0.5 transition-colors self-start mt-0.5">
                  Activate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MdFileUploadCard({ label, onAdd }: { label: string; onAdd: (name: string, desc: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleAdd = () => {
    if (name.trim()) {
      onAdd(name.trim(), desc.trim() || "Custom " + label.toLowerCase());
      setName("");
      setDesc("");
      setShowForm(false);
    }
  };

  return (
    <>
      {showForm ? (
        <div className="card-3d rounded-xl p-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${label} name...`}
            className="w-full text-xs bg-muted rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none border border-border focus:ring-1 focus:ring-foreground/20"
            autoFocus
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (markdown supported)..."
            className="w-full text-xs bg-muted rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none border border-border focus:ring-1 focus:ring-foreground/20 resize-none h-16"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-1.5 rounded-lg bg-foreground text-background text-[10px] font-medium hover:opacity-90 transition-opacity"
            >
              Add {label}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border-2 border-dashed border-border p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
        >
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
            <FileText className="h-5 w-5" />
          </div>
          <div className="text-xs font-medium">Add {label}</div>
          <div className="text-[10px] text-muted-foreground">Create a markdown-based {label.toLowerCase()}</div>
        </button>
      )}
    </>
  );
}

function SkillsContent() {
  const [skills, setSkills] = useState<SkillItem[]>(() => loadItems(SKILLS_KEY) as SkillItem[]);

  useEffect(() => { saveItems(SKILLS_KEY, skills); }, [skills]);

  const addSkill = (name: string, desc: string) => {
    setSkills((prev) => [...prev, { id: crypto.randomUUID(), name, description: desc }]);
  };

  const deleteSkill = (id: string) => setSkills((prev) => prev.filter((s) => s.id !== id));

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Define what your agents can do — add skills as markdown files.</p>
      {skills.length > 0 && (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.id} className="card-3d rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{skill.name}</div>
                <div className="text-[10px] text-muted-foreground">{skill.description}</div>
              </div>
              <button onClick={() => deleteSkill(skill.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <MdFileUploadCard label="Skill" onAdd={addSkill} />
    </div>
  );
}

function RolesContent() {
  const [roles, setRoles] = useState<RoleItem[]>(() => loadItems(ROLES_KEY) as RoleItem[]);

  useEffect(() => { saveItems(ROLES_KEY, roles); }, [roles]);

  const addRole = (name: string, desc: string) => {
    setRoles((prev) => [...prev, { id: crypto.randomUUID(), name, description: desc }]);
  };

  const deleteRole = (id: string) => setRoles((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">Assign roles to control agent behavior and access levels.</p>
      {roles.length > 0 && (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="card-3d rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{role.name}</div>
                <div className="text-[10px] text-muted-foreground">{role.description}</div>
              </div>
              <button onClick={() => deleteRole(role.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <MdFileUploadCard label="Role" onAdd={addRole} />
    </div>
  );
}

export function AgentsView() {
  const [activeTab, setActiveTab] = useState<AgentTab>("agents");
  const [agents, setAgents] = useState<Agent[]>(loadAgents);

  useEffect(() => {
    saveAgents(agents);
  }, [agents]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card/60 backdrop-blur-xl overflow-x-auto shrink-0">
        {configTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "agents" && <AgentsContent agents={agents} setAgents={setAgents} />}
        {activeTab === "skills" && <SkillsContent />}
        {activeTab === "roles" && <RolesContent />}
      </ScrollArea>
    </div>
  );
}
