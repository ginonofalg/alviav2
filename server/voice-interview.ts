import WebSocket from "ws";
import type { IncomingMessage } from "http";
import { storage, type InterviewStatePatch } from "./storage";
import {
  analyzeWithBarbara,
  analyzeTopicOverlap,
  createEmptyMetrics,
  generateQuestionSummary,
  type TranscriptEntry,
  type QuestionMetrics,
  type BarbaraGuidance,
  type QuestionSummary,
  type TopicOverlapResult,
} from "./barbara-orchestrator";
import type { 
  PersistedTranscriptEntry, 
  PersistedBarbaraGuidance, 
  PersistedQuestionState,
  QuestionSummary as PersistedQuestionSummary,
} from "@shared/schema";

// the newest OpenAI model is "gpt-realtime" for realtime voice conversations
const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini";

interface InterviewState {
  sessionId: string;
  currentQuestionIndex: number;
  questions: any[];
  template: any;
  openaiWs: WebSocket | null;
  clientWs: WebSocket | null;
  isConnected: boolean;
  lastAIPrompt: string;
  isPaused: boolean;
  // Barbara-related state
  transcriptLog: TranscriptEntry[]; // Limited to MAX_TRANSCRIPT_IN_MEMORY for processing
  questionMetrics: Map<number, QuestionMetrics>;
  speakingStartTime: number | null;
  barbaraGuidanceQueue: BarbaraGuidance[];
  isWaitingForBarbara: boolean;
  isBarbaraGuidanceUpdate: boolean;
  isInitialSession: boolean;
  // Persistence state
  fullTranscriptForPersistence: PersistedTranscriptEntry[]; // Complete transcript history - never truncated
  lastBarbaraGuidance: PersistedBarbaraGuidance | null;
  questionStates: PersistedQuestionState[];
  questionSummaries: QuestionSummary[]; // Index-based: questionSummaries[questionIndex] = summary
  pendingPersistTimeout: ReturnType<typeof setTimeout> | null;
  lastPersistAt: number;
  isRestoredSession: boolean;
  // Race condition fix: wait for session.updated before triggering response.create
  // Version-based approach: only the latest transition is "active", earlier ones are cancelled
  questionTransitionVersion: number;
  pendingTransition: { version: number; questionIndex: number } | null;
}

const PERSIST_DEBOUNCE_MS = 2000;
const MAX_TRANSCRIPT_IN_MEMORY = 100;

const interviewStates = new Map<string, InterviewState>();

function addTranscriptEntry(state: InterviewState, entry: TranscriptEntry): void {
  // Add to full persistence buffer (never truncated)
  state.fullTranscriptForPersistence.push(entry as PersistedTranscriptEntry);
  
  // Add to in-memory log (limited to MAX_TRANSCRIPT_IN_MEMORY for processing)
  state.transcriptLog.push(entry);
  if (state.transcriptLog.length > MAX_TRANSCRIPT_IN_MEMORY) {
    state.transcriptLog = state.transcriptLog.slice(-MAX_TRANSCRIPT_IN_MEMORY);
  }
}

function scheduleDebouncedPersist(sessionId: string): void {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  if (state.pendingPersistTimeout) {
    clearTimeout(state.pendingPersistTimeout);
  }

  state.pendingPersistTimeout = setTimeout(() => {
    flushPersist(sessionId);
  }, PERSIST_DEBOUNCE_MS);
}

async function flushPersist(sessionId: string): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  if (state.pendingPersistTimeout) {
    clearTimeout(state.pendingPersistTimeout);
    state.pendingPersistTimeout = null;
  }

  // Use fullTranscriptForPersistence to avoid data loss from in-memory truncation
  const patch: InterviewStatePatch = {
    liveTranscript: state.fullTranscriptForPersistence,
    lastBarbaraGuidance: state.lastBarbaraGuidance,
    questionStates: state.questionStates,
    questionSummaries: state.questionSummaries,
    currentQuestionIndex: state.currentQuestionIndex,
  };

  try {
    await storage.persistInterviewState(sessionId, patch);
    state.lastPersistAt = Date.now();
    console.log(`[Persist] State saved for session: ${sessionId}, transcript entries: ${state.fullTranscriptForPersistence.length}`);
  } catch (error) {
    console.error(`[Persist] Error saving state for ${sessionId}:`, error);
  }
}

