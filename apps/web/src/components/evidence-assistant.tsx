"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Bot, CornerDownLeft, Sparkles } from "lucide-react";
import type { Explanation, Ranking } from "@/lib/api/types";

type CityScore = Ranking["ranked"][number] | Ranking["unranked"][number];
type Message = {
  role: "assistant" | "user";
  text: string;
  evidence?: string[];
};

function groundedAnswer(
  question: string,
  score: CityScore | undefined,
  explanation: Explanation | undefined,
) {
  if (!score || !explanation) {
    return "This market's structured explanation is still loading. Try again when the evidence panel is ready.";
  }
  const q = question.toLowerCase();
  if (/risk|trade|weak|downside|concern|limitation/.test(q)) {
    return explanation.tradeoffs.length
      ? explanation.tradeoffs.join(" ")
      : "The current explanation reports no specific trade-offs. Review feature coverage and source evidence before drawing conclusions.";
  }
  if (/compare|similar|reference|familiar/.test(q)) {
    const matches = score.reference_matches
      .map(
        (match) =>
          `${match.reference_id} (${match.similarity.toFixed(1)} similarity)`,
      )
      .join(", ");
    return matches
      ? `The ranking response compares this metro with ${matches}. Similarity uses selected public features; it does not establish safety or deployment approval.`
      : "The ranking response has no reference match for this metro. Similarity is based on selected public features when a match exists.";
  }
  if (/score|rank|number|pillar|weight/.test(q)) {
    const scoreText = (value: number | null) =>
      value?.toFixed(1) ?? "unavailable";
    return `Expansion screening score: ${score.expansion_score?.toFixed(1) ?? "unavailable"}. ODD familiarity: ${scoreText(score.pillars.familiarity)}. Public infrastructure proxies: ${scoreText(score.pillars.readiness)}. Market opportunity: ${scoreText(score.pillars.opportunity)}. Scores come from the deterministic ranking response.`;
  }
  if (/opportun|market|demand|population/.test(q)) {
    const factors = score.factors
      .filter((factor) => factor.pillar === "opportunity")
      .map((factor) => factor.feature.replaceAll("_", " "))
      .slice(0, 4);
    const opportunity = score.pillars.opportunity?.toFixed(1) ?? "unavailable";
    return factors.length
      ? `The opportunity pillar is ${opportunity}. Its returned factors include ${factors.join(", ")}. These are screening proxies, not a local demand forecast.`
      : `The opportunity pillar is ${opportunity}. The response has no named opportunity factors to summarize.`;
  }
  return `${explanation.summary} ${explanation.advantages.join(" ")}`.trim();
}

export default function EvidenceAssistant({
  cityName,
  score,
  explanation,
  loading,
  error,
  onEvidenceClick,
}: {
  cityName: string;
  score: CityScore | undefined;
  explanation: Explanation | undefined;
  loading: boolean;
  error: string;
  onEvidenceClick: (id: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    setQuestion("");
    setMessages([]);
  }, [cityName]);

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      {
        role: "assistant",
        text: groundedAnswer(trimmed, score, explanation),
        evidence: explanation?.evidence_ids ?? [],
      },
    ]);
    setQuestion("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(question);
  }

  return (
    <aside className="panel evidence-assistant" aria-label="Evidence assistant">
      <div className="assistant-topline">
        <span className="assistant-icon">
          <Sparkles size={16} />
        </span>
        <span className="assistant-state">GROUNDED IN RANKING OUTPUT</span>
        {explanation && (
          <span className="assistant-mode">{explanation.mode}</span>
        )}
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
        Answers use this city&apos;s structured scores, factors, and
        explanation. P0 does not use a free-form AI model.
      </p>
      {error && (
        <p className="assistant-error" role="status">
          {error}
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
            <span className="assistant-speaker">ODDyssey analyst</span>
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
                {message.role === "user" ? "You" : "ODDyssey analyst"}
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
      </div>
      <div className="assistant-prompts" aria-label="Suggested questions">
        {[
          "Why this score?",
          "What are the trade-offs?",
          "How does it compare?",
        ].map((prompt) => (
          <button
            type="button"
            key={prompt}
            onClick={() => ask(prompt)}
            disabled={loading || !explanation}
          >
            {prompt}
          </button>
        ))}
      </div>
      <form className="assistant-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="analyst-question">
          Ask a question about this market
        </label>
        <input
          id="analyst-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this market…"
          disabled={loading || !explanation}
        />
        <button
          type="submit"
          aria-label="Send question"
          disabled={loading || !explanation || !question.trim()}
        >
          <CornerDownLeft size={15} />
        </button>
      </form>
      <p className="assistant-footnote">
        Scores remain deterministic. This panel explains returned evidence; it
        does not assess deployment safety.
      </p>
    </aside>
  );
}
