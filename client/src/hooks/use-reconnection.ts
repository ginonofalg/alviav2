import { useState, useRef, useCallback } from "react";

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10_000;
export const RECONNECT_MAX_ATTEMPTS = 6;
const RECONNECT_JITTER_PCT = 0.2;
const CONNECTION_TIMEOUT_MS = 5000;

interface UseReconnectionOptions {
  wsRef: React.MutableRefObject<WebSocket | null>;
  connectWebSocketRef: React.MutableRefObject<(() => void) | null>;
  allowReconnectRef: React.MutableRefObject<boolean>;
  isUnmountingRef: React.MutableRefObject<boolean>;
}

export function useReconnection({
  wsRef,
  connectWebSocketRef,
  allowReconnectRef,
  isUnmountingRef,
}: UseReconnectionOptions) {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAbortedRef = useRef(false);
  const wasListeningBeforeDisconnectRef = useRef(false);
  const shouldAutoResumeRef = useRef(false);
  const isReconnectingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTokenRef = useRef(0);
  const isAttemptInFlightRef = useRef(false);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const stopReconnect = useCallback(() => {
    clearReconnectTimer();
    clearConnectionTimeout();
    setIsReconnecting(false);
    setReconnectAttempt(0);
    isReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    reconnectAbortedRef.current = true;
    isAttemptInFlightRef.current = false;
  }, [clearReconnectTimer, clearConnectionTimeout]);

  const scheduleReconnect = useCallback((attempt: number, token?: number) => {
    const activeToken = token ?? reconnectTokenRef.current;

    if (reconnectAbortedRef.current || !allowReconnectRef.current || isUnmountingRef.current) {
      console.log("[Interview] Reconnect aborted or not allowed");
      return;
    }

    if (activeToken !== reconnectTokenRef.current) {
      console.log(`[Interview] Ignoring stale reconnect request (token ${activeToken} vs current ${reconnectTokenRef.current})`);
      return;
    }

    if (attempt > RECONNECT_MAX_ATTEMPTS) {
      console.log("[Interview] Max reconnect attempts reached");
      setIsReconnecting(false);
      isReconnectingRef.current = false;
      reconnectAttemptRef.current = 0;
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const base = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
      RECONNECT_MAX_DELAY_MS
    );
    const jitter = base * RECONNECT_JITTER_PCT * (Math.random() * 2 - 1);
    const delay = Math.max(0, base + jitter);

    console.log(`[Interview] Scheduling reconnect attempt ${attempt} in ${Math.round(delay)}ms`);
    setReconnectAttempt(attempt);
    reconnectAttemptRef.current = attempt;

    reconnectTimeoutRef.current = setTimeout(() => {
      if (reconnectAbortedRef.current || !allowReconnectRef.current) return;
      if (activeToken !== reconnectTokenRef.current) return;
      if (isAttemptInFlightRef.current) {
        console.log("[Interview] Skipping reconnect - attempt already in flight");
        return;
      }

      console.log(`[Interview] Attempting reconnect #${attempt}`);
      isAttemptInFlightRef.current = true;

      connectionTimeoutRef.current = setTimeout(() => {
        if (activeToken !== reconnectTokenRef.current || !isReconnectingRef.current) return;
        console.log("[Interview] Connection attempt timed out");
        isAttemptInFlightRef.current = false;
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
          wsRef.current.close();
        }
        scheduleReconnect(attempt + 1, activeToken);
      }, CONNECTION_TIMEOUT_MS);

      try {
        connectWebSocketRef.current?.();
      } catch (err) {
        console.error("[Interview] connectWebSocket threw error:", err);
        isAttemptInFlightRef.current = false;
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        scheduleReconnect(attempt + 1, activeToken);
      }
    }, delay);
  }, [wsRef, allowReconnectRef, isUnmountingRef, connectWebSocketRef]);

  const startReconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectAbortedRef.current = false;
    setIsReconnecting(true);
    isReconnectingRef.current = true;
    reconnectTokenRef.current += 1;
    scheduleReconnect(1, reconnectTokenRef.current);
  }, [scheduleReconnect, clearReconnectTimer]);

  const onReconnectSuccess = useCallback(() => {
    clearReconnectTimer();
    clearConnectionTimeout();
    isAttemptInFlightRef.current = false;
    setIsReconnecting(false);
    setReconnectAttempt(0);
    isReconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
  }, [clearReconnectTimer, clearConnectionTimeout]);

  return {
    isReconnecting,
    reconnectAttempt,
    isReconnectingRef,
    reconnectAttemptRef,
    reconnectTokenRef,
    reconnectTimeoutRef,
    wasListeningBeforeDisconnectRef,
    shouldAutoResumeRef,
    isAttemptInFlightRef,
    clearReconnectTimer,
    clearConnectionTimeout,
    stopReconnect,
    scheduleReconnect,
    startReconnect,
    onReconnectSuccess,
  };
}
