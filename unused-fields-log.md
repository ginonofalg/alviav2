# Fields NOT Currently Used in Prompts or Logic — Issue/Functionality Log

These fields exist in the UI and/or schema but are **not referenced** in Alvia's prompts, Barbara's analysis, or any interview-flow logic. They are candidates for future wiring or removal.

## Project

| Field | Current UI Location | Gap |
|---|---|---|
| **avoidRules** | Displayed as read-only "Default AVOID Rules" on project-new (6 hardcoded rules) | Not passed to Alvia or Barbara. Alvia has no awareness of topics to avoid. Should be injected into system prompt as constraints. |
| **consentAudioRecording** | Switch on project-new/edit (Privacy tab) | Stored in DB but not checked by `voice-interview.ts`. Audio recording happens regardless of this setting. |
| **piiRedactionEnabled** | Switch on project-new/edit (Privacy tab) | Stored in DB but not checked anywhere in server code. No redaction logic is triggered by this flag. |
| **crossInterviewContext** | Switch on project-new/edit (Advanced) | Code in `voice-interview.ts` has `enabled: false` with `// TODO: Implement cross-interview context in future iteration`. Toggle has no effect. |
| **crossInterviewThreshold** | Number input on project-new/edit (Advanced) | Depends on crossInterviewContext, which is not implemented. No effect. |

## Template

| Field | Current UI Location | Gap |
|---|---|---|
| **constraints** | Textarea on template-builder ("Any topics or areas to avoid?") | Accepted by API and stored in DB, but not passed to Alvia or Barbara in any prompt. Similar to avoidRules — interviewer has no awareness of constraints. |

## Template — Questions

| Field | Current UI Location | Gap |
|---|---|---|
| **questionType** | Select on template-builder (open, yes_no, scale, numeric, multi_select) | Stored but never communicated to Alvia or Barbara. Alvia doesn't know she should expect a yes/no answer or a numeric scale rating — she treats all questions as open-ended. |
| **timeHintSeconds** | Number input on template-builder | Stored but not referenced in `voice-interview.ts`. No timer or pacing logic uses this value. |
| **scaleMin / scaleMax** | Number inputs on template-builder (conditional on scale type) | Stored but not passed to Alvia. She doesn't know the scale range to communicate to the respondent. |
| **isRequired** | Switch on template-builder | Stored but not enforced in the interview flow. Alvia proceeds regardless of whether a question is marked required. |

## Collection

| Field | Current UI Location | Gap |
|---|---|---|
| **voiceProvider** | Select on collection-new and collection-detail edit dialog | Stored in DB but **not read by** `voice-interview.ts`. The actual provider is determined by URL parameter or `REALTIME_PROVIDER` env var. The per-collection setting has no effect. |
| **targetResponses** | Number input on collection-new and edit dialog | Display/tracking metric only. No logic caps responses at this number. |
| **expiresAt** | Date picker on collection-new | Stored but not checked in interview flow. Expired collections still accept responses. |
| **isOpen / isActive** | Switch on collection-new / edit dialog | Stored but not enforced as a gate in the interview join flow. |
