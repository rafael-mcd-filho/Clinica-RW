"use client";

type ClientErrorPayload = {
  digest?: string;
  message: string;
  source: string;
};

export function reportClientError(payload: ClientErrorPayload) {
  try {
    void fetch("/api/observability/client-error", {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Observability must never interrupt the user flow.
  }
}
