"use client";

import { useState } from "react";

interface Email {
  id: number;
  sender: string;
  subject: string | null;
  status: string;
}

interface ExistingReply {
  id: number;
  ai_draft: string | null;
  sent_reply: string | null;
  sent_at: string | null;
}

type Stage =
  | "idle"
  | "drafting"
  | "draft_ready"
  | "sending"
  | "sent"
  | "feedback_done";

export default function ReplySection({
  email,
  existingReply,
}: {
  email: Email;
  existingReply: ExistingReply | null;
}) {
  const alreadySent = email.status === "sent" || !!existingReply?.sent_at;

  const [stage, setStage] = useState<Stage>(alreadySent ? "sent" : "idle");
  const [replyId, setReplyId] = useState<number | null>(
    existingReply?.id ?? null
  );
  const [draft, setDraft] = useState<string>(
    existingReply?.ai_draft ?? existingReply?.sent_reply ?? ""
  );
  const [error, setError] = useState<string | null>(null);

  // Feedback state
  const [starRating, setStarRating] = useState<number>(0);
  const [textFeedback, setTextFeedback] = useState<string>("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  async function generateDraft() {
    setStage("drafting");
    setError(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: email.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate draft");
      setReplyId(data.replyId);
      setDraft(data.draft);
      setStage("draft_ready");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function sendReply() {
    if (!replyId || !draft.trim()) return;
    setStage("sending");
    setError(null);
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyId,
          emailId: email.id,
          finalReply: draft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reply");
      setStage("sent");
    } catch (err) {
      setError((err as Error).message);
      setStage("draft_ready");
    }
  }

  async function submitFeedback() {
    if (!replyId || starRating === 0) return;
    setSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId, starRating, textFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit feedback");
      setStage("feedback_done");
    } catch (err) {
      setFeedbackError((err as Error).message);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  // ── Already sent — show sent reply + feedback form ─────────────────────────
  if (stage === "sent") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-700">
            Reply sent successfully.
          </p>
          {draft && (
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
              {draft}
            </pre>
          )}
        </div>

        {/* Feedback form */}
        <div className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">
            How was this AI draft?
          </h3>
          <StarPicker value={starRating} onChange={setStarRating} />
          <textarea
            value={textFeedback}
            onChange={(e) => setTextFeedback(e.target.value)}
            placeholder="Optional comments..."
            rows={3}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {feedbackError && (
            <p className="mt-2 text-xs text-red-500">{feedbackError}</p>
          )}
          <button
            onClick={submitFeedback}
            disabled={starRating === 0 || submittingFeedback}
            className="mt-3 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
          >
            {submittingFeedback ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    );
  }

  // ── Feedback submitted ─────────────────────────────────────────────────────
  if (stage === "feedback_done") {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        Reply sent and feedback recorded. Thank you!
      </div>
    );
  }

  // ── Idle or draft available ────────────────────────────────────────────────
  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {stage === "idle" && (
        <div className="rounded-xl border border-dashed bg-gray-50 p-6 text-center">
          <p className="mb-4 text-sm text-gray-500">
            Generate an AI-powered reply using the Vizuara course knowledge base.
          </p>
          <button
            onClick={generateDraft}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate AI Draft
          </button>
        </div>
      )}

      {stage === "drafting" && (
        <div className="rounded-xl border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500">
          <span className="animate-pulse">Generating draft...</span>
        </div>
      )}

      {(stage === "draft_ready" || stage === "sending") && (
        <div className="rounded-xl border bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">AI Draft</h3>
            <button
              onClick={generateDraft}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Regenerate
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={sendReply}
              disabled={stage === "sending" || !draft.trim()}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
            >
              {stage === "sending" ? "Sending..." : "Send Reply"}
            </button>
            <p className="text-xs text-gray-400">
              You are in full control — review before sending.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className={`text-2xl transition-colors ${
            star <= value ? "text-yellow-400" : "text-gray-300"
          } hover:text-yellow-400`}
          aria-label={`${star} star`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
