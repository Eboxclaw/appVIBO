import { useState } from "react";
import { Cpu, Download, Check, Trash2, Loader2, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LOCAL_MODELS,
  getDownloadedModels,
  addDownloadedModel,
  removeDownloadedModel,
  getActiveLocalModel,
  setActiveLocalModel,
  type LocalModel,
} from "@/lib/models";

const PRE_INSTALLED = ["lfm2.5-1.2b-instruct", "lfm2.5-1.2b-thinking"];

function ensurePreInstalled() {
  const current = getDownloadedModels();
  let changed = false;
  for (const id of PRE_INSTALLED) {
    if (!current.includes(id)) {
      addDownloadedModel(id);
      changed = true;
    }
  }
  if (changed && !getActiveLocalModel()) {
    setActiveLocalModel(PRE_INSTALLED[0]);
  }
  return getDownloadedModels();
}

function ModelCard({
  model, downloaded, active, onDownload, onDelete, onActivate,
}: {
  model: LocalModel; downloaded: boolean; active: boolean;
  onDownload: () => void; onDelete: () => void; onActivate: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownload = () => {
    setDownloading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setDownloading(false);
          onDownload();
          return 100;
        }
        return p + Math.random() * 15;
      });
    }, 300);
  };

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground truncate">{model.name}</span>
            {model.recommended && (
              <span className="text-[8px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">rec</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono text-muted-foreground">{model.params}</span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{model.modality.join(" + ")}</span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{model.size_mb}MB</span>
          </div>
        </div>
        {downloaded ? (
          <div className="flex items-center gap-1">
            {!active && (
              <button onClick={onActivate} className="text-[10px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                Use
              </button>
            )}
            {active && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                <Check className="h-3 w-3" /> Active
              </span>
            )}
            {!PRE_INSTALLED.includes(model.id) && (
              <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : downloading ? (
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
        ) : (
          <button onClick={handleDownload} className="flex items-center gap-1 text-[10px] font-medium text-foreground hover:text-primary px-2 py-1 rounded-lg bg-muted hover:bg-primary/10 transition-colors">
            <Download className="h-3 w-3" /> Pull
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{model.description}</p>
      {downloading && (
        <div className="space-y-1">
          <Progress value={Math.min(progress, 100)} className="h-1.5" />
          <div className="text-[9px] text-muted-foreground text-right">{Math.min(Math.round(progress), 100)}%</div>
        </div>
      )}
    </div>
  );
}

export function LocalModelsSection() {
  const [downloaded, setDownloaded] = useState(() => ensurePreInstalled());
  const [activeModel, setActiveModel] = useState(getActiveLocalModel);
  const [open, setOpen] = useState(false);

  const installedModels = LOCAL_MODELS.filter((m) => downloaded.includes(m.id));
  const availableModels = LOCAL_MODELS.filter((m) => !downloaded.includes(m.id));

  const handleDownload = (id: string) => {
    addDownloadedModel(id);
    setDownloaded(getDownloadedModels());
    if (downloaded.length === 0) {
      setActiveLocalModel(id);
      setActiveModel(id);
    }
  };

  const handleDelete = (id: string) => {
    removeDownloadedModel(id);
    setDownloaded(getDownloadedModels());
    if (activeModel === id) {
      const remaining = getDownloadedModels();
      const next = remaining[0] || "";
      setActiveLocalModel(next);
      setActiveModel(next);
    }
  };

  const handleActivate = (id: string) => {
    setActiveLocalModel(id);
    setActiveModel(id);
  };

  return (
    <div className="card-3d rounded-2xl p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5" />
        Local Models — Liquid AI
      </h2>
      <p className="text-[10px] text-muted-foreground mb-3">
        LFM 2.5 nano agents run privately on-device via LEAP. All 5 models available for download.
      </p>

      {/* Installed Models */}
      <div className="space-y-2 mb-3">
        {installedModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            downloaded
            active={activeModel === model.id}
            onDownload={() => {}}
            onDelete={() => handleDelete(model.id)}
            onActivate={() => handleActivate(model.id)}
          />
        ))}
      </div>

      {/* Expandable Available Models */}
      {availableModels.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="w-full flex items-center justify-between py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span>{availableModels.length} more Liquid AI models available</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-1">
              {availableModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  downloaded={false}
                  active={false}
                  onDownload={() => handleDownload(model.id)}
                  onDelete={() => {}}
                  onActivate={() => {}}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
