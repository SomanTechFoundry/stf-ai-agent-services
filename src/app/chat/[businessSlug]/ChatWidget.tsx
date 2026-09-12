"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ============================================================
// Types
// ============================================================

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  isError?: boolean;
  isStreaming?: boolean;
}

interface Props {
  businessId: string;
  businessName: string;
  agentName: string;
  welcomeMessage: string;
  businessPhone: string | null;
  businessLocation: string | null;
}

// ============================================================
// Helpers
// ============================================================

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Read a ReadableStream body as NDJSON.
 * Each line is one JSON object; blank lines are skipped.
 */
async function* readNDJSON(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // malformed line — skip
        }
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Typewriter animation speed (characters per second).
 * 80 chars/s ≈ fast typing feel; at 500 chars response ≈ 6s to type out.
 * We use word-level chunks (not char-by-char) for performance.
 */
const TYPEWRITER_CHARS_PER_SEC = 300;

/**
 * Animate text appearing word-by-word in a message bubble.
 * Returns a cancel function.
 */
function animateTypewriter(
  fullText: string,
  onProgress: (partial: string) => void,
  onDone: () => void
): () => void {
  // Split at word boundaries, keeping whitespace attached to words
  const tokens = fullText.match(/\S+\s*/g) ?? [fullText];
  let i = 0;
  let cancelled = false;

  // Calculate per-token delay so total time ≈ fullText.length / CHARS_PER_SEC
  const totalChars = fullText.length;
  const totalMs = (totalChars / TYPEWRITER_CHARS_PER_SEC) * 1000;
  const delayMs = tokens.length > 0 ? Math.max(8, totalMs / tokens.length) : 16;

  function tick() {
    if (cancelled) return;
    if (i >= tokens.length) {
      onDone();
      return;
    }
    const partial = tokens.slice(0, i + 1).join("");
    onProgress(partial);
    i++;
    setTimeout(tick, delayMs);
  }

  // Start after a tiny delay so the bubble appears first
  const timer = setTimeout(tick, 50);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

// ============================================================
// Sub-components
// ============================================================

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function AgentAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 flex-shrink-0 select-none items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
      {initials}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-gray-500 ml-0.5 animate-pulse align-middle" />
  );
}

