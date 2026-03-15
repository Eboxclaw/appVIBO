import { useState, useEffect } from "react";
import { Shield, Fingerprint, Key, Cpu, Link, Calendar, Mail, ChevronLeft, ChevronRight, Bot } from "lucide-react";
import { LOCAL_MODELS } from "@/lib/models";
import logo from "@/assets/logo.svg";

interface OnboardingProps {
  onComplete: (config: OnboardingConfig) => void;
}

export interface OnboardingConfig {
  userName: string;
  tone: string;
  localModel: string;
  cloudFallback: string;
  integrations: string[];
  authMethod: "biometrics" | "pin" | "passphrase";
  starterAgent: string;
}

// Only show the two nano models for onboarding
const ONBOARDING_MODELS = LOCAL_MODELS
  .filter((m) => m.id === "lfm2.5-1.2b-instruct" || m.id === "lfm2.5-1.2b-thinking")
  .map((m) => ({
    id: m.id,
    nm: m.name,
    ds: m.description,
    size: m.size_mb >= 1000 ? `${(m.size_mb / 1024).toFixed(1)} GB` : `${m.size_mb} MB`,
  }));

const INTEGRATIONS = [
  { id: "calendar", nm: "Calendar", ds: "Sync events & reminders" },
  { id: "gmail", nm: "Gmail", ds: "Email integration" },
];

const AUTH_METHODS = [
  { id: "biometrics" as const, nm: "Biometrics", ds: "Face ID / Fingerprint", icon: Fingerprint },
  { id: "pin" as const, nm: "Numeric PIN", ds: "4-6 digit code", icon: Key },
  { id: "passphrase" as const, nm: "Passphrase", ds: "Word-based password", icon: Shield },
];

const STARTER_AGENTS = [
  { id: "manager", nm: "Manager", ds: "Coordinates tasks and delegates work", icon: "🎯" },
  { id: "assistant", nm: "Assistant", ds: "General-purpose help and note-taking", icon: "✨" },
  { id: "coder", nm: "Code Assistant", ds: "Programming help and code review", icon: "💻" },
  { id: "writer", nm: "Content Writer", ds: "Writing, editing, and summarizing", icon: "✍️" },
];

// Encrypted text scramble effect
function EncText({ text, speed = 24 }: { text: string; speed?: number }) {
  const GLYPHS = "█▓▒░ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$@!?";
  const [chars, setChars] = useState(() => text.split("").map(() => ({ c: "█", locked: false })));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    text.split("").forEach((ch, i) => {
      let n = 0;
      const max = 4 + Math.floor(i * 1.3);
      const iv = setInterval(() => {
        n++;
        setChars((p) => {
          const a = [...p];
          a[i] = { c: ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)], locked: false };
          return a;
        });
        if (n >= max) {
          clearInterval(iv);
          const t = setTimeout(
            () => setChars((p) => { const a = [...p]; a[i] = { c: ch, locked: true }; return a; }),
            i * speed
          );
          timers.push(t);
        }
      }, 36);
      timers.push(iv);
    });
    return () => timers.forEach((x) => { clearInterval(x); clearTimeout(x); });
  }, [text, speed]);

  return (
    <span className="inline">
      {chars.map((ch, i) => (
        <span
          key={i}
          className={`inline-block transition-colors duration-75 ${
            ch.locked ? "text-foreground animate-[fadeIn_0.1s_ease_both]" : "text-muted-foreground font-mono tracking-tight"
          }`}
        >
          {ch.c}
        </span>
      ))}
    </span>
  );
}

export { EncText };

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-0.5 rounded-full transition-all duration-500 ${
            i < current ? "w-4 bg-muted-foreground" : i === current ? "w-7 bg-foreground" : "w-4 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function NavArrows({ onBack, onNext, nextLabel = "Continue" }: { onBack?: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex items-center gap-3 w-full mt-1">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center justify-center h-12 w-12 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="w-12 shrink-0" />
      )}
      <button
        onClick={onNext}
        className="flex-1 py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        {nextLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function IntegrationIcon({ id }: { id: string }) {
  switch (id) {
    case "calendar": return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />;
    case "gmail": return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
    default: return <Link className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// Step 1: Welcome
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center animate-[scaleIn_0.4s_ease_both] w-full max-w-[400px] mx-auto">
      <div className="mb-8">
        <img src={logo} alt="ViBo AI" className="h-16 w-16" />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-3">
        <EncText text="ViBo AI · Virtual Notebook" speed={26} />
      </p>
      <h1 className="text-3xl font-light text-foreground mb-3 tracking-tight">
        Think, Write,
        <br />
        <em className="italic text-muted-foreground font-light">Plan Privately.</em>
      </h1>
      <p className="text-sm text-muted-foreground max-w-[340px] mb-7 leading-relaxed">
        A private AI notebook on your device. No accounts. No cloud. No tracking. Ever.
      </p>
      <div className="flex items-center gap-5 mb-8">
        {["Local", "Encrypted", "Private"].map((t) => (
          <div key={t} className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            {t}
          </div>
        ))}
      </div>
      <button
        onClick={onNext}
        className="w-full max-w-[340px] py-3.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Begin setup
      </button>
    </div>
  );
}

