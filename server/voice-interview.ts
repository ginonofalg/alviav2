import WebSocket from "ws";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { 
  analyzeWithBarbara, 
  createEmptyMetrics,
  type TranscriptEntry, 
  type QuestionMetrics,
  type BarbaraGuidance 
} from "./barbara-orchestrator";

// the newest OpenAI model is "gpt-realtime" for realtime voice conversations
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

interface InterviewState {
  sessionId: string;
  currentQuestionIndex: number;
  questions: any[];
  template: any;
  openaiWs: WebSocket | null;
  isConnected: boolean;
  lastAIPrompt: string;
  isPaused: boolean;
  // Barbara-related state
  transcriptLog: TranscriptEntry[];
  questionMetrics: Map<number, QuestionMetrics>;
  speakingStartTime: number | null;
  barbaraGuidanceQueue: BarbaraGuidance[];
  isWaitingForBarbara: boolean;
  isBarbaraGuidanceUpdate: boolean; // Flag to prevent auto-response on Barbara updates
  isInitialSession: boolean; // Track if this is the initial session setup
}

const interviewStates = new Map<string, InterviewState>();

export function handleVoiceInterview(clientWs: WebSocket, req: IncomingMessage) {
  // Extract session ID from query string: /ws/interview?sessionId=xxx
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  
  if (!sessionId) {
    clientWs.close(1008, "Session ID required");
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
      clientWs.send(JSON.stringify({ type: "error", message: "Session not found" }));
      clientWs.close();
      return;
    }

    const collection = await storage.getCollection(session.collectionId);
    if (!collection) {
      clientWs.send(JSON.stringify({ type: "error", message: "Collection not found" }));
      clientWs.close();
      return;
    }

    const template = await storage.getTemplate(collection.templateId);
    const questions = await storage.getQuestionsByTemplate(collection.templateId);

    state.template = template;
    state.questions = questions;
    state.currentQuestionIndex = session.currentQuestionIndex || 0;

    // Initialize metrics for first question
    state.questionMetrics.set(0, createEmptyMetrics(0));

    // Connect to OpenAI Realtime API
    connectToOpenAI(sessionId, clientWs);
  } catch (error) {
    console.error("[VoiceInterview] Error initializing:", error);
    clientWs.send(JSON.stringify({ type: "error", message: "Failed to initialize interview" }));
  }
}

function connectToOpenAI(sessionId: string, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: "error", message: "OpenAI API key not configured" }));
    return;
  }

  console.log(`[VoiceInterview] Connecting to OpenAI for session: ${sessionId}`);

  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  state.openaiWs = openaiWs;

  openaiWs.on("open", () => {
    console.log(`[VoiceInterview] Connected to OpenAI for session: ${sessionId}`);
    state.isConnected = true;

    // Configure the session
    const currentQuestion = state.questions[state.currentQuestionIndex];
    const instructions = buildInterviewInstructions(state.template, currentQuestion, state.currentQuestionIndex, state.questions.length);
    
    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: instructions,
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: false, // Disable auto-response to allow Barbara analysis first
        },
      },
    }));

    // Notify client that connection is ready
    clientWs.send(JSON.stringify({
      type: "connected",
      sessionId,
      questionIndex: state.currentQuestionIndex,
      totalQuestions: state.questions.length,
      currentQuestion: currentQuestion?.questionText,
    }));
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
    console.log(`[VoiceInterview] OpenAI connection closed for session: ${sessionId}`);
    state.isConnected = false;
    clientWs.send(JSON.stringify({ type: "disconnected" }));
  });

  openaiWs.on("error", (error) => {
    console.error(`[VoiceInterview] OpenAI error for ${sessionId}:`, error);
    clientWs.send(JSON.stringify({ type: "error", message: "Voice service error" }));
  });
}

