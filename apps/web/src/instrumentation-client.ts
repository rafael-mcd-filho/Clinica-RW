import { reportClientError } from "@/lib/observability/client";

window.addEventListener("error", (event) => {
  reportClientError({
    message: event.message || "Unhandled browser error",
    source: "window.error",
  });
});

window.addEventListener("unhandledrejection", () => {
  reportClientError({
    message: "Unhandled browser promise rejection",
    source: "window.unhandledrejection",
  });
});
