"use client";

import { useCallback, useEffect, useState } from "react";

interface ConversationSummary {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  customer: { name: string; phone: string | null; email: string | null } | null;
  lastMessage: { role: string; content: string; createdAt: string } | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  RESOLVED: "bg-gray-100 text-gray-600",
  ESCALATED: "bg-amber-100 text-amber-800",
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [detailCustomer, setDetailCustomer] = useState<ConversationSummary["customer"]>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/conversations");
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Failed to load conversations.");
        return;
      }
      setConversations(json.data.conversations);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function openConversation(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/dashboard/conversations/${id}`);
      const json = await res.json();
      if (!res.ok) return;
      setMessages(json.data.messages);
      setDetailCustomer(json.data.customer);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="text-sm text-gray-500 mt-1">Chat sessions from the AI receptionist</p>
        </div>
        <button
          type="button"
          onClick={loadList}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[480px]">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
            Recent ({conversations.length})
          </div>
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 font-medium">No conversations yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Start a chat at{" "}
                <a href="/chat/sunset-salon" className="text-violet-600 hover:underline">
                  /chat/sunset-salon
                </a>
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selectedId === c.id ? "bg-violet-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {c.customer?.name ?? "Anonymous"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {c.lastMessage?.content ?? "No messages"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {c.messageCount} messages · {c.channel} ·{" "}
                      {new Date(c.updatedAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
            {selectedId
              ? detailCustomer?.name ?? "Conversation"
              : "Select a conversation"}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[520px]">
            {!selectedId ? (
              <p className="text-sm text-gray-400 text-center mt-8">
                Click a conversation to view messages
              </p>
            ) : detailLoading ? (
              <p className="text-sm text-gray-500">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-400">No messages</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm max-w-[90%] ${
                    m.role === "CUSTOMER"
                      ? "bg-gray-100 text-gray-800 ml-0"
                      : m.role === "AGENT"
                        ? "bg-violet-100 text-violet-900 ml-auto"
                        : "bg-yellow-50 text-yellow-900 text-xs"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase opacity-60 mb-0.5">
                    {m.role}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] opacity-50 mt-1">
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