// Step 2: Model Selection
function ModelStep({ selected, onSelect, onNext, onBack }: { selected: string; onSelect: (id: string) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-[440px] mx-auto animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={0} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 1 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Choose your<br /><em className="italic text-muted-foreground">local model.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5 leading-relaxed">
        Select a nano model for on-device inference. More models available in <strong className="text-foreground">Settings → Liquid AI</strong>.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {ONBOARDING_MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              selected === m.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
            }`}
          >
            <div className={`w-4.5 h-4.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
              selected === m.id ? "border-foreground bg-foreground" : "border-border"
            }`}>
              {selected === m.id && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{m.nm}</div>
              <div className="text-[11px] font-mono text-muted-foreground tracking-wide">{m.ds}</div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{m.size}</span>
          </button>
        ))}
      </div>
      <NavArrows onBack={onBack} onNext={onNext} nextLabel="Continue setup" />
    </div>
  );
}

// Step 3: Integrations (no exolabs)
function IntegrationsStep({ enabled, onToggle, onNext, onBack }: { enabled: string[]; onToggle: (id: string) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-[440px] mx-auto animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={1} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 2 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Connect<br /><em className="italic text-muted-foreground">your world.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        Give agents access to your tools. You decide exactly what they can see.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {INTEGRATIONS.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <IntegrationIcon id={it.id} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{it.nm}</div>
              <div className="text-[11px] text-muted-foreground">{it.ds}</div>
            </div>
            <button
              onClick={() => onToggle(it.id)}
              className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                enabled.includes(it.id) ? "bg-foreground" : "bg-muted"
              }`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                enabled.includes(it.id) ? "left-[18px]" : "left-0.5"
              }`} />
            </button>
          </div>
        ))}
      </div>
      <NavArrows onBack={onBack} onNext={onNext} />
      <button onClick={onNext} className="w-full py-3 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground mt-2 transition-colors">
        Skip integrations
      </button>
    </div>
  );
}

// Biometric confirmation card
function BiometricConfirmCard({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onConfirm();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease_both]">
      <div className="w-full max-w-[320px] mx-4 rounded-2xl border border-border bg-card p-6 shadow-lg animate-[scaleIn_0.3s_ease_both]">
        <div className="text-center">
          <div className={`mx-auto w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4 transition-all ${scanning ? "bg-primary/10 border-2 border-primary" : ""}`}>
            <Fingerprint className={`h-10 w-10 transition-colors ${scanning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {scanning ? "Scanning..." : "Confirm Biometrics"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {scanning ? "Hold your finger on the sensor" : "Tap below to verify your fingerprint or Face ID"}
          </p>
          {!scanning && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleScan}
                className="w-full py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Scan now
              </button>
              <button
                onClick={onCancel}
                className="w-full py-3 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 4: Security (Auth method)
function SecurityStep({ selected, onSelect, onNext, onBack }: { selected: "biometrics" | "pin" | "passphrase"; onSelect: (m: "biometrics" | "pin" | "passphrase") => void; onNext: () => void; onBack: () => void }) {
  const [showBiometricCard, setShowBiometricCard] = useState(false);

  const handleSelect = (id: "biometrics" | "pin" | "passphrase") => {
    onSelect(id);
    if (id === "biometrics") {
      setShowBiometricCard(true);
    }
  };

  return (
    <>
      {showBiometricCard && (
        <BiometricConfirmCard
          onConfirm={() => setShowBiometricCard(false)}
          onCancel={() => {
            setShowBiometricCard(false);
            onSelect("pin");
          }}
        />
      )}
      <div className="w-full max-w-[440px] mx-auto animate-[scaleIn_0.4s_ease_both]">
        <StepIndicator current={2} total={5} />
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 3 of 5</p>
        <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
          Secure your<br /><em className="italic text-muted-foreground">vault.</em>
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-5">
          Choose how you unlock ViBo. Biometrics first, password as fallback.
        </p>
        <div className="flex flex-col gap-2 mb-5">
          {AUTH_METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m.id)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                selected === m.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                selected === m.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}>
                <m.icon className="h-4.5 w-4.5" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{m.nm}</div>
                <div className="text-[11px] text-muted-foreground">{m.ds}</div>
              </div>
              <div className={`w-4.5 h-4.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                selected === m.id ? "border-foreground bg-foreground" : "border-border"
              }`}>
                {selected === m.id && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
              </div>
            </button>
          ))}
        </div>
        <NavArrows onBack={onBack} onNext={onNext} />
      </div>
    </>
  );
}

