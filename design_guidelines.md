# Alvia Design Guidelines

## Design Approach

**Reference-Based**: Drawing from Linear's precision + Notion's data clarity + Stripe's trust aesthetics

Professional research tools require clarity, efficiency, and trust. This design prioritizes information hierarchy, efficient workflows, and calm interfaces that support extended analysis sessions.

---

## Typography

**Font Stack**:
- Primary: Inter (via Google Fonts CDN)
- Monospace: 'JetBrains Mono' for timestamps, IDs, technical data

**Hierarchy**:
- Page titles: text-3xl font-semibold (30px)
- Section headers: text-xl font-semibold (20px)
- Card/component titles: text-base font-medium (16px)
- Body text: text-sm (14px)
- Metadata/labels: text-xs text-gray-600 (12px)
- Interview transcripts: text-base leading-relaxed for readability

---

## Layout System

**Spacing Units**: Tailwind 2, 4, 6, 8, 12, 16 for consistent rhythm

**Container Structure**:
- Max-width: max-w-7xl for main content areas
- Sidebar navigation: Fixed 16rem (256px) width on desktop
- Main content padding: p-8 (desktop), p-4 (mobile)

**Grid Patterns**:
- Project/collection cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Analytics dashboards: 2-column layouts for metrics (grid-cols-2 gap-4)
- Session lists: Single column with full-width cards for transcript clarity

---

## Component Library

### Navigation
**Sidebar** (Authenticated Areas):
- Fixed left sidebar with workspace switcher at top
- Vertical nav items with icons (Heroicons outline)
- Active state: Subtle background fill + medium weight text
- Collapsible sections for Projects, Collections, Reports

**Top Bar**:
- User profile dropdown (right)
- Breadcrumb navigation (left) showing: Workspace > Project > Collection hierarchy
- Action buttons (primary CTA) aligned right

### Cards & Containers
**Project Cards**:
- Elevated with subtle shadow (shadow-sm)
- Rounded corners (rounded-lg)
- Padding: p-6
- Header: Icon + Title + Status badge
- Body: Key metrics (interviews completed, avg duration)
- Footer: Last updated timestamp + action menu (⋮)

**Interview Session Cards**:
- Border-left accent (4px) indicating status: blue (in-progress), green (completed), gray (paused)
- Compact layout: Respondent ID, timestamp, duration, progress bar
- Expandable to show per-question summaries

### Forms
**Template Builder**:
- Clean form layout with clear field grouping
- Question cards: Drag handle icon + question type badge + input field
- Inline question guidance (textarea with subtle background)
- Add question: Ghost button with + icon

**Interview Controls**:
- Large, accessible microphone toggle (rounded-full, size-16)
- Pause/Resume: Secondary buttons with clear icons
- Progress indicator: Horizontal bar showing question X of Y
- Live transcript: Scrollable container with monospace timestamps on left, transcript on right

### Data Display
**Transcript View**:
- Two-column layout: timestamps (w-24) + content (flex-1)
- Speaker labels: Bold, distinct styling (Respondent vs Alvia)
- Quote highlights: Subtle yellow background for extracted quotes
- Summary blocks: Bordered sections with structured bullet points

**Analytics Tables**:
- Clean table headers with sort indicators
- Row hover states
- Embedded mini-visualizations (progress bars for completion rates)
- Export button in top-right

### Buttons
- Primary: Solid fill for main actions (Start Interview, Save Template)
- Secondary: Border outline for secondary actions
- Ghost: No border for tertiary actions (Cancel, Learn More)
- Sizes: Default (h-10), Small (h-8) for compact UIs

### Status Indicators
**Badges**:
- Rounded-full px-3 py-1
- Question types: Neutral gray background
- Session status: Color-coded (green/blue/yellow/red)
- Confidence scores: Icon + percentage

**Quality Flags**:
- Warning icon (⚠️) for incomplete/ambiguous responses
- Info icon (ℹ️) for cross-interview context
- Alert icon (🚨) for distress cues (subtle, not alarming)

---

## Voice Interface Specifics

**Interview Screen**:
- Centered layout with max-w-3xl
- Large waveform visualization (subtle animation during active listening)
- Current question displayed prominently (text-2xl)
- Live transcript beneath in scrollable container (max-h-96)
- Microphone button: Pulsing ring animation when active
- Question counter: Subtle top-right badge

**Consent Screen**:
- Single-column centered (max-w-2xl)
- Clear checkbox list for permissions
- Audio recording toggle prominently displayed
- Continue button disabled until consent given

---

## Responsive Behavior

**Mobile-First Adjustments**:
- Sidebar collapses to hamburger menu
- Card grids stack to single column
- Interview controls: Full-width buttons
- Transcript: Single column (remove timestamp column, inline above text)
- Tables: Horizontal scroll with sticky first column

---

## Images

No large hero images for authenticated dashboard areas. Focus on functional clarity.

**Icon Usage**:
- Heroicons throughout (outline for nav, solid for emphasis)
- Microphone, pause, play, stop, checkmark, warning, info icons
- Custom voice waveform SVG visualization (subtle, not distracting)

---

## Accessibility & Polish

- Focus rings: ring-2 ring-blue-500 ring-offset-2 on all interactive elements
- Skip to main content link
- ARIA labels for all icon-only buttons
- Keyboard shortcuts: Display in tooltips (e.g., "Space to pause")
- Loading states: Skeleton screens for data-heavy views (shimmer animation)
- Empty states: Helpful illustrations + clear CTAs ("Create your first project")