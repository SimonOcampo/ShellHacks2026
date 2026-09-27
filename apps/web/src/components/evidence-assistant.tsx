"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, CornerDownLeft, Sparkles } from "lucide-react";
import { api, fixtureMode } from "@/lib/api/client";
import type { Ranking } from "@/lib/api/types";

type CityScore = Ranking["ranked"][number] | Ranking["unranked"][number];
type Message = {
  role: "assistant" | "user";
  text: string;
  evidence?: string[];
  mode?: "gemini" | "template";
};

export default function EvidenceAssistant({
  cityId,
  cityName,
  score,
  ranking,
  explanation,
  loading,
  error,
  onEvidenceClick,
}: {
  cityId: string;
  cityName: string;
  score: CityScore | undefined;
  ranking: Ranking | undefined;
  explanation: import("@/lib/api/types").Explanation | undefined;
  loading: boolean;
  error: string;
  onEvidenceClick: (id: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setQuestion("");
    setMessages([]);
    setPending(false);
    setChatError("");
    return () => {
      controller.current?.abort();
    };
  }, [cityId]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !cityId || !ranking || pending || fixtureMode) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setChatError("");
    try {
      const result = await api.chat(
        cityId,
        {
          question: trimmed,
          history: messages.slice(-8).map(({ role, text: messageText }) => ({
            role,
            text: messageText,
          })),
          ranking: {
            weights: ranking.normalized_weights,
            reference_ids: ranking.reference_ids,
          },
        },
        active.signal,
      );
      if (!active.signal.aborted) {
        setMessages((current) => [
          ...current,
          { role: "user", text: trimmed },
          {
            role: "assistant",
            text: result.answer,
            evidence: result.evidence_ids,
            mode: result.mode,
          },
        ]);
        setQuestion("");
      }
    } catch (cause) {
      if (!active.signal.aborted) {
        setChatError(
          cause instanceof Error ? cause.message : "Analyst request failed.",
        );
      }
    } finally {
      if (!active.signal.aborted) setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  const canAsk = !!cityId && !!score && !!ranking && !!explanation && !loading;

  return (
    <aside className="panel evidence-assistant" aria-label="Evidence assistant">
      <div className="assistant-topline">
        <span className="assistant-icon">
          <Sparkles size={16} />
        </span>
        <span className="assistant-state">EVIDENCE-GROUNDED CHAT</span>
        <span className="assistant-mode">
          {fixtureMode
            ? "fixtures only"
            : (messages.filter((message) => message.mode).at(-1)?.mode ??
              explanation?.mode ??
              "analyst")}
        </span>
      </div>
      <div className="assistant-title">
        <div>
          <span className="eyebrow">
            <Bot size={13} /> MARKET ANALYST
          </span>
          <h2>Ask about {cityName}</h2>
        </div>
      </div>
      <p className="assistant-disclosure">
        Gemini answers from this city&apos;s backend ranking and source evidence.
        If Gemini is not configured or fails, ODD Scout returns its deterministic
        evidence summary.
      </p>
      {error && (
        <p className="assistant-error" role="status">
          {error}
        </p>
      )}
      {chatError && (
        <p className="assistant-error" role="alert">
          {chatError}
        </p>
      )}
      <div
        className="assistant-thread"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <article className="assistant-message assistant-reply">
          <span className="assistant-avatar">
            <Sparkles size={13} />
          </span>
          <div>
            <span className="assistant-speaker">ODD Scout analyst</span>
            <p>
              {loading
                ? "Loading the city evidence…"
                : (explanation?.summary ??
                  "Select a market to load its evidence summary.")}
            </p>
            {explanation?.advantages.slice(0, 2).map((advantage) => (
              <p className="assistant-bullet" key={advantage}>
                {advantage}
              </p>
            ))}
          </div>
        </article>
        {messages.map((message, index) => (
          <article
            className={`assistant-message ${message.role === "user" ? "assistant-question" : "assistant-reply"}`}
            key={`${message.role}-${index}`}
          >
            {message.role === "assistant" && (
              <span className="assistant-avatar">
                <Sparkles size={13} />
              </span>
            )}
            <div>
              <span className="assistant-speaker">
                {message.role === "user"
                  ? "You"
                  : `ODD Scout analyst${message.mode ? ` · ${message.mode}` : ""}`}
              </span>
              <p>{message.text}</p>
              {message.evidence?.length ? (
                <div className="assistant-citations">
                  <span>Sources</span>
                  {message.evidence.slice(0, 3).map((id) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => onEvidenceClick(id)}
                    >
                      {id} <ArrowUpRight size={11} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {pending && (
          <p className="assistant-pending" role="status">
            Checking ranking evidence…
          </p>
        )}
      </div>
      <div className="assistant-prompts" aria-label="Suggested questions">
        {["Why this score?", "What are the trade-offs?", "How does it compare?"].map(
          (prompt) => (
            <button
              type="button"
              key={prompt}
              onClick={() => void ask(prompt)}
              disabled={!canAsk || pending || fixtureMode}
            >
              {prompt}
            </button>
          ),
        )}
      </div>
      {fixtureMode && (
        <p className="assistant-footnote">
          Switch to HTTP transport and run the backend to use analyst chat.
        </p>
      )}
      <form className="assistant-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="analyst-question">
          Ask a question about this market
        </label>
        <input
          id="analyst-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this market…"
          maxLength={1200}
          disabled={!canAsk || pending || fixtureMode}
        />
        <button
          type="submit"
          aria-label="Send question"
          disabled={!canAsk || pending || fixtureMode || !question.trim()}
        >
          <CornerDownLeft size={15} />
        </button>
      </form>
      <p className="assistant-footnote">
        Ranking scores remain deterministic. Chat explains returned evidence;
        it does not assess deployment safety.
      </p>
    </aside>
  );
}