async function persistBarbaraGuidance(sessionId: string, guidance: BarbaraGuidance): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const persistedGuidance: PersistedBarbaraGuidance = {
    action: guidance.action,
    message: guidance.message,
    confidence: guidance.confidence,
    timestamp: Date.now(),
    questionIndex: state.currentQuestionIndex,
  };

  state.lastBarbaraGuidance = persistedGuidance;

  if (guidance.action === "suggest_next_question") {
    const questionState = state.questionStates.find(qs => qs.questionIndex === state.currentQuestionIndex);
    if (questionState) {
      questionState.barbaraSuggestedMoveOn = true;
    }
  }

  try {
    // Persist with all relevant fields to avoid overwriting concurrent summary persistence
    await storage.persistInterviewState(sessionId, {
      lastBarbaraGuidance: persistedGuidance,
      questionStates: state.questionStates,
      questionSummaries: state.questionSummaries,
    });
    console.log(`[Persist] Barbara guidance saved for session: ${sessionId}`);
  } catch (error) {
    console.error(`[Persist] Error saving Barbara guidance for ${sessionId}:`, error);
  }
}

function updateQuestionState(state: InterviewState, questionIndex: number, updates: Partial<PersistedQuestionState>): void {
  let questionState = state.questionStates.find(qs => qs.questionIndex === questionIndex);
  
  if (!questionState) {
    const metrics = state.questionMetrics.get(questionIndex) || createEmptyMetrics(questionIndex);
    questionState = {
      questionIndex,
      status: "not_started",
      barbaraSuggestedMoveOn: false,
      wordCount: metrics.wordCount,
      activeTimeMs: metrics.activeTimeMs,
      turnCount: metrics.turnCount,
    };
    state.questionStates.push(questionState);
  }

  Object.assign(questionState, updates);

  const metrics = state.questionMetrics.get(questionIndex);
  if (metrics) {
    questionState.wordCount = metrics.wordCount;
    questionState.activeTimeMs = metrics.activeTimeMs;
    questionState.turnCount = metrics.turnCount;
  }
}

async function persistNextQuestion(sessionId: string, previousIndex: number, newIndex: number): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  updateQuestionState(state, previousIndex, { status: "answered" });
  updateQuestionState(state, newIndex, { status: "in_progress" });

  await flushPersist(sessionId);
}

async function generateAndPersistSummary(
  sessionId: string,
  questionIndex: number,
): Promise<void> {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const question = state.questions[questionIndex];
  if (!question) return;

  // Check if summary already exists for this question (prevent duplicates)
  if (state.questionSummaries[questionIndex]) {
    console.log(`[Summary] Summary already exists for Q${questionIndex + 1}, skipping`);
    return;
  }

  try {
    const metrics = state.questionMetrics.get(questionIndex) || createEmptyMetrics(questionIndex);

    console.log(`[Summary] Generating summary for Q${questionIndex + 1} (session: ${sessionId}) in background...`);

    const summary = await generateQuestionSummary(
      questionIndex,
      question.questionText,
      question.guidance || "",
      state.fullTranscriptForPersistence as TranscriptEntry[],
      metrics,
      state.template?.objective || "",
    );

    // Use index-based assignment to prevent race conditions
    state.questionSummaries[questionIndex] = summary;
    console.log(`[Summary] Summary completed for Q${questionIndex + 1}: "${summary.respondentSummary.substring(0, 100)}..."`);

    // Persist immediately with all relevant fields to avoid overwriting concurrent Barbara guidance
    await storage.persistInterviewState(sessionId, {
      questionSummaries: state.questionSummaries,
      lastBarbaraGuidance: state.lastBarbaraGuidance,
      questionStates: state.questionStates,
    });
    console.log(`[Summary] Summary persisted for Q${questionIndex + 1}`);
  } catch (error) {
    console.error(`[Summary] Failed to generate summary for Q${questionIndex + 1}:`, error);
    // Fail silently - doesn't affect interview progress
  }
}

export function handleVoiceInterview(
  clientWs: WebSocket,
  req: IncomingMessage,
) {
  // Extract session ID from query string: /ws/interview?sessionId=xxx
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    clientWs.close(1008, "Session ID required");
    return;
  }

  // Check for concurrent tab - reject if session already has an active connection
  const existingState = interviewStates.get(sessionId);
  if (existingState && existingState.clientWs && existingState.clientWs.readyState === WebSocket.OPEN) {
    console.log(`[VoiceInterview] Rejecting concurrent connection for session: ${sessionId}`);
    clientWs.send(JSON.stringify({ 
      type: "error", 
      code: "SESSION_ACTIVE_ELSEWHERE",
      message: "This interview is already active in another tab or window" 
    }));
    clientWs.close(1008, "Session active elsewhere");
    return;
  }

  console.log(`[VoiceInterview] New connection for session: ${sessionId}`);

  // Initialize interview state
  const state: InterviewState = {
    sessionId,
    currentQuestionIndex: 0,
    questions: [],
    template: null,
    openaiWs: null,
    clientWs: clientWs,
    isConnected: false,
    lastAIPrompt: "",
    isPaused: false,
    // Barbara-related state
    transcriptLog: [],
    questionMetrics: new Map(),
    speakingStartTime: null,
    barbaraGuidanceQueue: [],
    isWaitingForBarbara: false,
    isBarbaraGuidanceUpdate: false,
    isInitialSession: true,
    // Persistence state
    fullTranscriptForPersistence: [], // Complete transcript history - never truncated
    lastBarbaraGuidance: null,
    questionStates: [],
    questionSummaries: [], // Index-based array for question summaries
    pendingPersistTimeout: null,
    lastPersistAt: 0,
    isRestoredSession: false,
    questionTransitionVersion: 0,
    pendingTransition: null,
  };
  interviewStates.set(sessionId, state);

  // Load interview data and connect to OpenAI
  initializeInterview(sessionId, clientWs);

  // Handle messages from client
  clientWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(sessionId, message, clientWs);
    } catch (error) {
      console.error("[VoiceInterview] Error parsing client message:", error);
    }
  });

  clientWs.on("close", () => {
    console.log(`[VoiceInterview] Client disconnected: ${sessionId}`);
    cleanupSession(sessionId);
  });

  clientWs.on("error", (error) => {
    console.error(`[VoiceInterview] Client error for ${sessionId}:`, error);
    cleanupSession(sessionId);
  });
}

