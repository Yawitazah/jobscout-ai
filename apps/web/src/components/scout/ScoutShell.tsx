"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  initialConversationId?: string;
  applicationId?: string;
  onClose?: () => void;
}

function ScoutIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1A2B4C" />
      <path d="M8 12.5c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="1.5" fill="white" />
    </svg>
  );
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={active ? "currentColor" : "none"} />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="21" x2="12" y2="17" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 space-y-0.5 list-disc list-inside">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 space-y-0.5 list-decimal list-inside">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
        h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
        h3: ({ children }) => <p className="font-medium mb-1">{children}</p>,
        hr: () => <div className="my-2 border-t border-gray-200" />,
        code: ({ children }) => <code className="bg-gray-200 rounded px-1 text-xs font-mono">{children}</code>,
        pre: ({ children }) => <pre className="bg-gray-200 rounded p-2 text-xs overflow-x-auto mb-2">{children}</pre>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageBubble({ msg }: { msg: Message & { streaming?: boolean; statusText?: string } }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="shrink-0 mt-0.5">
          <ScoutIcon size={28} />
        </div>
      )}
      <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {msg.statusText && (
          <p className="text-xs text-gray-400 italic px-1">{msg.statusText}</p>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-[#1A2B4C] text-white rounded-tr-sm whitespace-pre-wrap"
              : "bg-gray-100 text-gray-900 rounded-tl-sm"
          }`}
        >
          {isUser ? (
            msg.content
          ) : (
            <>
              <AssistantMarkdown content={msg.content} />
              {msg.streaming && !msg.content && (
                <span className="inline-block w-2 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
              )}
            </>
          )}
          {msg.streaming && msg.content && (
            <span className="inline-block w-1.5 h-3.5 bg-gray-500 ml-0.5 animate-pulse rounded-sm align-middle" />
          )}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Voice dictation hook ─────────────────────────────────────────────────────

function useVoiceDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const supported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  const start = useCallback(() => {
    if (!supported || listening) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      onTranscript(finalTranscript + interim);
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [supported, listening, onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  return { listening, toggle, supported };
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function ScoutShell({ initialConversationId, applicationId, onClose }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<(Message & { streaming?: boolean; statusText?: string })[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Default the sidebar to closed on mobile (full-chat view) and open on
  // desktop (split inline). The hamburger toggles in both modes.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarOpen(true);
    }
  }, []);

  // Voice dictation — updates input live with speech
  const { listening, toggle: toggleMic, supported: micSupported } = useVoiceDictation(
    useCallback((text: string) => setInput(text), [])
  );

  // Load conversations
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/scout/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when activeId changes.
  // Skip overwriting state if a stream is in progress (avoid wiping optimistic messages).
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    fetch(`/api/scout/conversations/${activeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setMessages((prev) => {
            // If any message is still streaming, keep the optimistic state
            if (prev.some((m) => (m as Message & { streaming?: boolean }).streaming)) return prev;
            return data.messages ?? [];
          });
        }
      });
  }, [activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function createConversation(): Promise<string> {
    const res = await fetch("/api/scout/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    await loadConversations();
    return data.id;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    // Stop voice if active
    if (listening) toggleMic();

    let convId = activeId;
    if (!convId) {
      convId = await createConversation();
      setActiveId(convId);
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() };
    const assistantMsg: Message & { streaming: boolean } = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/scout/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(applicationId ? { applicationId } : {}) }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "Something went wrong. Please try again.", streaming: false }
              : m
          )
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + event.delta } : m)
              );
            } else if (event.type === "status") {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, statusText: event.text } : m)
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false, statusText: undefined } : m)
              );
            }
          } catch { /* ignore parse errors */ }
        }
      }

      loadConversations();
      if (!onClose) router.refresh();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/scout/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) { setActiveId(null); setMessages([]); }
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  async function renameConversation(id: string, title: string) {
    if (!title.trim()) return;
    await fetch(`/api/scout/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    setRenamingId(null);
  }

  const activeConvo = conversations.find((c) => c.id === activeId);

  // Sidebar content is shared between the inline (desktop) and the overlay
  // drawer (mobile) variants.
  const sidebarContent = (
    <>
      <div className="p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ScoutIcon size={22} />
          <span className="font-semibold text-sm tracking-wide">Scout</span>
        </div>
        <button
          onClick={() => {
            setActiveId(null);
            setMessages([]);
            // On mobile, jumping into a fresh chat should close the drawer
            // so the user lands on the chat surface.
            if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
              setSidebarOpen(false);
            }
          }}
          title="New conversation"
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-white/40 text-xs px-2 py-4 text-center">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <div key={c.id} className="group relative">
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => renameConversation(c.id, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameConversation(c.id, renameValue);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-full bg-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setActiveId(c.id);
                  // On mobile, picking a conversation should close the drawer
                  // so we drop the user back into the chat full-screen.
                  if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
                    setSidebarOpen(false);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate pr-14 ${
                  activeId === c.id ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {c.title}
              </button>
            )}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }}
                className="p-1 rounded hover:bg-white/20"
                title="Rename"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.944l-3.414.586.586-3.414A4 4 0 019 12.414V13z" />
                </svg>
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                className="p-1 rounded hover:bg-red-500/40"
                title="Delete"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative flex h-full w-full flex-1 overflow-hidden bg-white">
      {/* Sidebar — desktop (inline, toggleable column) */}
      <div
        className={`hidden lg:flex ${sidebarOpen ? "w-64" : "w-0"} shrink-0 transition-all duration-200 overflow-hidden flex-col bg-[#1A2B4C] text-white`}
      >
        {sidebarContent}
      </div>

      {/* Sidebar — mobile (overlay drawer; never splits the screen) */}
      <div
        className={`lg:hidden absolute inset-0 z-30 bg-black/40 transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`lg:hidden absolute inset-y-0 left-0 z-40 w-72 max-w-[80%] bg-[#1A2B4C] text-white flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-label="Scout conversations"
        aria-modal="true"
      >
        {sidebarContent}
      </div>

      {/* Main chat area — always full width on mobile, fills remaining space on desktop */}
      <div className="flex flex-col flex-1 min-w-0 w-full">
        {/* Header */}
        <div className="shrink-0 h-12 border-b border-gray-100 flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Toggle sidebar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 truncate flex-1">
            {activeConvo?.title ?? "Scout — Your Job Search Agent"}
          </span>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-20">
              <ScoutIcon size={48} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Hey, I&apos;m Scout</h2>
                <p className="text-gray-500 text-sm mt-1 max-w-sm">
                  Tell me what you&apos;re looking for in your next role — I&apos;ll search the web and find you real opportunities.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[
                  "Search for jobs based on my profile",
                  "Find me remote senior roles in tech",
                  "What's my best match right now?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="text-xs border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50 text-gray-600 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-100 p-4">
          <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 focus-within:border-[#1A2B4C]/40 focus-within:ring-2 focus-within:ring-[#1A2B4C]/10 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={listening ? "Listening…" : "Tell Scout what you're looking for…"}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none outline-none overflow-y-auto"
              style={{ scrollbarWidth: "none", minHeight: "24px", maxHeight: "160px" }}
            />

            {/* Mic button */}
            {micSupported && (
              <button
                onClick={toggleMic}
                title={listening ? "Stop listening" : "Start voice input"}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  listening
                    ? "bg-red-500 text-white animate-pulse"
                    : "text-gray-400 hover:text-[#1A2B4C] hover:bg-gray-200"
                }`}
              >
                <MicIcon active={listening} />
              </button>
            )}

            {/* Send button */}
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="shrink-0 w-8 h-8 rounded-full bg-[#1A2B4C] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#243d6b] transition-colors"
            >
              {sending ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">
            Scout searches the web in real-time · Enter to send · Shift+Enter for new line
            {micSupported && " · Mic for voice"}
          </p>
        </div>
      </div>
    </div>
  );
}
