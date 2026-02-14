import type { TranscriptEntry } from "../barbara-orchestrator";

type MessageRole = "system" | "user" | "assistant";
type ChatMessage = { role: MessageRole; content: string };
type Perspective = "alvia" | "respondent";

export function buildConversationMessages(
  transcript: TranscriptEntry[],
  systemPrompt: string,
  perspective: Perspective,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const entry of transcript) {
    if (perspective === "alvia") {
      if (entry.speaker === "alvia") {
        messages.push({ role: "assistant", content: entry.text });
      } else if (entry.speaker === "respondent") {
        messages.push({ role: "user", content: entry.text });
      }
    } else {
      if (entry.speaker === "alvia") {
        messages.push({ role: "user", content: entry.text });
      } else if (entry.speaker === "respondent") {
        messages.push({ role: "assistant", content: entry.text });
      }
    }
  }

  return messages;
}
