import { useState } from "react";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { isPinSetup, verifyPin, setupPin } from "@/lib/crypto";

interface LockScreenProps {
  onUnlock: (pin: string) => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const isSetup = isPinSetup();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">(isSetup ? "enter" : "enter");
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (isSetup) {
      // Verify existing PIN
      const valid = await verifyPin(pin);
      if (valid) {
        onUnlock(pin);
      } else {
        setError("Incorrect PIN. Try again.");
        setPin("");
      }
    } else {
      // Setup new PIN
      if (step === "enter") {
        if (pin.length < 4) {
          setError("PIN must be at least 4 characters");
          return;
        }
        setStep("confirm");
        setConfirmPin("");
      } else {
        if (confirmPin !== pin) {
          setError("PINs don't match. Try again.");
          setConfirmPin("");
          return;
        }
        await setupPin(pin);
        onUnlock(pin);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 overflow-y-auto">
      <div className="w-full max-w-xs flex flex-col items-center gap-6">
        {/* Icon */}
        <div className="h-16 w-16 rounded-2xl bg-foreground/10 flex items-center justify-center">
          {isSetup ? (
            <Lock className="h-8 w-8 text-foreground" />
          ) : (
            <ShieldCheck className="h-8 w-8 text-foreground" />
          )}
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">
            {isSetup ? "Vault Locked" : "Set Up Encryption"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSetup
              ? "Enter your PIN to decrypt your notes"
              : step === "enter"
              ? "Create a PIN to encrypt your notes at rest"
              : "Confirm your PIN"}
          </p>
        </div>

        {/* PIN Input */}
        <div className="w-full space-y-3">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={step === "confirm" ? confirmPin : pin}
              onChange={(e) =>
                step === "confirm"
                  ? setConfirmPin(e.target.value)
                  : setPin(e.target.value)
              }
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={step === "confirm" ? "Confirm PIN..." : "Enter PIN..."}
              className="w-full h-12 rounded-xl bg-muted border border-border px-4 pr-10 text-center text-lg tracking-[0.3em] font-mono text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity"
          >
            {isSetup ? "Unlock" : step === "enter" ? "Next" : "Enable Encryption"}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
          {isSetup
            ? "Your notes are encrypted with AES-256-GCM"
            : "Your PIN derives an AES-256 key to encrypt all notes locally"}
        </p>
      </div>
    </div>
  );
}
