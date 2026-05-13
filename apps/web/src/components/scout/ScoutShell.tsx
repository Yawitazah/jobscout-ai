"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  onClose?: () => void; // for bubble mode
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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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
        {(msg as { statusText?: string }).statusText && (
          <p className="text-xs text-gray-400 italic px-1">{(msg as { statusText?: string }).statusText}</p>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-[#1A2B4C] text-white rounded-tr-sm"
              : "bg-gray-100 text-gray-900 rounded-tl-sm"
          }`}
        >
          {msg.content}
          {(msg as { streaming?: boolean }).streaming && (
            <span className="inline-block w-2 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

export function ScoutShell({ initialConversationId, onClose }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<(Message & { streaming?: boolean; statusText?: string })[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/scout/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when activeId changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    fetch(`/api/scout/conversations/${activeId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setMessages(data.messages ?? []); });
  }, [activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function createConversation(): Promise<string> {
    const res = await fetch("/api/scout/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    await loadConversations();
    return data.id;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    let convId = activeId;
    if (!convId) {
      convId = await createConversation();
      setActiveId(convId);
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() };
    const assistantMsg: Message & { streaming: boolean } = { id: crypto.randomUUID(), role: "assistant", content: "", created_at: new Date().toISOString(), streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/scout/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: "Something went wrong. Please try again.", streaming: false } : m));
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
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + event.delta } : m));
            } else if (event.type === "status") {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, statusText: event.text } : m));
            } else if (event.type === "done") {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false, statusText: undefined } : m));
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Refresh conversation list (title may have updated)
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
    await fetch(`/api/scout/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    setRenamingId(null);
  }

  const activeConvo = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 transition-all duration-200 overflow-hidden flex flex-col bg-[#1A2B4C] text-white`}>
        <div className="p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ScoutIcon size={22} />
            <span className="font-semibold text-sm tracking-wide">Scout</span>
          </div>
          <button
            onClick={() => { setActiveId(null); setMessages([]); }}
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
                  onKeyDown={(e) => { if (e.key === "Enter") renameConversation(c.id, renameValue); if (e.key === "Escape") setRenamingId(null); }}
                  className="w-full bg-white/10 text-white text-xs rounded px-2 py-1.5 outline-none"
                />
              ) : (
                <button
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate ${activeId === c.id ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
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
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
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
                  "I'm looking for a senior marketing director role",
                  "Find me remote product manager jobs at tech startups",
                  "I want to transition into UX design",
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
          <div className="flex items-end gap-3 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 focus-within:border-[#1A2B4C]/40 focus-within:ring-2 focus-within:ring-[#1A2B4C]/10 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Tell Scout what you're looking for…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none outline-none max-h-40 overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            />
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
            Scout searches the web in real-time · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
