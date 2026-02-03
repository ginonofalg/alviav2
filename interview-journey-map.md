# Interview Journey: Pages & Popups Map

## Route Flow

```
/join/:collectionId → /welcome/:sessionId → /interview/:sessionId → /review/:sessionId
                                                                   ↗
                              /interview/resume/:token ────────────┘
                              /review/:token (64-char) → /review/:sessionId
```

There are **7 route-level pages** total. One (`/interview/complete`) is essentially deprecated — the interview now redirects directly to `/review/:sessionId`.

---

## Page-by-Page Breakdown

### 1. Consent Page — `/join/:collectionId`
**File:** `client/src/pages/interview-consent.tsx`

Collects respondent consent and creates the session.

**Conditional screens (not popups — full content swaps):**
- **Loading skeleton** — while checking resume token + fetching collection
- **Resume option screen** — detected via localStorage (`alvia_resume_{collectionId}`). Shows "Resume Interview" (green) and "Start a New Interview" (outline) buttons
- **Main consent form** — 3 checkboxes (participate, audio recording if enabled, data processing) + "Begin Interview" button

**Toasts:** "Failed to start interview" on error

**Navigates to:** `/welcome/{sessionId}`

---

### 2. Welcome Page — `/welcome/:sessionId`
**File:** `client/src/pages/interview-welcome.tsx`

Captures respondent names before the interview starts.

**Conditional screens:**
- **Loading skeleton**
- **Session Not Found** — AlertCircle error card
- **Main name entry form** — two optional inputs (full name, informal name), privacy notice box, "Continue to Interview" button, and conditional "Skip and remain anonymous" link

**Toasts:** "Failed to save" on error

**Navigates to:** `/interview/{sessionId}`

---

### 3. Main Interview Page — `/interview/:sessionId`
**File:** `client/src/pages/interview.tsx` (~1,400 lines)

This is the most complex page. It has the voice/text interview UI, WebSocket management, and **all the popups**.

**Conditional screens:**
- **Loading skeleton** — initial data fetch
- **Ready phase** — large mic icon, greeting ("Ok {name}, Alvia's ready when you are"), "Start Interview" button. Skipped on resume.
- **Active interview** — question display, waveform visualizer, mic button, transcript panel, text input, navigation buttons

#### Popup Dialogs (all animated with Framer Motion, custom-built — not Radix Dialog):

| Popup | Trigger | Icon/Color | Title | Buttons |
|---|---|---|---|---|
| **Additional Questions Consent** | Click "Complete Interview" when AQs are enabled | MessageSquareText / blue | "One More Thing..." | "No, Complete Now" · "Yes, Continue" |
| **Next Question Confirmation** | Click "Next Question" before Barbara highlights it | AlertCircle / amber | "Move to Next Question?" | "Stay Here" · "Yes, Next Question" |
| **Complete Interview Confirmation** | Click "Complete Interview" on last Q before Barbara highlights it | AlertCircle / amber | "Complete Interview?" | "Stay Here" · "Yes, Complete" |

#### Full-Screen Overlays (Framer Motion):

| Overlay | Trigger | Content |
|---|---|---|
| **AQ Generating** | After accepting additional questions | Spinner → "Preparing Questions" / "Our AI analyst is reviewing your interview..." then transitions to green checkmark if no AQs generated |
| **AQ Completing** | After finishing last AQ | Spinner → "Wrapping Up" / "Barbara is finishing up her notes..." |

#### Toasts:
- "Connection error — Failed to connect to voice service" (destructive)
- "Interview completed — Thank you for participating!" (success)
- "Session Inactive — Your session will end soon due to inactivity" (destructive)
- "Session Ended — Your interview session has ended" (destructive)
- "{count} additional question(s) ready" (success)
- "Microphone unavailable — You can type your responses instead" (success)
- Generic server error messages

**Navigates to:** `/review/{sessionId}` on completion, or `/sessions/{sessionId}` if terminated by server (resumable)

---

### 4. Completion Page — `/interview/complete`
**File:** `client/src/pages/interview-complete.tsx`

