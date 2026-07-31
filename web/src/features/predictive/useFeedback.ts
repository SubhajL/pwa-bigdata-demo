/**
 * Submits a technician's verdict and holds the persisted ack (PR-9, item 3.4).
 *
 * An action hook, not a poll: `submit` POSTs once and reflects the outcome as `ack` (proof the
 * row was stored) or `error`. A 404 (unknown asset) surfaces the API's `detail` inline rather
 * than throwing — the panel shows why, and the ingest/DLQ story is that a bad id is refused.
 */
import { useCallback, useState } from "react";

import { ApiError } from "@/api/client";

import { submitFeedback } from "./predictiveClient";
import type { FeedbackAck, FeedbackRequest } from "./types";

export interface UseFeedbackResult {
  readonly ack: FeedbackAck | null;
  readonly submitting: boolean;
  readonly error: string | null;
  readonly submit: (req: FeedbackRequest) => Promise<void>;
}

export function useFeedback(): UseFeedbackResult {
  const [ack, setAck] = useState<FeedbackAck | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (req: FeedbackRequest): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      setAck(await submitFeedback(req));
    } catch (e) {
      setAck(null);
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { ack, submitting, error, submit };
}