// Step 5: Choose your starter agent
function AgentStep({ selected, onSelect, onNext, onBack }: { selected: string; onSelect: (id: string) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-[440px] mx-auto animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={3} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 4 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        Your first<br /><em className="italic text-muted-foreground">agent.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        Pick a starter agent. You can add more later in Settings.
      </p>
      <div className="flex flex-col gap-2 mb-5">
        {STARTER_AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
              selected === a.id ? "border-foreground bg-card" : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg ${
              selected === a.id ? "bg-foreground" : "bg-muted"
            }`}>
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{a.nm}</div>
              <div className="text-[11px] text-muted-foreground">{a.ds}</div>
            </div>
            <div className={`w-4.5 h-4.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
              selected === a.id ? "border-foreground bg-foreground" : "border-border"
            }`}>
              {selected === a.id && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
            </div>
          </button>
        ))}
      </div>
      <NavArrows onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 6: Your Name
function NameStep({ onComplete, onBack }: { onComplete: (name: string) => void; onBack: () => void }) {
  const [name, setName] = useState("");

  return (
    <div className="w-full max-w-[440px] mx-auto animate-[scaleIn_0.4s_ease_both]">
      <StepIndicator current={4} total={5} />
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2 text-center">Step 5 of 5</p>
      <h2 className="text-2xl font-light text-foreground text-center mb-2 tracking-tight">
        About<br /><em className="italic text-muted-foreground">you.</em>
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-5">
        What should we call you?
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name…"
        className="w-full py-3 px-4 rounded-xl bg-muted border border-border text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 mb-5"
      />
      <NavArrows onBack={onBack} onNext={() => onComplete(name || "User")} nextLabel="Finish setup" />
    </div>
  );
}

const ONBOARDING_KEY = "zettel-onboarding-done";
const AI_CONFIG_KEY = "zettel-ai-config";

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function getAiConfig(): OnboardingConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { userName: "User", tone: "direct", localModel: "lfm2.5-1.2b-instruct", cloudFallback: "none", integrations: [], authMethod: "biometrics", starterAgent: "assistant" };
  } catch {
    return { userName: "User", tone: "direct", localModel: "lfm2.5-1.2b-instruct", cloudFallback: "none", integrations: [], authMethod: "biometrics", starterAgent: "assistant" };
  }
}

export function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<"welcome" | "model" | "integrations" | "security" | "agent" | "name">("welcome");
  const [model, setModel] = useState("lfm2.5-1.2b-instruct");
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [authMethod, setAuthMethod] = useState<"biometrics" | "pin" | "passphrase">("biometrics");
  const [starterAgent, setStarterAgent] = useState("assistant");

  const toggleIntegration = (id: string) => {
    setIntegrations((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const finish = (name: string) => {
    const config: OnboardingConfig = { userName: name, tone: "direct", localModel: model, cloudFallback: "none", integrations, authMethod, starterAgent };
    localStorage.setItem(ONBOARDING_KEY, "true");
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    onComplete(config);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-start bg-background px-5 relative overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,hsl(var(--foreground)/0.03),transparent)]" />
      <div className="flex-1 flex flex-col items-center justify-center w-full py-8 sm:py-12">
        {step === "welcome" && <WelcomeStep onNext={() => setStep("model")} />}
        {step === "model" && <ModelStep selected={model} onSelect={setModel} onNext={() => setStep("integrations")} onBack={() => setStep("welcome")} />}
        {step === "integrations" && <IntegrationsStep enabled={integrations} onToggle={toggleIntegration} onNext={() => setStep("security")} onBack={() => setStep("model")} />}
        {step === "security" && <SecurityStep selected={authMethod} onSelect={setAuthMethod} onNext={() => setStep("agent")} onBack={() => setStep("integrations")} />}
        {step === "agent" && <AgentStep selected={starterAgent} onSelect={setStarterAgent} onNext={() => setStep("name")} onBack={() => setStep("security")} />}
        {step === "name" && <NameStep onComplete={finish} onBack={() => setStep("agent")} />}
      </div>
    </div>
  );
}