async function initializeInterview(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  try {
    // Load session data
    const session = await storage.getSession(sessionId);
    if (!session) {
      clientWs.send(
        JSON.stringify({ type: "error", message: "Session not found" }),
      );
      clientWs.close();
      return;
    }

    const collection = await storage.getCollection(session.collectionId);
    if (!collection) {
      clientWs.send(
        JSON.stringify({ type: "error", message: "Collection not found" }),
      );
      clientWs.close();
      return;
    }

    const template = await storage.getTemplate(collection.templateId);
    const questions = await storage.getQuestionsByTemplate(
      collection.templateId,
    );

    state.template = template;
    state.questions = questions;
    state.currentQuestionIndex = session.currentQuestionIndex || 0;

    // Restore persisted state if available
    const hasPersistedState = session.liveTranscript && Array.isArray(session.liveTranscript) && session.liveTranscript.length > 0;
    
    if (hasPersistedState) {
      console.log(`[VoiceInterview] Restoring persisted state for session: ${sessionId}`);
      state.isRestoredSession = true;
      
      // Restore FULL transcript to persistence buffer (never truncated - prevents data loss)
      const persistedTranscript = session.liveTranscript as PersistedTranscriptEntry[];
      state.fullTranscriptForPersistence = [...persistedTranscript];
      
      // Only keep last MAX_TRANSCRIPT_IN_MEMORY entries in memory for processing
      state.transcriptLog = persistedTranscript.slice(-MAX_TRANSCRIPT_IN_MEMORY) as TranscriptEntry[];
      
      // Restore Barbara guidance
      if (session.lastBarbaraGuidance) {
        state.lastBarbaraGuidance = session.lastBarbaraGuidance as PersistedBarbaraGuidance;
      }
      
      // Restore question states
      if (session.questionStates && Array.isArray(session.questionStates)) {
        state.questionStates = session.questionStates as PersistedQuestionState[];
        
        // Rebuild questionMetrics from persisted states
        for (const qs of state.questionStates) {
          state.questionMetrics.set(qs.questionIndex, {
            questionIndex: qs.questionIndex,
            wordCount: qs.wordCount,
            activeTimeMs: qs.activeTimeMs,
            turnCount: qs.turnCount,
            startedAt: null,
          });
        }
      }
      
      // Restore question summaries (index-based array)
      if (session.questionSummaries && Array.isArray(session.questionSummaries)) {
        state.questionSummaries = session.questionSummaries as QuestionSummary[];
        console.log(`[VoiceInterview] Restored ${state.questionSummaries.length} question summaries`);
      }
      
      console.log(`[VoiceInterview] Restored ${state.fullTranscriptForPersistence.length} transcript entries (${state.transcriptLog.length} in memory), question ${state.currentQuestionIndex + 1}/${questions.length}`);
    } else {
      // Initialize metrics for first question (new session)
      state.questionMetrics.set(0, createEmptyMetrics(0));
      updateQuestionState(state, 0, { status: "in_progress" });
    }

    // Connect to OpenAI Realtime API
    connectToOpenAI(sessionId, clientWs);
  } catch (error) {
    console.error("[VoiceInterview] Error initializing:", error);
    clientWs.send(
      JSON.stringify({
        type: "error",
        message: "Failed to initialize interview",
      }),
    );
  }
}