function buildInterviewInstructions(template: any, currentQuestion: any, questionIndex: number, totalQuestions: number, barbaraGuidance?: string): string {
  const objective = template?.objective || "Conduct a thorough interview";
  const tone = template?.tone || "professional";
  const guidance = currentQuestion?.guidance || "";

  let instructions = `You are Alvia, a friendly and professional AI interviewer. Your role is to conduct a voice interview.

INTERVIEW CONTEXT:
- Objective: ${objective}
- Tone: ${tone}
- Current Question: ${questionIndex + 1} of ${totalQuestions}

CURRENT QUESTION TO ASK:
"${currentQuestion?.questionText || "Please share your thoughts."}"

GUIDANCE FOR THIS QUESTION:
${guidance || "Listen carefully and probe for more details when appropriate."}

INSTRUCTIONS:
1. ${questionIndex === 0 ? `Start with a warm greeting and briefly explain the interview purpose: "${objective}". Then ask the first question.` : "Ask the current question naturally."}
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

async function handleOpenAIEvent(sessionId: string, event: any, clientWs: WebSocket) {
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
      if (state.isInitialSession && state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
        state.isInitialSession = false; // Mark initial setup complete
        state.openaiWs.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
          },
        }));
      }
      // Reset Barbara guidance flag after any session update
      state.isBarbaraGuidanceUpdate = false;
      break;

    case "response.audio.delta":
      // Forward audio chunks to client
      clientWs.send(JSON.stringify({
        type: "audio",
        delta: event.delta,
      }));
      break;

    case "response.audio.done":
      clientWs.send(JSON.stringify({ type: "audio_done" }));
      break;

    case "response.audio_transcript.delta":
      // AI's speech transcript
      clientWs.send(JSON.stringify({
        type: "ai_transcript",
        delta: event.delta,
      }));
      break;

    case "response.audio_transcript.done":
      // Store the last AI prompt for resume functionality
      if (event.transcript) {
        state.lastAIPrompt = event.transcript;
        // Add to transcript log
        state.transcriptLog.push({
          speaker: "alvia",
          text: event.transcript,
          timestamp: Date.now(),
          questionIndex: state.currentQuestionIndex,
        });
      }
      clientWs.send(JSON.stringify({
        type: "ai_transcript_done",
        transcript: event.transcript,
      }));
      break;

    case "conversation.item.input_audio_transcription.completed":
      // User's speech transcript (from Whisper)
      // Use async IIFE to await Barbara before triggering response
      (async () => {
        if (event.transcript) {
          // Add to transcript log
          state.transcriptLog.push({
            speaker: "respondent",
            text: event.transcript,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });
          
          // Update question metrics
          const metrics = state.questionMetrics.get(state.currentQuestionIndex) || createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += event.transcript.split(/\s+/).filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);

          // Await Barbara analysis before triggering AI response
          await triggerBarbaraAnalysis(sessionId, clientWs);
          
          // Manually trigger AI response after Barbara has analyzed and injected guidance
          if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
            state.openaiWs.send(JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["text", "audio"],
              },
            }));
          }
        }
        clientWs.send(JSON.stringify({
          type: "user_transcript",
          transcript: event.transcript,
        }));
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
        const metrics = state.questionMetrics.get(state.currentQuestionIndex) || createEmptyMetrics(state.currentQuestionIndex);
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
      clientWs.send(JSON.stringify({
        type: "error",
        message: event.error?.message || "Voice service error",
      }));
      break;
  }
}

const BARBARA_TIMEOUT_MS = 5000; // 5 second timeout for Barbara analysis

async function triggerBarbaraAnalysis(sessionId: string, clientWs: WebSocket): Promise<BarbaraGuidance | null> {
  const state = interviewStates.get(sessionId);
  if (!state || state.isWaitingForBarbara) return null;

  // Don't analyze if we don't have enough transcript
  if (state.transcriptLog.length < 2) return null;

  state.isWaitingForBarbara = true;
  console.log(`[Barbara] Analyzing conversation for session: ${sessionId}`);

  try {
    const currentQuestion = state.questions[state.currentQuestionIndex];
    const metrics = state.questionMetrics.get(state.currentQuestionIndex) || createEmptyMetrics(state.currentQuestionIndex);

    // Wrap Barbara call with timeout
    const timeoutPromise = new Promise<BarbaraGuidance>((_, reject) => {
      setTimeout(() => reject(new Error("Barbara timeout")), BARBARA_TIMEOUT_MS);
    });

    const analysisPromise = analyzeWithBarbara({
      transcriptLog: state.transcriptLog,
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

    console.log(`[Barbara] Guidance for ${sessionId}:`, guidance.action, guidance.confidence);

    // Only inject guidance if Barbara has something meaningful to say
    if (guidance.action !== "none" && guidance.confidence > 0.6) {
      state.barbaraGuidanceQueue.push(guidance);
      
      // Inject guidance by updating session instructions (system context)
      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
        const updatedInstructions = buildInterviewInstructions(
          state.template,
          currentQuestion,
          state.currentQuestionIndex,
          state.questions.length,
          guidance.message
        );
        
        state.openaiWs.send(JSON.stringify({
          type: "session.update",
          session: {
            instructions: updatedInstructions,
          },
        }));
      }

      // Notify client about Barbara's guidance (for debugging/transparency)
      clientWs.send(JSON.stringify({
        type: "barbara_guidance",
        action: guidance.action,
        message: guidance.message,
        confidence: guidance.confidence,
      }));
      
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

function handleClientMessage(sessionId: string, message: any, clientWs: WebSocket) {
  const state = interviewStates.get(sessionId);
  if (!state || !state.openaiWs) return;

  switch (message.type) {
    case "audio":
      // Forward audio from client to OpenAI
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: message.audio,
        }));
      }
      break;

    case "commit_audio":
      // Commit audio buffer - response will be created after transcription + Barbara analysis
      // With server_vad and create_response: false, the transcription handler triggers the response
      if (state.openaiWs.readyState === WebSocket.OPEN) {
        state.openaiWs.send(JSON.stringify({
          type: "input_audio_buffer.commit",
        }));
        // Don't trigger response.create here - it will be triggered after Barbara analysis
        // in the conversation.item.input_audio_transcription.completed handler
      }
      break;

    case "text_input":
      // Handle text input from keyboard (use async IIFE to await Barbara)
      (async () => {
        if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN && message.text) {
          // Add to transcript log
          state.transcriptLog.push({
            speaker: "respondent",
            text: message.text,
            timestamp: Date.now(),
            questionIndex: state.currentQuestionIndex,
          });
          
          // Update metrics
          const metrics = state.questionMetrics.get(state.currentQuestionIndex) || createEmptyMetrics(state.currentQuestionIndex);
          metrics.wordCount += message.text.split(/\s+/).filter((w: string) => w.length > 0).length;
          metrics.turnCount++;
          state.questionMetrics.set(state.currentQuestionIndex, metrics);

          // Add user text as a conversation item
          state.openaiWs.send(JSON.stringify({
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
          }));
          
          // Await Barbara analysis before triggering AI response
          await triggerBarbaraAnalysis(sessionId, clientWs);
          
          // Trigger AI response after Barbara has had a chance to inject guidance
          if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
            state.openaiWs.send(JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["text", "audio"],
              },
            }));
          }
        }
      })();
      break;

    case "pause_interview":
      state.isPaused = true;
      // Stop timing if currently speaking
      if (state.speakingStartTime) {
        const elapsed = Date.now() - state.speakingStartTime;
        const metrics = state.questionMetrics.get(state.currentQuestionIndex) || createEmptyMetrics(state.currentQuestionIndex);
        metrics.activeTimeMs += elapsed;
        state.questionMetrics.set(state.currentQuestionIndex, metrics);
        state.speakingStartTime = null;
      }
      console.log(`[VoiceInterview] Interview paused for session: ${sessionId}`);
      break;

    case "resume_interview":
      // Handle resume from pause - ask AI to pick up where we left off
      state.isPaused = false;
      console.log(`[VoiceInterview] Interview resuming for session: ${sessionId}`);
      
      if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
        const currentQuestion = state.questions[state.currentQuestionIndex];
        const lastPrompt = state.lastAIPrompt || currentQuestion?.questionText || "our conversation";
        
        // Create a system message to guide the resume
        state.openaiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `[System: The interview was paused and has now resumed. Please acknowledge that we're picking up where we left off. Briefly summarize or repeat what you last asked: "${lastPrompt.substring(0, 200)}..." and invite them to continue their response. Be warm and encouraging.]`,
              },
            ],
          },
        }));
        
        // Trigger AI response
        state.openaiWs.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
          },
        }));
      }
      break;

    case "next_question":
      // Move to next question
      if (state.currentQuestionIndex < state.questions.length - 1) {
        state.currentQuestionIndex++;
        const nextQuestion = state.questions[state.currentQuestionIndex];
        
        // Initialize metrics for new question
        state.questionMetrics.set(state.currentQuestionIndex, createEmptyMetrics(state.currentQuestionIndex));
        
        // Update session instructions for new question
        const instructions = buildInterviewInstructions(
          state.template,
          nextQuestion,
          state.currentQuestionIndex,
          state.questions.length
        );

        if (state.openaiWs.readyState === WebSocket.OPEN) {
          state.openaiWs.send(JSON.stringify({
            type: "session.update",
            session: {
              instructions: instructions,
            },
          }));
        }

        clientWs.send(JSON.stringify({
          type: "question_changed",
          questionIndex: state.currentQuestionIndex,
          totalQuestions: state.questions.length,
          currentQuestion: nextQuestion?.questionText,
        }));
      } else {
        clientWs.send(JSON.stringify({ type: "interview_complete" }));
      }
      break;

    case "end_interview":
      clientWs.send(JSON.stringify({ type: "interview_complete" }));
      cleanupSession(sessionId);
      break;
  }
}

function cleanupSession(sessionId: string) {
  const state = interviewStates.get(sessionId);
  if (state) {
    if (state.openaiWs) {
      state.openaiWs.close();
    }
    interviewStates.delete(sessionId);
  }
}