function MessageBubble({ message, agentName }: { message: Message; agentName: string }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} items-end`}>
      {!isUser && <AgentAvatar name={agentName} />}

      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "rounded-br-sm bg-slate-900 text-white"
              : message.isError
              ? "bg-red-50 text-red-700 border border-red-200 rounded-bl-sm"
              : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm"
          }`}
        >
          {message.content}
          {message.isStreaming && <StreamingCursor />}
        </div>
        {!message.isStreaming && (
          <span className="text-[11px] text-gray-400 px-1">
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Main ChatWidget
// ============================================================

export function ChatWidget({
  businessId,
  businessName,
  agentName,
  welcomeMessage,
  businessPhone,
  businessLocation,
}: Props) {
  const initialMessage = useMemo<Message>(
    () => ({ id: generateId(), role: "agent", content: welcomeMessage, timestamp: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelTypewriter = useRef<(() => void) | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Append user message immediately
    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError(null);
    setIsLoading(true);

    if (inputRef.current) inputRef.current.style.height = "auto";

    // Create placeholder agent message that will be filled as tokens arrive
    const agentMsgId = generateId();
    const agentMsgTimestamp = new Date();

    try {
      const res = await fetch("/api/agent/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          businessId,
          message:        text,
          conversationId,
          channel:        "WEBCHAT",
          stream:         true,
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: { message?: string } })?.error?.message ?? "Something went wrong.");
      }

      // Keep typing dots visible (isLoading=true) until the text chunk arrives.
      // Read NDJSON stream: server sends one "chunk" event with the full AI
      // text, then a "done" event. We animate the text with a local typewriter
      // so the UX feels progressive even though the text arrived all at once.
      let agentBubbleAdded = false;

      for await (const event of readNDJSON(res.body)) {
        if (event.type === "chunk" && typeof event.text === "string") {
          const fullText = event.text;

          // Add the agent bubble and hide typing dots at the same time
          if (!agentBubbleAdded) {
            agentBubbleAdded = true;
            setMessages((prev) => [
              ...prev,
              { id: agentMsgId, role: "agent", content: "", timestamp: agentMsgTimestamp, isStreaming: true },
            ]);
            setIsLoading(false);
            setIsStreaming(true);
          }

          // Cancel any in-progress animation
          cancelTypewriter.current?.();

          // Start typewriter animation
          cancelTypewriter.current = animateTypewriter(
            fullText,
            (partial) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId ? { ...m, content: partial, isStreaming: true } : m
                )
              );
            },
            () => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentMsgId
                    ? { ...m, content: fullText, isStreaming: false }
                    : m
                )
              );
              setIsStreaming(false);
            }
          );
        } else if (event.type === "done") {
          if (typeof event.conversationId === "string") {
            setConversationId(event.conversationId);
          }
        } else if (event.type === "error") {
          const errMsg = typeof event.message === "string" ? event.message : "An error occurred.";
          cancelTypewriter.current?.();
          if (!agentBubbleAdded) {
            agentBubbleAdded = true;
            setMessages((prev) => [
              ...prev,
              { id: agentMsgId, role: "agent", content: errMsg, timestamp: agentMsgTimestamp, isStreaming: false, isError: true },
            ]);
            setIsLoading(false);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? { ...m, content: errMsg, isStreaming: false, isError: true }
                  : m
              )
            );
          }
          setError(errMsg);
          setIsStreaming(false);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Connection error. Please try again.";
      setError(errMsg);

      // If we already added the placeholder, update it to an error bubble
      setMessages((prev) => {
        const hasPlaceholder = prev.some((m) => m.id === agentMsgId);
        if (hasPlaceholder) {
          return prev.map((m) =>
            m.id === agentMsgId
              ? { ...m, content: errMsg, isStreaming: false, isError: true }
              : m
          );
        }
        return [
          ...prev,
          { id: generateId(), role: "agent", content: errMsg, timestamp: new Date(), isError: true },
        ];
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isLoading, businessId, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isBusy = isLoading || isStreaming;
  const canSend = input.trim().length > 0 && !isBusy;
  const showTypingDots = isLoading;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 font-bold text-white">
          {agentName[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 text-sm leading-tight truncate">{agentName}</h1>
          <p className="text-xs text-gray-500 truncate">{businessName}</p>
        </div>
        <div className="text-right hidden sm:block">
          {businessLocation && <p className="text-xs text-gray-400">{businessLocation}</p>}
          {businessPhone && (
            <a href={`tel:${businessPhone}`} className="text-xs font-medium text-teal-800 hover:underline">
              {businessPhone}
            </a>
          )}
        </div>
        <StatusDot />
      </header>

      {/* ── Messages ───────────────────────────────────────────── */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-[#f4f2ee] px-4 py-4">
        <div className="text-center py-2">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Today</span>
        </div>

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} agentName={agentName} />
        ))}

        {showTypingDots && (
          <div className="flex gap-2 items-end">
            <AgentAvatar name={agentName} />
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm shadow-sm">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2">
          <p className="text-xs text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-white border-t border-gray-200">
        <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2 transition-all focus-within:border-teal-700 focus-within:ring-1 focus-within:ring-teal-700/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isBusy ? `${agentName} is typing…` : "Type a message…"}
            rows={1}
            disabled={isBusy}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none py-1 max-h-28 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
          >
            <SendIcon />
          </button>
        </div>
        <p className="text-center text-[11px] text-gray-300 mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ── Inline icons (no external dependency) ─────────────────────────────────────

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 translate-x-0.5">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

function StatusDot() {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-xs text-gray-400 hidden sm:inline">Online</span>
    </div>
  );
}