function connectToOpenAI(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: "error",
        message: "OpenAI API key not configured",
      }),
    );
    return;
  }

  console.log(
    `[VoiceInterview] Connecting to OpenAI for session: ${sessionId}`,
  );

  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  state.openaiWs = openaiWs;

  openaiWs.on("open", () => {
    console.log(
      `[VoiceInterview] Connected to OpenAI for session: ${sessionId}`,
    );
    state.isConnected = true;

    // Configure the session
    const currentQuestion = state.questions[state.currentQuestionIndex];
    
    // Use resume instructions if restoring a session with transcript history
    let instructions: string;
    if (state.isRestoredSession && state.transcriptLog.length > 0) {
      instructions = buildResumeInstructions(state);
      console.log(`[VoiceInterview] Using resume instructions for restored session: ${sessionId}`);
    } else {
      instructions = buildInterviewInstructions(
        state.template,
        currentQuestion,
        state.currentQuestionIndex,
        state.questions.length,
      );
    }

    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: instructions,
          voice: "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_noise_reduction: {
            type: "near_field",
          },
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: false,
            interrupt_response: true,
          },
        },
      }),
    );

    // Notify client that connection is ready
    clientWs.send(
      JSON.stringify({
        type: "connected",
        sessionId,
        questionIndex: state.currentQuestionIndex,
        totalQuestions: state.questions.length,
        currentQuestion: currentQuestion?.questionText,
        isResumed: state.isRestoredSession,
        persistedTranscript: state.isRestoredSession ? state.fullTranscriptForPersistence : undefined,
      }),
    );
  });

  openaiWs.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleOpenAIEvent(sessionId, event, clientWs);
    } catch (error) {
      console.error("[VoiceInterview] Error parsing OpenAI message:", error);
    }
  });

  openaiWs.on("close", () => {
    console.log(
      `[VoiceInterview] OpenAI connection closed for session: ${sessionId}`,
    );
    state.isConnected = false;
    clientWs.send(JSON.stringify({ type: "disconnected" }));
  });

  openaiWs.on("error", (error) => {
    console.error(`[VoiceInterview] OpenAI error for ${sessionId}:`, error);
    clientWs.send(
      JSON.stringify({ type: "error", message: "Voice service error" }),
    );
  });
}

