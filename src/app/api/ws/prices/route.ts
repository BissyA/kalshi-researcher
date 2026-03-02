import { NextRequest } from "next/server";
import WebSocket from "ws";
import { getKalshiWsHeaders, KALSHI_WS_URL } from "@/lib/kalshi-client";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const KEEPALIVE_INTERVAL = 30000;

export async function GET(request: NextRequest) {
  const tickersParam = request.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return new Response("Missing tickers query parameter", { status: 400 });
  }

  const tickers = tickersParam.split(",").filter(Boolean);
  if (tickers.length === 0) {
    return new Response("No valid tickers provided", { status: 400 });
  }

  let kalshiWs: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  let isCancelled = false;

  // Listen for client disconnect
  request.signal.addEventListener("abort", () => {
    isCancelled = true;
    clearTimeout(reconnectTimer);
    clearInterval(keepaliveTimer);
    if (kalshiWs) {
      kalshiWs.removeAllListeners();
      if (
        kalshiWs.readyState === WebSocket.OPEN ||
        kalshiWs.readyState === WebSocket.CONNECTING
      ) {
        kalshiWs.close();
      }
      kalshiWs = null;
    }
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function sendEvent(eventType: string, data: unknown) {
        if (isCancelled) return;
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may be closed
        }
      }

      function connectKalshi() {
        if (isCancelled) return;

        try {
          const headers = getKalshiWsHeaders();
          kalshiWs = new WebSocket(KALSHI_WS_URL, { headers });
        } catch (err) {
          sendEvent("error", { message: "Failed to create WebSocket: " + String(err) });
          scheduleReconnect();
          return;
        }

        kalshiWs.on("open", () => {
          if (isCancelled) {
            kalshiWs?.close();
            return;
          }
          reconnectAttempt = 0;
          sendEvent("status", { connected: true });

          const subscribeMsg = {
            id: 1,
            cmd: "subscribe",
            params: {
              channels: ["ticker"],
              market_tickers: tickers,
            },
          };
          kalshiWs!.send(JSON.stringify(subscribeMsg));
        });

        kalshiWs.on("message", (raw: Buffer | string) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(raw.toString());

            if (data.type === "ticker" && data.msg) {
              sendEvent("ticker", data.msg);
            } else if (data.type === "error" && data.msg) {
              sendEvent("error", { code: data.msg.code, message: data.msg.msg });
            }
          } catch {
            // Malformed JSON — ignore
          }
        });

        kalshiWs.on("error", () => {
          if (isCancelled) return;
          sendEvent("error", { message: "Kalshi WebSocket error" });
        });

        kalshiWs.on("close", () => {
          if (isCancelled) return;
          sendEvent("status", { connected: false });
          scheduleReconnect();
        });
      }

      function scheduleReconnect() {
        if (isCancelled) return;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt),
          MAX_RECONNECT_DELAY
        );
        reconnectAttempt++;
        reconnectTimer = setTimeout(connectKalshi, delay);
      }

      // SSE keepalive to prevent proxy/browser timeouts
      keepaliveTimer = setInterval(() => {
        if (isCancelled) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // stream closed
        }
      }, KEEPALIVE_INTERVAL);

      connectKalshi();
    },

    cancel() {
      isCancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(keepaliveTimer);
      if (kalshiWs) {
        kalshiWs.removeAllListeners();
        if (
          kalshiWs.readyState === WebSocket.OPEN ||
          kalshiWs.readyState === WebSocket.CONNECTING
        ) {
          kalshiWs.close();
        }
        kalshiWs = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
