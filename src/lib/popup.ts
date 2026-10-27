import { useEffect } from "react";

/** Opens an app route as a full page in a new browser tab (used for "new window" forms). */
export function openWindow(path: string, name: string, _width?: number, _height?: number) {
  if (typeof window === "undefined") return;
  const win = window.open(path, name || "_blank");
  win?.focus();
}

export const REFRESH_MESSAGE = "exam-branch:refresh";

/** Called from inside a popup window after a successful save. */
export function notifyOpenerAndClose() {
  if (typeof window === "undefined") return;
  try {
    window.opener?.postMessage(REFRESH_MESSAGE, "*");
  } catch {
    /* opener may be gone */
  }
  window.close();
}

/** Parent-window hook: re-runs `onRefresh` whenever a popup reports a save. */
export function usePopupRefresh(onRefresh: () => void) {
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (event.data === REFRESH_MESSAGE) onRefresh();
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onRefresh]);
}