function buildInterviewInstructions(
  template: any,
  currentQuestion: any,
  questionIndex: number,
  totalQuestions: number,
  barbaraGuidance?: string,
  topicOverlap?: TopicOverlapResult,
): string {
  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  const guidance = currentQuestion?.guidance || "";

  // Determine how to introduce the question based on topic overlap
  let questionIntro: string;
  if (questionIndex === 0) {
    questionIntro = `Start with a warm greeting and briefly explain the interview purpose: "${objective}". Then ask the first question.`;
  } else if (topicOverlap?.hasOverlap && topicOverlap.suggestedIntro) {
    questionIntro = `IMPORTANT: The respondent has already touched on this topic earlier. ${topicOverlap.suggestedIntro} Ask if they'd like to elaborate further on this, rather than asking the question as if it's completely new.`;
  } else {
    questionIntro = "Ask the current question naturally.";
  }

  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

CURRENT QUESTION TO ASK:
"${currentQuestion?.questionText || "Please share your thoughts."}"

GUIDANCE FOR THIS QUESTION:
${guidance || "Listen carefully and probe for more details when appropriate."}`;

  // Add topic overlap context if detected
  if (topicOverlap?.hasOverlap && topicOverlap.overlapSummary) {
    instructions += `

PRIOR CONTEXT (respondent already mentioned):
${topicOverlap.overlapSummary}`;
  }

  instructions += `

INSTRUCTIONS:
1. ${questionIntro}
2. Listen to the respondent's answer carefully.
3. Ask follow-up questions if the answer is too brief or unclear.
4. Use the guidance to know what depth of answer is expected.
5. Be encouraging and conversational, matching the ${tone} tone.
6. When the respondent has given a complete answer, say "Thank you for that answer" to signal you're ready for the next question.
7. Keep responses concise - this is a voice conversation.`;

  if (barbaraGuidance) {
    instructions += `\n\nORCHESTRATOR GUIDANCE (from Barbara):
${barbaraGuidance}`;
  }

  instructions += `\n\nRemember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

function buildResumeInstructions(state: InterviewState): string {
  const template = state.template;
  const currentQuestion = state.questions[state.currentQuestionIndex];
  const questionIndex = state.currentQuestionIndex;
  const totalQuestions = state.questions.length;
  
  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  
  // Build transcript summary (last 10-15 entries)
  const recentTranscript = state.transcriptLog.slice(-15);
  const transcriptSummary = recentTranscript
    .map(entry => `[${entry.speaker.toUpperCase()}]: ${entry.text}`)
    .join("\n");
  
  // Check question state
  const questionState = state.questionStates.find(qs => qs.questionIndex === questionIndex);
  const status = questionState?.status || "in_progress";
  const barbaraSuggestedMoveOn = questionState?.barbaraSuggestedMoveOn || false;
  
  let instructions = `You are Alvia, a friendly and professional AI interviewer. This interview is RESUMING after a connection interruption.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

TRANSCRIPT SUMMARY (recent conversation):
${transcriptSummary || "(No previous conversation recorded)"}

CURRENT QUESTION: "${currentQuestion?.questionText || "Please share your thoughts."}"
QUESTION STATUS: ${status}
`;

  if (barbaraSuggestedMoveOn) {
    instructions += `
NOTE: Before the interruption, the respondent had given a comprehensive answer and you offered to move to the next question.
`;
  }

  instructions += `
RESUME INSTRUCTIONS:
1. Welcome them back briefly and warmly.
2. ${barbaraSuggestedMoveOn 
    ? "Ask if they'd like to continue where they left off or move to the next question."
    : "Briefly remind them what you were discussing and invite them to continue their response."}
3. Do NOT repeat the full question unless specifically needed.
4. Be encouraging and match the ${tone} tone.
5. Keep your welcome-back message concise.

Remember: You are speaking out loud, so be natural and conversational. Do not use markdown or special formatting.`;

  return instructions;
}

async function handleOpenAIEvent(
  sessionId: string,
  event: any,
  clientWs: WebSocket,
) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  switch (event.type) {
    case "session.created":
      console.log(`[VoiceInterview] Session created for ${sessionId}`);
      // Don't trigger response here - wait for session.updated after configuration
      break;

    case "session.updated":
      console.log(`[VoiceInterview] Session updated for ${sessionId}`);
      // Only trigger response on initial session setup, not Barbara guidance updates
      if (
        state.isInitialSession &&
        state.openaiWs &&
        state.openaiWs.readyState === WebSocket.OPEN
      ) {
        state.isInitialSession = false; // Mark initial setup complete
        state.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
      }
      // Handle pending question transition (version-based race condition fix)
      // Only trigger response.create for the LATEST transition (matching version)
      // Barbara guidance updates and stale transitions are ignored
      if (
        !state.isBarbaraGuidanceUpdate &&
        state.pendingTransition !== null &&
        state.pendingTransition.version === state.questionTransitionVersion &&
        state.openaiWs &&
        state.openaiWs.readyState === WebSocket.OPEN
      ) {
        const targetIndex = state.pendingTransition.questionIndex;
        const version = state.pendingTransition.version;
        state.pendingTransition = null;
        console.log(`[VoiceInterview] Triggering response for Q${targetIndex + 1} (v${version})`);
        state.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
      }
      // Reset Barbara guidance flag after any session update
      state.isBarbaraGuidanceUpdate = false;
      break;

    case "response.audio.delta":
      // Forward audio chunks to client
      clientWs.send(
        JSON.stringify({
          type: "audio",
          delta: event.delta,
        }),
      );
      break;

    case "response.audio.done":
      clientWs.send(JSON.stringify({ type: "audio_done" }));
      break;

    case "response.audio_transcript.delta":
      // AI's speech transcript
      clientWs.send(
        JSON.stringify({
          type: "ai_transcript",
          delta: event.delta,
        }),
      );
      break;

    case "response.audio_transcript.done":
      // Store the last AI prompt for resume functionality
      if (event.transcript) {
        state.lastAIPrompt = event.transcript;
        // Add to transcript log (both in-memory and persistence buffer)
        addTranscriptEntry(state, {
          speaker: "alvia",
          text: event.transcript,
          timestamp: Date.now(),
          questionIndex: state.currentQuestionIndex,
        });
        // Schedule debounced persist
        scheduleDebouncedPersist(sessionId);
      }
      clientWs.send(
        JSON.stringify({
          type: "ai_transcript_done",
          transcript: event.transcript,
        }),
      );
      break;

    case "conversation.item.input_audio_transcription.completed":
      // User's speech transcript (from Whisper)
      // Use async IIFE to await Barbara before triggering response
      (async () => {
        if (event.transcript) {
          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: event.transcript,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });

          // Update question metrics and state
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += event.transcript
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);
          
          // Update question state with metrics
          updateQuestionState(state, state.currentQuestionIndex, { status: "in_progress" });
          
          // Schedule debounced persist
          scheduleDebouncedPersist(sessionId);

          // Await Barbara analysis before triggering AI response
          await triggerBarbaraAnalysis(sessionId, clientWs);

          // Manually trigger AI response after Barbara has analyzed and injected guidance
          if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
            state.openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text", "audio"],
                },
              }),
            );
          }
        }
        clientWs.send(
          JSON.stringify({
            type: "user_transcript",
            transcript: event.transcript,
          }),
        );
      })();
      break;

    case "input_audio_buffer.speech_started":
      // Start timing when user starts speaking
      if (!state.isPaused) {
        state.speakingStartTime = Date.now();
      }
      clientWs.send(JSON.stringify({ type: "user_speaking_started" }));
      break;

    case "input_audio_buffer.speech_stopped":
      // Stop timing and accumulate
      if (state.speakingStartTime && !state.isPaused) {
        const elapsed = Date.now() - state.speakingStartTime;
        const metrics =
          state.questionMetrics.get(state.currentQuestionIndex) ||
          createEmptyMetrics(state.currentQuestionIndex);
        metrics.activeTimeMs += elapsed;
        state.questionMetrics.set(state.currentQuestionIndex, metrics);
        state.speakingStartTime = null;
      }
      clientWs.send(JSON.stringify({ type: "user_speaking_stopped" }));
      break;

    case "response.done":
      clientWs.send(JSON.stringify({ type: "response_done" }));
      break;

    case "error":
      console.error(`[VoiceInterview] OpenAI error:`, event.error);
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: event.error?.message || "Voice service error",
        }),
      );
      break;
  }
}

