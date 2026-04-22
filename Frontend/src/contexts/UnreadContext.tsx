import { createContext, useContext, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { API_URL } from "@/lib/config";

interface UnreadState {
  events: number;
  ez: number;
  grab: number;
}

interface UnreadContextValue {
  unread: UnreadState;
  clearEvents: () => void;
  clearEz: () => void;
  clearGrab: () => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unread: { events: 0, ez: 0, grab: 0 },
  clearEvents: () => {},
  clearEz: () => {},
  clearGrab: () => {},
});

export function useUnread() {
  return useContext(UnreadContext);
}

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState<UnreadState>({ events: 0, ez: 0, grab: 0 });

  // Watch route changes and auto-clear the matching page's counter
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname === "/security/events") setUnread((p) => ({ ...p, events: 0 }));
    if (pathname === "/security/ezxss") setUnread((p) => ({ ...p, ez: 0 }));
    if (pathname === "/security/grab") setUnread((p) => ({ ...p, grab: 0 }));
  }, [pathname]);

  const clearEvents = () => setUnread((p) => ({ ...p, events: 0 }));
  const clearEz = () => setUnread((p) => ({ ...p, ez: 0 }));
  const clearGrab = () => setUnread((p) => ({ ...p, grab: 0 }));

  // Single shared WebSocket — only used for badge counting, never for display data
  useEffect(() => {
    let destroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    async function connect() {
      if (destroyed) return;
      const { getAccessToken } = await import("@/lib/auth");
      const token = await getAccessToken();
      if (!token) {
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
        return;
      }
      const wsUrl = API_URL.replace(/^https/, "wss").replace(/^http/, "ws");
      ws = new WebSocket(`${wsUrl}/api/ws/events?token=${token}`);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          // new_event (singular, immediate) — fired by webhook/DNS handlers right after DB write
          if (msg.type === "new_event") {
            if (window.location.pathname !== "/security/events") {
              setUnread((p) => ({ ...p, events: p.events + 1 }));
            }
          }
          if (msg.type === "ez") {
            if (window.location.pathname !== "/security/ezxss") {
              setUnread((p) => ({ ...p, ez: p.ez + 1 }));
            }
          }
          if (msg.type === "grab") {
            if (window.location.pathname !== "/security/grab") {
              setUnread((p) => ({ ...p, grab: p.grab + 1 }));
            }
          }
        } catch {}
      };

      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  return (
    <UnreadContext.Provider value={{ unread, clearEvents, clearEz, clearGrab }}>
      {children}
    </UnreadContext.Provider>
  );
}