Simple thank-you card with green CheckCircle icon. **Largely bypassed** now — the interview page navigates directly to `/review/:sessionId`.

**Navigates to:** `/` via "Return to Home" button

---

### 5. Interview Review Page — `/review/:sessionId`
**File:** `client/src/pages/interview-review.tsx`

Respondent reviews their responses, rates their experience, and submits comments.

**Conditional screens:**
- **Loading skeleton**
- **Error card** — "Unable to Load Review" with "Return to Completion Page" button

**Main content sections:**
- **Question Review Cards** — one per template question (Q1, Q2...) + additional questions (AQ1, AQ2...), each with: summary bullets, collapsible full transcript (`<details>`/`<summary>` HTML), comment textarea
- **Rating Section** — 6 DotRating components in a 2-col grid: Question Clarity, Alvia Understanding, Conversation Flow, Comfort Level, Technical Quality, Overall Experience (each 1-5 dots)
- **Final Comments card** — textarea for closing comments

**Action buttons:**
- "Review Later" (outline) → opens **ReviewLaterModal**
- "Skip Review" (ghost) → submits with `skipped=true`
- "Submit Review" (primary)

#### Popup: ReviewLaterModal (Radix Dialog)
**File:** `client/src/components/review/ReviewLaterModal.tsx`

| State | Content |
|---|---|
| Before generation | "Generate Review Link" button |
| After generation | Read-only URL input + copy button + expiration info ("Expires: {date}") + help text |

**Toasts:** "Link copied to clipboard" (success), "Failed to generate review link" (destructive)

#### Review page toasts:
- "Review submitted — Thank you for your feedback!" (success)
- Submission error (destructive)

**Draft auto-saved to:** `localStorage` key `interview_review_draft_{sessionId}`, cleared on submit

**Navigates to:** `/interview/complete` after submit or skip

---

### 6. Review Token Page — `/review/:token` (64-char tokens)
**File:** `client/src/pages/review-token.tsx`

Validates shareable review links. The router distinguishes this from page 5 by checking if the param is exactly 64 characters.

**Conditional screens:**
- **Loading** — "Validating your review link..."
- **Error** — Clock icon for expired (48h), AlertCircle for invalid. "Go to Home" button
- **Valid** — stores token in `sessionStorage` (`review_access_token_{sessionId}`), immediately redirects

**Navigates to:** `/review/{sessionId}` (authenticated review page)

---

### 7. Resume Page — `/interview/resume/:token`
**File:** `client/src/pages/interview-resume.tsx`

Validates cryptographic resume tokens (7-day expiry).

**Conditional screens:**
- **Loading** — spinner + "Resuming Your Interview"
- **Error** — "Unable to Resume Interview" + help text. No navigation button (user must go back manually)
- **Valid** — redirects immediately

**Navigates to:** `/interview/{sessionId}?resume=true`

---

## Summary: All Popups

| Type | Location | Component | Tech |
|---|---|---|---|
| AQ Consent Dialog | Interview page | Inline (Framer Motion) | Custom animated div |
| Next Question Dialog | Interview page | Inline (Framer Motion) | Custom animated div |
| Complete Interview Dialog | Interview page | Inline (Framer Motion) | Custom animated div |
| AQ Generating Overlay | Interview page | Inline (Framer Motion) | Full-screen overlay |
| AQ Completing Overlay | Interview page | Inline (Framer Motion) | Full-screen overlay |
| ReviewLaterModal | Review page | `ReviewLaterModal.tsx` | Radix Dialog |

All other state changes (loading, error, resume option, ready phase) are **conditional screen swaps** within their respective pages, not overlays or modals.

---

## Local Storage & Session Storage

| Key | Scope | Use | Cleared On |
|---|---|---|---|
| `alvia_resume_{collectionId}` | localStorage | Resume token + sessionId | Start fresh / token expiry |
| `interview_review_draft_{sessionId}` | localStorage | Draft review data (ratings, comments) | Successful submission |
| `review_access_token_{sessionId}` | sessionStorage | Review access token from shareable link | Browser session ends |
