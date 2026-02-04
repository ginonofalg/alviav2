# Repository Guidelines

## Project Structure & Module Organization
- `client/` is the Vite React frontend. Main code lives in `client/src/`; static assets in `client/public/`.
- `server/` contains Express APIs, WebSocket interview handling, and provider integrations.
- `shared/` holds shared models and the Drizzle schema (`shared/schema.ts`).
- `scripts/` and `script/` include tooling (e.g., `script/build.ts`). `dist/` is production output.

## Build, Test, and Development Commands
- `npm run dev`: start the dev server (port 5000, Vite HMR).
- `npm run check`: TypeScript typecheck.
- `npm run build`: production build via `script/build.ts` (esbuild + Vite).
- `npm run start`: run the compiled server (`dist/index.cjs`).
- `npm run db:push`: apply schema changes with Drizzle.

## Coding Style & Naming Conventions
- TypeScript (ESM). Indentation is 2 spaces, matching existing files.
- Components are `PascalCase` in `client/src/components/`.
- Use feature-descriptive filenames (e.g., `voice-interview.ts`, `realtime-providers.ts`).
- Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`.
- UI follows `design_guidelines.md` (Tailwind, Radix/shadcn patterns).

## Testing Guidelines
- No formal test suite in-repo today.
- Minimum validation: `npm run check`.
- If adding tests, use `*.test.ts` or `*.spec.ts` near the module or in a `tests/` folder.

## Architecture Overview
- Voice interviews use WebSockets (`/ws/interview`) bridging client audio to a realtime provider.
- Providers: OpenAI Realtime (default) or xAI Grok, selected by `REALTIME_PROVIDER`.
- Barbara orchestrator analyzes transcripts and guides interviews in real time.
- Database access goes through `server/storage.ts`; schema types originate in `shared/schema.ts`.

## Configuration & Secrets
- Required: `DATABASE_URL`, `OPENAI_API_KEY`.
- Common optional: `SESSION_SECRET`, `REALTIME_PROVIDER`, `XAI_API_KEY`, `GEMINI_API_KEY`, `INVITE_ONLY_MODE`, `BASE_URL`.
- Never commit secrets; document new env vars in PRs.

## Commit & Pull Request Guidelines
- Commit messages are short, descriptive sentences (no enforced conventional format).
- PRs should include summary, testing notes (e.g., `npm run check`), and screenshots for UI changes.