const BARBARA_TIMEOUT_MS = 10000; // 10 second timeout for Barbara analysis (increased for summary context)

async function triggerBarbaraAnalysis(
  sessionId: string,
  clientWs: WebSocket,
): Promise<BarbaraGuidance | null> {
  const state = interviewStates.get(sessionId);
  if (!state || state.isWaitingForBarbara) return null;

  // Don't analyze if we don't have enough transcript
  if (state.transcriptLog.length < 2) return null;

  state.isWaitingForBarbara = true;
  console.log(`[Barbara] Analyzing conversation for session: ${sessionId}`);

  try {
    const currentQuestion = state.questions[state.currentQuestionIndex];
    const metrics =
      state.questionMetrics.get(state.currentQuestionIndex) ||
      createEmptyMetrics(state.currentQuestionIndex);

    // Wrap Barbara call with timeout
    const timeoutPromise = new Promise<BarbaraGuidance>((_, reject) => {
      setTimeout(
        () => reject(new Error("Barbara timeout")),
        BARBARA_TIMEOUT_MS,
      );
    });

    const analysisPromise = analyzeWithBarbara({
      transcriptLog: state.transcriptLog,
      previousQuestionSummaries: state.questionSummaries.filter(s => s != null),
      currentQuestionIndex: state.currentQuestionIndex,
      currentQuestion: {
        text: currentQuestion?.questionText || "",
        guidance: currentQuestion?.guidance || "",
      },
      allQuestions: state.questions.map((q: any) => ({
        text: q.questionText || "",
        guidance: q.guidance || "",
      })),
      questionMetrics: metrics,
      templateObjective: state.template?.objective || "",
      templateTone: state.template?.tone || "professional",
    });

    const guidance = await Promise.race([analysisPromise, timeoutPromise]);

    console.log(`[Barbara] Guidance for ${sessionId}:`);
    console.log(`  Action: ${guidance.action} (confidence: ${guidance.confidence})`);
    console.log(`  Message: ${guidance.message}`);
    console.log(`  Reasoning: ${guidance.reasoning}`);

    // Only inject guidance if Barbara has something meaningful to say
    if (guidance.action !== "none" && guidance.confidence > 0.6) {
      state.barbaraGuidanceQueue.push(guidance);

      // For suggest_next_question, craft a specific message that invites the respondent to add more
      let guidanceMessage = guidance.message;
      if (guidance.action === "suggest_next_question") {
        guidanceMessage = "The respondent has given a comprehensive answer. Acknowledge their response warmly, then ask if there's anything else they'd like to add before moving on. Say something like: 'That's really insightful, thank you. Is there anything else you'd like to add, or shall we move to the next question?' Wait for their response - they will click the Next Question button when ready.";
      }

      // Inject guidance by updating session instructions (system context)
      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
        const updatedInstructions = buildInterviewInstructions(
          state.template,
          currentQuestion,
          state.currentQuestionIndex,
          state.questions.length,
          guidanceMessage,
        );

        state.openaiWs.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions: updatedInstructions,
            },
          }),
        );
      }

      // Notify client about Barbara's guidance (for debugging/transparency)
      // Also signal to highlight the Next Question button when appropriate
      clientWs.send(
        JSON.stringify({
          type: "barbara_guidance",
          action: guidance.action,
          message: guidance.message,
          confidence: guidance.confidence,
          highlightNextQuestion: guidance.action === "suggest_next_question",
        }),
      );

      // Persist Barbara guidance immediately
      await persistBarbaraGuidance(sessionId, guidance);

      return guidance;
    }

    return null;
  } catch (error) {
    if ((error as Error).message === "Barbara timeout") {
      console.warn(`[Barbara] Analysis timed out for session: ${sessionId}`);
    } else {
      console.error(`[Barbara] Error during analysis:`, error);
    }
    return null;
  } finally {
    state.isWaitingForBarbara = false;
  }
}

