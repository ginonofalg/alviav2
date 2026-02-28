# Plan: Project-Level Interview Color Palette

## Context

The branding system currently supports only a logo (`brandingLogo` on the projects table). Interview pages use hardcoded CSS custom properties (HSL-based) for all colors. This change adds a project-level color palette so researchers can customize the look of the public interview journey (consent → welcome → interview → complete) to match their brand.

Colors are configurable via 4 slots: **primary/button**, **background**, **text**, and **accent**. Colors can be picked manually (react-colorful picker + hex input) or auto-extracted from the uploaded branding logo using Canvas API dominant color extraction.

---

## Phase 1: Foundation (types + schema + utilities)

### 1.1 Create `shared/types/branding.ts` (~40 lines)
- `BrandingColors` interface: `{ primary: string; background: string; foreground: string; accent?: string }` (all hex strings)
- Zod validation schema `brandingColorsSchema` with hex pattern `/^#[0-9a-fA-F]{6}$/`
- Export from `shared/types/index.ts`

### 1.2 Add DB column in `shared/schema.ts` (line ~134)
- Add `brandingColors: jsonb("branding_colors")` to the `projects` table, after `brandingLogo`
- Run `npm run db:push`

### 1.3 Create `client/src/lib/color-utils.ts` (~130 lines)
- `hexToHsl(hex)` → `{ h, s, l }`
- `hslToCssValue({ h, s, l })` → `"217 91% 48%"` (bare HSL format matching `index.css` vars)
- `getContrastColor(hex)` → `"#ffffff"` or `"#000000"` (WCAG 2.0 luminance check)
- `deriveColorVariables(colors: BrandingColors)` → `Record<string, string>` — computes ~15 CSS var overrides from the 4 base colors:
  - `--primary`, `--primary-foreground` (contrast-derived)
  - `--background`, `--foreground`
  - `--accent` (from accent or desaturated primary), `--accent-foreground`
  - `--muted`, `--muted-foreground`, `--card`, `--card-foreground`
  - `--border`, `--input`, `--ring`, `--secondary`, `--secondary-foreground`
- `extractDominantColors(imageDataUrl, count=5)` → `Promise<string[]>` — Canvas API pixel sampling on 50×50 canvas + median-cut quantization, filtering near-white/near-black

---

## Phase 2: Server API

### 2.1 Update `server/routes/projects.routes.ts`
- Add `brandingColors` to the project create/update validation schema (using `brandingColorsSchema.optional()`)
- Already passes through to storage layer via spread — no storage.ts changes needed

### 2.2 Update `server/routes/collections.routes.ts`
- `GET /api/collections/:id/public` — add `brandingColors` to the response alongside `brandingLogo`

### 2.3 Update `server/routes/interview-access.routes.ts`
- `GET /api/interview/:sessionId` — add `brandingColors` from the project to the response
- `GET /api/interview/resume/:token` — same

---

## Phase 3: Interview Page Theming

### 3.1 Create `client/src/components/BrandingThemeProvider.tsx` (~40 lines)
- Takes `brandingColors?: BrandingColors | null` + `children`
- Uses `deriveColorVariables()` to compute CSS custom properties
- Renders a `<div style={vars} className="contents">` wrapper (no layout impact)
- When branding colors are set, forces light mode within scope (disables `.dark` overrides)
- When `null`, renders children directly with no wrapper

### 3.2 Wrap interview pages
Each page gets the `BrandingThemeProvider` wrapper around its root content:

- **`interview-consent.tsx`** — already fetches `publicInfo` with `brandingLogo`; extend type to include `brandingColors`, wrap root div
- **`interview-welcome.tsx`** — already fetches `interviewData` with `brandingLogo`; extend type, wrap root div
- **`interview.tsx`** — already has `InterviewData` with `brandingLogo`; extend type, wrap both ready-screen and main interview returns
- **`interview-complete.tsx`** — static page with no session context; store `brandingColors` in `sessionStorage` before navigating to complete, read on mount

### 3.3 No changes to `BrandedWelcomeAvatar.tsx`
- It uses `bg-primary` and `border-primary` — these automatically inherit from the `BrandingThemeProvider` ancestor

---

## Phase 4: Color Picker UI

