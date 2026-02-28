import WebSocket from "ws";
import {
  type InterviewState,
  safeSend,
  WS_CLOSE_CODE_REFRESH,
} from "./types";

const REFRESH_CLIENT_CLOSE_DELAY_MS = 100;
const FLUSH_PERSIST_TIMEOUT_MS = 2000;

export interface RefreshDependencies {
  getState: (sessionId: string) => InterviewState | undefined;
  flushPersist: (sessionId: string) => Promise<void>;
}

export async function refreshConnection(
  sessionId: string,
  deps: RefreshDependencies,
): Promise<void> {
  const state = deps.getState(sessionId);
  if (!state || !state.clientWs || state.isConnectionRefresh) {
    return;
  }

  console.log(
    `[ConnectionRefresh] Initiating planned refresh for session: ${sessionId}`,
  );

  state.isConnectionRefresh = true;
  state.needsConnectionRefresh = false;
  state.pendingRefreshAfterTranscript = false;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      deps.flushPersist(sessionId).then(() => {
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      }),
      new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timeoutHandle = null;
          console.warn(
            `[ConnectionRefresh] flushPersist timed out for ${sessionId}, proceeding with refresh`,
          );
          resolve();
        }, FLUSH_PERSIST_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error(
      `[ConnectionRefresh] flushPersist failed for ${sessionId}:`,
      error,
    );
  }

  safeSend(
    state.clientWs,
    { type: "connection_refresh" },
    `connection_refresh ${sessionId}`,
  );

  if (state.providerWs) {
    state.providerWs.removeAllListeners();
    if (state.providerWs.readyState === WebSocket.OPEN) {
      state.providerWs.close();
    }
    state.providerWs = null;
  }

  state.responseInProgress = false;
  state.responseStartedAt = null;

  const clientWs = state.clientWs;
  setTimeout(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      state.clientDisconnectedAt = Date.now();
      clientWs.close(WS_CLOSE_CODE_REFRESH, "Planned connection refresh");
    }
  }, REFRESH_CLIENT_CLOSE_DELAY_MS);
}