function handleClientMessage(
  sessionId: string,
  message: any,
  clientWs: WebSocket,
) {
  const state = interviewStates.get(sessionId);
  if (!state || !state.openaiWs) return;

  switch (message.type) {
    case "audio":
      // Forward audio from client to OpenAI
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: message.audio,
          }),
        );
      }
      break;

    case "commit_audio":
      // Commit audio buffer - response will be created after transcription + Barbara analysis
      // With server_vad and create_response: false, the transcription handler triggers the response
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(
          JSON.stringify({
            type: "input_audio_buffer.commit",
          }),
        );
        // Don't trigger response.create here - it will be triggered after Barbara analysis
        // in the conversation.item.input_audio_transcription.completed handler
      }
      break;

    case "text_input":
      // Handle text input from keyboard (use async IIFE to await Barbara)
      (async () => {
        if (
          state.openaiWs &&
          state.openaiWs.readyState === WebSocket.OPEN &&
          message.text
        ) {
          // Add to transcript log (both in-memory and persistence buffer)
          addTranscriptEntry(state, {
            speaker: "respondent",
            text: message.text,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });

          // Update metrics
          const metrics =
            state.questionMetrics.get(state.currentQuestionIndex) ||
            createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += message.text
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);

          // Update question state
          updateQuestionState(state, state.currentQuestionIndex, { status: "in_progress" });
          
          // Schedule debounced persist
          scheduleDebouncedPersist(sessionId);

          // Add user text as a conversation item
          state.openaiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: message.text,
                  },
                ],
              },
            }),
          );

          // Await Barbara analysis before triggering AI response
          await triggerBarbaraAnalysis(sessionId, clientWs);

          // Trigger AI response after Barbara has had a chance to inject guidance
          if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
            state.openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text", "audio"],
                },
              }),
            );
          }
        }
      })();
      break;

    case "pause_interview":
      state.isPaused = true;
      // Stop timing if currently speaking
      if (state.speakingStartTime) {
        const elapsed = Date.now() - state.speakingStartTime;
        const metrics =
          state.questionMetrics.get(state.currentQuestionIndex) ||
          createEmptyMetrics(state.currentQuestionIndex);
        metrics.activeTimeMs += elapsed;
        state.questionMetrics.set(state.currentQuestionIndex, metrics);
        state.speakingStartTime = null;
      }
      // Flush pending persist immediately on pause
      flushPersist(sessionId);
      // Also update session status in database
      storage.persistInterviewState(sessionId, { 
        status: "paused", 
        pausedAt: new Date() 
      });
      console.log(
        `[VoiceInterview] Interview paused for session: ${sessionId}`,
      );
      break;

    case "resume_interview":
      // Handle resume from pause - Alvia decides what to say based on transcript context
      state.isPaused = false;
      // Update session status back to in_progress
      storage.persistInterviewState(sessionId, { 
        status: "in_progress", 
        pausedAt: null 
      });
      console.log(
        `[VoiceInterview] Interview resuming for session: ${sessionId}`,
      );

      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
        const currentQuestion = state.questions[state.currentQuestionIndex];
        
        // Check the transcript to determine how to resume
        // Look at recent Alvia messages to see if she already welcomed back after a pause
        const recentTranscript = state.transcriptLog.slice(-5);
        const lastAlviaMessage = recentTranscript
          .filter(entry => entry.speaker === "alvia")
          .pop();
        
        // Build context for Alvia to decide what to say
        const transcriptContext = recentTranscript
          .map(entry => `[${entry.speaker.toUpperCase()}]: ${entry.text}`)
          .join("\n");
        
        const currentQuestionText = currentQuestion?.questionText || "the question";
        
        // Let Alvia decide based on transcript context
        state.openaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `[System: The interview was paused and has now resumed. Review the recent transcript context below and decide how to welcome back the respondent:

RECENT TRANSCRIPT:
${transcriptContext || "(No recent messages)"}

CURRENT QUESTION: "${currentQuestionText}"

INSTRUCTIONS: 
- If your last message already repeated or summarized the question (from a previous resume), DO NOT repeat the question again. Simply say something brief like "Welcome back! Please go ahead and continue your response whenever you're ready."
- If the question hasn't been restated recently, briefly remind them of what you were discussing and invite them to continue.
- Be warm and encouraging, but keep it concise.]`,
                },
              ],
            },
          }),
        );

        // Trigger AI response
        state.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
            },
          }),
        );
      }
      break;

    case "next_question":
      // Move to next question
      if (state.currentQuestionIndex < state.questions.length - 1) {
        const previousIndex = state.currentQuestionIndex;

        // Increment transition version - cancels any in-flight transitions from rapid clicks
        state.questionTransitionVersion++;
        const transitionVersion = state.questionTransitionVersion;
        console.log(`[VoiceInterview] Starting transition to next question (v${transitionVersion})`);

        // Trigger summarization in background (don't await - non-blocking)
        generateAndPersistSummary(sessionId, previousIndex).catch(() => {
          // Error already logged in generateAndPersistSummary
        });

        // Immediately move to next question (don't wait for summary)
        state.currentQuestionIndex++;
        const nextQuestion = state.questions[state.currentQuestionIndex];

        // Initialize metrics for new question
        state.questionMetrics.set(
          state.currentQuestionIndex,
          createEmptyMetrics(state.currentQuestionIndex),
        );
        
        // Clear Barbara's last guidance as we're moving to a new question
        state.lastBarbaraGuidance = null;

        // Persist question state changes immediately
        persistNextQuestion(sessionId, previousIndex, state.currentQuestionIndex);

        // Capture target index before async call to prevent race conditions
        const targetQuestionIndex = state.currentQuestionIndex;
        const targetQuestion = nextQuestion;
        const summariesSnapshot = [...state.questionSummaries.filter(s => s != null)];
        const templateSnapshot = state.template;

        // Analyze topic overlap in background and then update Alvia's instructions
        (async () => {
          try {
            // Check if the upcoming question's topic was already discussed
            const topicOverlap = await analyzeTopicOverlap(
              {
                text: targetQuestion?.questionText || "",
                guidance: targetQuestion?.guidance || "",
              },
              targetQuestionIndex,
              summariesSnapshot,
              templateSnapshot?.objective || "",
            );

            // Short-circuit if this transition was superseded by a newer one (rapid click)
            if (transitionVersion !== state.questionTransitionVersion) {
              console.log(`[VoiceInterview] Skipping stale transition v${transitionVersion}, now on v${state.questionTransitionVersion}`);
              return;
            }

            // Build instructions with topic overlap context
            const instructions = buildInterviewInstructions(
              templateSnapshot,
              targetQuestion,
              targetQuestionIndex,
              state.questions.length,
              undefined, // no Barbara guidance yet
              topicOverlap,
            );

            if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
              // Set pending transition with captured version - will trigger response.create in session.updated handler
              state.pendingTransition = { version: transitionVersion, questionIndex: targetQuestionIndex };
              
              console.log(`[VoiceInterview] Sending session.update for Q${targetQuestionIndex + 1} (v${transitionVersion})`);
              
              // Update session with context-aware instructions
              state.openaiWs.send(
                JSON.stringify({
                  type: "session.update",
                  session: {
                    instructions: instructions,
                  },
                }),
              );
            }

            // Notify client about topic overlap if detected
            if (topicOverlap.hasOverlap) {
              clientWs.send(
                JSON.stringify({
                  type: "topic_overlap_detected",
                  questionIndex: targetQuestionIndex,
                  overlapSummary: topicOverlap.overlapSummary,
                }),
              );
            }
          } catch (error) {
            console.error(`[VoiceInterview] Topic overlap analysis failed:`, error);
            
            // Short-circuit if this transition was superseded by a newer one (rapid click)
            if (transitionVersion !== state.questionTransitionVersion) {
              console.log(`[VoiceInterview] Skipping stale fallback transition v${transitionVersion}, now on v${state.questionTransitionVersion}`);
              return;
            }

            // Fallback: just ask the question normally
            const instructions = buildInterviewInstructions(
              templateSnapshot,
              targetQuestion,
              targetQuestionIndex,
              state.questions.length,
            );

            if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
              // Set pending transition with captured version - will trigger response.create in session.updated handler
              state.pendingTransition = { version: transitionVersion, questionIndex: targetQuestionIndex };
              
              console.log(`[VoiceInterview] Sending fallback session.update for Q${targetQuestionIndex + 1} (v${transitionVersion})`);
              
              state.openaiWs.send(
                JSON.stringify({
                  type: "session.update",
                  session: {
                    instructions: instructions,
                  },
                }),
              );
            }
          }
        })();

        clientWs.send(
          JSON.stringify({
            type: "question_changed",
            questionIndex: state.currentQuestionIndex,
            totalQuestions: state.questions.length,
            currentQuestion: nextQuestion?.questionText,
          }),
        );
      } else {
        clientWs.send(JSON.stringify({ type: "interview_complete" }));
      }
      break;

    case "end_interview":
      // Trigger summarization for final question in background before cleanup
      generateAndPersistSummary(sessionId, state.currentQuestionIndex).catch(() => {
        // Error already logged in generateAndPersistSummary
      });
      clientWs.send(JSON.stringify({ type: "interview_complete" }));
      cleanupSession(sessionId);
      break;
  }
}

async function cleanupSession(sessionId: string) {
  const state = interviewStates.get(sessionId);
  if (state) {
    // Flush any pending persist before cleanup
    await flushPersist(sessionId);
    
    if (state.openaiWs) {
      state.openaiWs.close();
    }
    interviewStates.delete(sessionId);
    console.log(`[VoiceInterview] Session cleaned up: ${sessionId}`);
  }
}
