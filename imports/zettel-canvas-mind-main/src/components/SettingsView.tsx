import { useStore } from "@/lib/store";
import { Moon, Sun, Trash2, Download, Shield, Fingerprint } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { isPinSetup } from "@/lib/crypto";
import { LocalModelsSection } from "@/components/settings/LocalModelsSection";
import { CloudProvidersSection } from "@/components/settings/CloudProvidersSection";
import { getActiveProvider, setActiveProvider } from "@/lib/models";

const TOR_TOGGLE_KEY = "zettel-tor-enabled";
const BIOMETRICS_KEY = "vibo-biometrics-enabled";

export function SettingsView() {
  const { notes } = useStore();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [torEnabled, setTorEnabled] = useState(() => localStorage.getItem(TOR_TOGGLE_KEY) === "true");
  const [biometricsEnabled, setBiometricsEnabled] = useState(() => localStorage.getItem(BIOMETRICS_KEY) !== "false");
  const hasPin = isPinSetup();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    localStorage.setItem(TOR_TOGGLE_KEY, String(torEnabled));
  }, [torEnabled]);

  useEffect(() => {
    localStorage.setItem(BIOMETRICS_KEY, String(biometricsEnabled));
  }, [biometricsEnabled]);

  const exportNotes = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zettelkasten-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (confirm("Delete all notes? This cannot be undone.")) {
      localStorage.removeItem("zettel-notes");
      localStorage.removeItem("zettel-encrypted-notes");
      window.location.reload();
    }
  };

  const resetEncryption = () => {
    if (confirm("Reset encryption? This will delete all encrypted notes and your PIN. This cannot be undone.")) {
      localStorage.removeItem("zettel-encrypted-notes");
      localStorage.removeItem("zettel-pin-hash");
      localStorage.removeItem("zettel-crypto-salt");
      window.location.reload();
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4 pb-20 max-w-md mx-auto">
        <h1 className="text-lg font-bold text-foreground">Settings</h1>

        {/* Appearance */}
        <div className="card-3d rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Appearance</h2>
          <button
            onClick={() => setDark(!dark)}
            className="w-full flex items-center justify-between py-2 text-sm text-foreground"
          >
            <span className="flex items-center gap-2">
              {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {dark ? "Dark Mode" : "Light Mode"}
            </span>
            <div className={`w-10 h-5 rounded-full transition-colors ${dark ? "bg-foreground/30" : "bg-muted"} relative`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-transform ${dark ? "left-5" : "left-0.5"}`} />
            </div>
          </button>
        </div>

        {/* Encryption */}
        <div className="card-3d rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Encryption
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium text-foreground">AES-256-GCM</div>
                <div className="text-[10px] text-muted-foreground">Notes encrypted at rest with PIN-derived key</div>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${hasPin ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`h-2 w-2 rounded-full ${hasPin ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {hasPin ? "Active" : "Not Set"}
              </div>
            </div>

            {/* Biometrics toggle */}
            <button
              onClick={() => setBiometricsEnabled(!biometricsEnabled)}
              className="w-full flex items-center justify-between py-2 text-sm text-foreground"
            >
              <span className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-xs font-medium">Biometrics</div>
                  <div className="text-[9px] text-muted-foreground">Use Face ID / Fingerprint to unlock</div>
                </div>
              </span>
              <div className={`w-9 h-5 rounded-full transition-colors ${biometricsEnabled ? "bg-primary/60" : "bg-muted"} relative`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${biometricsEnabled ? "bg-primary left-[18px]" : "bg-foreground left-0.5"}`} />
              </div>
            </button>

            {hasPin && (
              <button
                onClick={resetEncryption}
                className="w-full flex items-center gap-2 py-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Reset Encryption & PIN
              </button>
            )}
          </div>
        </div>

        {/* Local Models */}
        <LocalModelsSection />

        {/* Cloud Providers */}
        <CloudProvidersSection
          torEnabled={torEnabled}
          onTorToggle={() => setTorEnabled(!torEnabled)}
        />

        {/* Data */}
        <div className="card-3d rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Data</h2>
          <div className="space-y-2">
            <button onClick={exportNotes} className="w-full flex items-center gap-2 py-2 text-sm text-foreground hover:text-foreground/80 transition-colors">
              <Download className="h-4 w-4" />
              Export Notes as JSON
            </button>
            <button onClick={clearAll} className="w-full flex items-center gap-2 py-2 text-sm text-destructive hover:text-destructive/80 transition-colors">
              <Trash2 className="h-4 w-4" />
              Delete All Notes
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="card-3d rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Stats</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-lg font-bold text-foreground">{notes.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Total Notes</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{notes.filter(n => n.isKanban).length}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Tasks</div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
