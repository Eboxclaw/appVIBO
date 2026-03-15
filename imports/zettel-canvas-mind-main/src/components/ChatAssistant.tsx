import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Send, FileText, Columns3, Bot, User, Zap, ZapOff } from "lucide-react";
import { isLfmConfigured, streamLfmChat, getActiveProviderLabel, type LfmMessage } from "@/lib/lfm";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hey! I can help you create notes, tasks, or just chat. Try:\n• **\"new note: My Idea\"** to create a note\n• **\"new task: Fix bug\"** to create a task\n• Or just ask me anything!",
};

// Store messages per session
const sessionMessages = new Map<string, ChatMessage[]>();

export function ChatAssistant({ compact = false, sessionId = "default" }: { compact?: boolean; sessionId?: string }) {
  const { addNote, setActiveView } = useStore();

  // Init session messages if needed
  if (!sessionMessages.has(sessionId)) {
    sessionMessages.set(sessionId, [GREETING]);
  }

  const [messages, setMessages] = useState<ChatMessage[]>(sessionMessages.get(sessionId)!);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [lfmActive, setLfmActive] = useState(isLfmConfigured);
  const [providerLabel, setProviderLabel] = useState(getActiveProviderLabel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync messages when session changes
  useEffect(() => {
    if (!sessionMessages.has(sessionId)) {
      sessionMessages.set(sessionId, [GREETING]);
    }
    setMessages(sessionMessages.get(sessionId)!);
    setInput("");
    setIsTyping(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [sessionId]);

  // Persist messages back to map
  useEffect(() => {
    sessionMessages.set(sessionId, messages);
  }, [messages, sessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    const iv = setInterval(() => { setLfmActive(isLfmConfigured()); setProviderLabel(getActiveProviderLabel()); }, 2000);
    return () => clearInterval(iv);
  }, []);

  const handleCommand = useCallback((text: string): ChatMessage | null => {
    const lower = text.toLowerCase().trim();

    if (lower.startsWith("new note:") || lower.startsWith("note:")) {
      const title = text.replace(/^(new\s+)?note:\s*/i, "").trim() || "Untitled";
      addNote("inbox", false);
      setActiveView("notebook");
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `📝 Created note **"${title}"**. Switched to Notes view!`,
      };
    }

    if (lower.startsWith("new task:") || lower.startsWith("task:")) {
      const title = text.replace(/^(new\s+)?task:\s*/i, "").trim() || "Untitled Task";
      addNote("inbox", true);
      setActiveView("kanban");
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `✅ Created task **"${title}"** in Inbox column!`,
      };
    }

    return null;
  }, [addNote, setActiveView]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const cmdReply = handleCommand(text);
    if (cmdReply) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [...prev, cmdReply]);
        setIsTyping(false);
      }, 300);
      return;
    }

    if (isLfmConfigured()) {
      setIsTyping(true);
      const assistantId = crypto.randomUUID();
      let assistantContent = "";

      const lfmMessages: LfmMessage[] = [
        ...messages.filter((m) => m.id !== "welcome").map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: text },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      streamLfmChat({
        messages: lfmMessages,
        signal: controller.signal,
        onDelta: (chunk) => {
          assistantContent += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.id === assistantId) {
              return prev.map((m) => (m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
            return [...prev, { id: assistantId, role: "assistant", content: assistantContent }];
          });
        },
        onDone: () => {
          setIsTyping(false);
          abortRef.current = null;
        },
        onError: (err) => {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${err}` },
          ]);
          setIsTyping(false);
          abortRef.current = null;
        },
      });
      return;
    }

    setIsTyping(true);
    setTimeout(() => {
      const responses = [
        `Connect a local LFM server in **Settings → Plugins** for AI-powered replies!`,
        `I'm in offline mode. Set up your LFM endpoint to unlock full AI chat.`,
        `Want smarter replies? Add your local LFM server URL in **Settings**.`,
      ];
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: responses[Math.floor(Math.random() * responses.length)] },
      ]);
      setIsTyping(false);
    }, 400);
  }, [input, messages, handleCommand]);

  const quickActions = [
    { label: "New Note", icon: FileText, action: () => setInput("new note: ") },
    { label: "New Task", icon: Columns3, action: () => setInput("new task: ") },
  ];

  return (
    <div className={`flex flex-col h-full ${compact ? "" : "rounded-2xl card-3d-elevated"} overflow-hidden`}>
      {!compact && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Assistant</div>
            <div className="text-[10px] text-muted-foreground">Always ready to help</div>
          </div>
          <div className={`flex items-center gap-1 text-[9px] font-mono ${lfmActive ? "text-primary" : "text-muted-foreground"}`}>
            {lfmActive ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
            {lfmActive ? providerLabel : "Offline"}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-foreground text-background rounded-br-md"
                  : "bg-accent text-accent-foreground rounded-bl-md"
              }`}
            >
              {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </div>
            {msg.role === "user" && (
              <div className="h-6 w-6 rounded-full bg-foreground/20 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {isTyping && !messages.some((m) => m.role === "assistant" && m.content === "") && (
          <div className="flex gap-2">
            <div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="bg-accent rounded-2xl rounded-bl-md px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-1.5 px-3 pb-1.5">
        {quickActions.map((qa) => (
          <button
            key={qa.label}
            onClick={() => { qa.action(); inputRef.current?.focus(); }}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted hover:bg-accent hover:text-foreground rounded-full px-2.5 py-1 transition-colors"
          >
            <qa.icon className="h-3 w-3" />
            {qa.label}
          </button>
        ))}
        {compact && (
          <div className={`ml-auto flex items-center gap-1 text-[9px] font-mono ${lfmActive ? "text-primary" : "text-muted-foreground"}`}>
            {lfmActive ? <Zap className="h-2.5 w-2.5" /> : <ZapOff className="h-2.5 w-2.5" />}
            {lfmActive ? providerLabel : "Offline"}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={lfmActive ? `Ask ${providerLabel}...` : "Type a message..."}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-7 w-7 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