### 4.1 Install dependency
- `npm install react-colorful` (~2.4KB gzipped, zero deps, accessible)

### 4.2 Create `client/src/components/BrandingColorPicker.tsx` (~280 lines)

**Props:** `{ brandingLogo?: string | null; brandingColors: BrandingColors | null; onColorsChange: (colors: BrandingColors | null) => void }`

**Sections:**

1. **Extract from logo** (shown when `brandingLogo` is set):
   - "Extract colors" button → runs `extractDominantColors(brandingLogo)`
   - Displays 5 color swatches as clickable circles
   - Clicking a swatch → dropdown menu: "Use as Button Color", "Use as Background", "Use as Text Color", "Use as Accent"

2. **Manual color pickers** (4 labeled sections):
   - **Button/Primary Color** — `HexColorPicker` from react-colorful + hex text input
   - **Background Color** — same
   - **Text Color** — same
   - **Accent Color** — same (collapsible, optional)
   - Each shows a small color preview swatch

3. **Live preview panel**:
   - Mini mockup card styled with the current branding colors showing:
     - Background color
     - Avatar ring in primary color
     - "Begin Interview" button with primary bg + auto-computed foreground text
     - Sample body text in foreground color
     - Consent checkbox ring in accent color
     - Muted text sample in derived muted-foreground
   - Wraps the mockup in `BrandingThemeProvider` for accurate rendering

4. **Actions**:
   - "Reset to Default" — clears colors to null
   - WCAG contrast warning banner if primary↔primary-foreground or background↔foreground contrast ratio < 4.5:1

### 4.3 Integrate into `project-edit.tsx` branding tab (lines 380-480)

- Add state: `const [brandingColors, setBrandingColors] = useState<BrandingColors | null>(null)`
- Load from project in the existing `useEffect` (line 116): `setBrandingColors(project.brandingColors ?? null)`
- Include in mutation payload (line 152): `brandingColors,`
- Render `<BrandingColorPicker>` below the existing logo upload section in the branding tab
- The color picker appears under the logo section with a separator

---

## Phase 5: Verification

### Type checking
- `npm run check` — ensure no TypeScript errors

### Manual testing flow
1. Go to Project Edit → Branding tab
2. Upload a logo → click "Extract colors" → verify 5 swatches appear
3. Click a swatch → assign to button color → verify picker updates
4. Manually adjust background and text colors
5. Verify live preview updates in real-time
6. Save → open an interview link (`/join/:collectionId`)
7. Verify consent page uses branded colors (background, button, text, accent)
8. Proceed through welcome → interview → complete and verify colors persist
9. Test with NO branding colors → verify default blue theme unchanged
10. Test contrast warning appears when choosing low-contrast combinations

### Regression
- `npx vitest` — run existing tests
- Verify existing interview flow works with no branding colors set

---

## Files Modified (existing)

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `brandingColors` JSONB column |
| `shared/types/index.ts` | Re-export branding types |
| `server/routes/projects.routes.ts` | Validate `brandingColors` in create/update |
| `server/routes/collections.routes.ts` | Return `brandingColors` in public endpoint |
| `server/routes/interview-access.routes.ts` | Return `brandingColors` in both endpoints |
| `client/src/pages/project-edit.tsx` | Add color picker to branding tab, state, mutation |
| `client/src/pages/interview-consent.tsx` | Wrap with BrandingThemeProvider |
| `client/src/pages/interview-welcome.tsx` | Wrap with BrandingThemeProvider |
| `client/src/pages/interview.tsx` | Wrap with BrandingThemeProvider |
| `client/src/pages/interview-complete.tsx` | Read brandingColors from sessionStorage, wrap |

## Files Created (new)

| File | Purpose | ~Lines |
|------|---------|--------|
| `shared/types/branding.ts` | BrandingColors type + Zod schema | ~40 |
| `client/src/lib/color-utils.ts` | Hex↔HSL conversion, derived vars, dominant color extraction | ~130 |
| `client/src/components/BrandingThemeProvider.tsx` | CSS variable override wrapper for interview pages | ~40 |
| `client/src/components/BrandingColorPicker.tsx` | Color picker UI with logo extraction + live preview | ~280 |
