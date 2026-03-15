import { useState } from "react";
import { Cloud, Key, Server, Eye, EyeOff, Globe, ChevronDown } from "lucide-react";
import {
  CLOUD_PROVIDERS,
  getCloudKeys,
  setCloudKey,
  getActiveProvider,
  setActiveProvider,
  getSelectedModels,
  setSelectedModel,
  type CloudProviderType,
} from "@/lib/models";

function ModelSelector({ provider, selectedModel, onSelect }: {
  provider: typeof CLOUD_PROVIDERS[number];
  selectedModel: string;
  onSelect: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const models = provider.models || [];

  if (models.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-8 rounded-lg bg-muted border border-border px-3 text-xs text-foreground flex items-center justify-between hover:border-muted-foreground/30 transition-colors"
      >
        <span className={selectedModel ? "text-foreground" : "text-muted-foreground"}>
          {selectedModel || "Select a model…"}
        </span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-9 left-0 right-0 z-50 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
          {models.map((m) => (
            <button
              key={m}
              onClick={() => { onSelect(m); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${
                selectedModel === m ? "bg-primary/10 text-primary font-medium" : "text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderField({
  provider,
  value,
  active,
  selectedModel,
  onChange,
  onActivate,
  onModelSelect,
}: {
  provider: typeof CLOUD_PROVIDERS[number];
  value: string;
  active: boolean;
  selectedModel: string;
  onChange: (v: string) => void;
  onActivate: () => void;
  onModelSelect: (model: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = provider.type === "host" ? Server : Key;

  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{provider.name}</div>
          <div className="text-[10px] text-muted-foreground">{provider.description}</div>
        </div>
        {value && !active && (
          <button
            onClick={onActivate}
            className="text-[10px] font-medium text-primary hover:text-primary/80 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            Use
          </button>
        )}
        {active && (
          <span className="text-[10px] font-medium text-primary flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            Active
          </span>
        )}
      </div>
      <div className="relative">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={provider.placeholder}
          className="w-full h-8 rounded-lg bg-muted border border-border pl-8 pr-8 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
      {/* Show model selector when key/host is entered */}
      {value && provider.models && provider.models.length > 0 && (
        <ModelSelector
          provider={provider}
          selectedModel={selectedModel}
          onSelect={onModelSelect}
        />
      )}
    </div>
  );
}

export function CloudProvidersSection({
  torEnabled,
  onTorToggle,
}: {
  torEnabled: boolean;
  onTorToggle: () => void;
}) {
  const [keys, setKeys] = useState(getCloudKeys);
  const [activeProvider, setActive] = useState(getActiveProvider);
  const [selectedModels, setModels] = useState(getSelectedModels);

  const updateKey = (provider: CloudProviderType, value: string) => {
    setCloudKey(provider, value);
    setKeys(getCloudKeys());
  };

  const activate = (provider: CloudProviderType) => {
    setActiveProvider(provider);
    setActive(provider);
  };

  const handleModelSelect = (provider: CloudProviderType, model: string) => {
    setSelectedModel(provider, model);
    setModels(getSelectedModels());
  };

  return (
    <div className="card-3d rounded-2xl p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5" />
        Cloud Providers
      </h2>
      <p className="text-[10px] text-muted-foreground mb-3">
        BYOK — connect cloud models for deep reasoning. Requests route through Tor when enabled.
      </p>

      <div className="space-y-2">
        {CLOUD_PROVIDERS.map((provider) => (
          <ProviderField
            key={provider.id}
            provider={provider}
            value={keys[provider.id] || ""}
            active={activeProvider === provider.id}
            selectedModel={selectedModels[provider.id] || ""}
            onChange={(v) => updateKey(provider.id, v)}
            onActivate={() => activate(provider.id)}
            onModelSelect={(m) => handleModelSelect(provider.id, m)}
          />
        ))}
      </div>

      {/* Tor Toggle */}
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={onTorToggle}
          className="w-full flex items-center justify-between py-1.5 text-sm text-foreground"
        >
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <div className="text-left">
              <div className="text-xs font-medium">Tor Routing</div>
              <div className="text-[9px] text-muted-foreground">Route cloud API calls through Tor network</div>
            </div>
          </span>
          <div className={`w-9 h-5 rounded-full transition-colors ${torEnabled ? "bg-primary/60" : "bg-muted"} relative`}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${torEnabled ? "bg-primary left-[18px]" : "bg-foreground left-0.5"}`} />
          </div>
        </button>
      </div>
    </div>
  );
}
