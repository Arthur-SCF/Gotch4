import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";

interface WSMessage {
  type: string;
  events?: any[];
  event?: any;
  count?: number;
  key?: string;
  data?: any;
}

export function useEventSSE(
  enabled: boolean,
  onNewEvent: (event: any) => void,
  onNewEzCapture?: (data?: any) => void,
  onNewGrab?: (key: string, data: any) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const wsUrl = API_URL.replace(/^https/, "wss").replace(/^http/, "ws");

    async function connect() {
      if (destroyed) return;
      const { getAccessToken } = await import("@/lib/auth");
      const token = await getAccessToken();
      if (!token) {
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
        return;
      }
      const ws = new WebSocket(`${wsUrl}/api/ws/events?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);

          if (data.type === "new_events" && data.events) {
            data.events.forEach((evt) => onNewEvent(evt));
          } else if (data.type === "new_event" && data.event) {
            onNewEvent(data.event);
          } else if (data.type === "ez" && onNewEzCapture) {
            onNewEzCapture(data.data);
          } else if (data.type === "grab" && onNewGrab && data.key != null) {
            onNewGrab(data.key, data.data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        wsRef.current = null;
        if (!destroyed) reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, onNewEvent, onNewEzCapture, onNewGrab]);

  return {
    connected: wsRef.current !== null && wsRef.current.readyState === WebSocket.OPEN,
  };
}
