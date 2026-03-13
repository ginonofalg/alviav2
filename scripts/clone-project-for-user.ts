/**
 * Clone a project (with template, questions, and collection) for a new user.
 *
 * The new user doesn't need to exist yet — this script creates a placeholder
 * user record. When they log in via Clerk, syncClerkUser will automatically
 * remap the placeholder ID to their real Clerk ID (matched by email).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/clone-project-for-user.ts \
 *     --source-email="you@example.com" \
 *     --target-email="newuser@example.com" \
 *     --project-name="My Project"             # optional: filter by name if you have multiple projects
 *     --collection-name="My Collection"       # optional: filter by name if template has multiple collections
 *
 * If --project-name is omitted and you have multiple projects, it will list them and exit.
 * Same for --collection-name.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq } from "drizzle-orm";

const { Pool } = pg;

// Import schema tables
import { users } from "../shared/models/auth";
import {
  workspaces,
  workspaceMembers,
  projects,
  interviewTemplates,
  questions,
  collections,
  inviteList,
} from "../shared/schema";

// --- Parse CLI args ---
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const SOURCE_EMAIL = getArg("source-email");
const TARGET_EMAIL = getArg("target-email");
const PROJECT_NAME_FILTER = getArg("project-name");
const COLLECTION_NAME_FILTER = getArg("collection-name");

if (!SOURCE_EMAIL || !TARGET_EMAIL) {
  console.error("Usage: npx tsx scripts/clone-project-for-user.ts --source-email=... --target-email=...");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

// --- DB connection ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log(`\nCloning project from ${SOURCE_EMAIL} → ${TARGET_EMAIL}\n`);

  // 1. Find source user
  const [sourceUser] = await db.select().from(users).where(eq(users.email, SOURCE_EMAIL!));
  if (!sourceUser) {
    console.error(`Source user not found: ${SOURCE_EMAIL}`);
    process.exit(1);
  }
  console.log(`Found source user: ${sourceUser.id} (${sourceUser.email})`);

  // 2. Find source workspace
  const sourceWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, sourceUser.id));
  if (sourceWorkspaces.length === 0) {
    console.error("Source user has no workspaces");
    process.exit(1);
  }
  const sourceWorkspace = sourceWorkspaces[0];

  // 3. Find source project
  const sourceProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, sourceWorkspace.id));

  if (sourceProjects.length === 0) {
    console.error("Source user has no projects");
    process.exit(1);
  }

  let sourceProject;
  if (sourceProjects.length === 1) {
    sourceProject = sourceProjects[0];
  } else if (PROJECT_NAME_FILTER) {
    sourceProject = sourceProjects.find((p) => p.name === PROJECT_NAME_FILTER);
    if (!sourceProject) {
      console.error(`No project named "${PROJECT_NAME_FILTER}". Available:`);
      sourceProjects.forEach((p) => console.error(`  - "${p.name}"`));
      process.exit(1);
    }
  } else {
    console.error("Multiple projects found. Use --project-name to select one:");
    sourceProjects.forEach((p) => console.error(`  - "${p.name}"`));
    process.exit(1);
  }
  console.log(`Source project: "${sourceProject.name}" (${sourceProject.id})`);

  // 4. Find source templates
  const sourceTemplates = await db
    .select()
    .from(interviewTemplates)
    .where(eq(interviewTemplates.projectId, sourceProject.id));

  if (sourceTemplates.length === 0) {
    console.error("Source project has no templates");
    process.exit(1);
  }
  console.log(`Found ${sourceTemplates.length} template(s)`);

  // 5. For each template, find collections
  const templateCollections: Map<string, typeof collections.$inferSelect[]> = new Map();
  for (const t of sourceTemplates) {
    const cols = await db.select().from(collections).where(eq(collections.templateId, t.id));
    templateCollections.set(t.id, cols);
  }

  // 6. Check if target user already exists
  const [existingTarget] = await db.select().from(users).where(eq(users.email, TARGET_EMAIL!));
  if (existingTarget) {
    console.error(`Target user already exists: ${existingTarget.id}. This script is for new users.`);
    console.error("If you want to proceed anyway, manually remove the check.");
    process.exit(1);
  }

  // --- All validated, now create ---
  console.log("\n--- Creating target user and cloning data ---\n");

  const PLACEHOLDER_ID = `placeholder_${Date.now()}`;

  // 7. Create target user with placeholder ID
  const [targetUser] = await db
    .insert(users)
    .values({
      id: PLACEHOLDER_ID,
      email: TARGET_EMAIL!,
      firstName: null,
      lastName: null,
    })
    .returning();
  console.log(`Created user: ${targetUser.id} (${targetUser.email})`);

  // 8. Create workspace
  const [targetWorkspace] = await db
    .insert(workspaces)
    .values({
      name: "My Workspace",
      ownerId: targetUser.id,
    })
    .returning();
  console.log(`Created workspace: ${targetWorkspace.id}`);

  // 9. Add to workspace members
  await db.insert(workspaceMembers).values({
    workspaceId: targetWorkspace.id,
    userId: targetUser.id,
    role: "owner",
  });

  // 10. Clone project
  const [targetProject] = await db
    .insert(projects)
    .values({
      workspaceId: targetWorkspace.id,
      name: sourceProject.name,
      description: sourceProject.description,
      objective: sourceProject.objective,
      audienceContext: sourceProject.audienceContext,
      tone: sourceProject.tone,
      timingGuidance: sourceProject.timingGuidance,
      consentAudioRecording: sourceProject.consentAudioRecording,
      consentTranscriptOnly: sourceProject.consentTranscriptOnly,
      piiRedactionEnabled: sourceProject.piiRedactionEnabled,
      crossInterviewContext: sourceProject.crossInterviewContext,
      crossInterviewThreshold: sourceProject.crossInterviewThreshold,
      analyticsGuidedHypotheses: sourceProject.analyticsGuidedHypotheses,
      analyticsHypothesesMinSessions: sourceProject.analyticsHypothesesMinSessions,
      avoidRules: sourceProject.avoidRules,
      strategicContext: sourceProject.strategicContext,
      contextType: sourceProject.contextType,
      brandingLogo: sourceProject.brandingLogo,
      brandingColors: sourceProject.brandingColors,
    })
    .returning();
  console.log(`Cloned project: "${targetProject.name}" (${targetProject.id})`);

  // 11. Clone templates + questions + collections
  for (const srcTemplate of sourceTemplates) {
    const [targetTemplate] = await db
      .insert(interviewTemplates)
      .values({
        projectId: targetProject.id,
        name: srcTemplate.name,
        version: srcTemplate.version,
        objective: srcTemplate.objective,
        tone: srcTemplate.tone,
        constraints: srcTemplate.constraints,
        isActive: srcTemplate.isActive,
        defaultRecommendedFollowUps: srcTemplate.defaultRecommendedFollowUps,
      })
      .returning();
    console.log(`  Cloned template: "${targetTemplate.name}" (${targetTemplate.id})`);

    // Clone questions
    const srcQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.templateId, srcTemplate.id));

    if (srcQuestions.length > 0) {
      await db.insert(questions).values(
        srcQuestions.map((q) => ({
          templateId: targetTemplate.id,
          orderIndex: q.orderIndex,
          questionText: q.questionText,
          questionType: q.questionType,
          guidance: q.guidance,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
          multiSelectOptions: q.multiSelectOptions,
          conditionalLogic: q.conditionalLogic,
          timeHintSeconds: q.timeHintSeconds,
          recommendedFollowUps: q.recommendedFollowUps,
          isRequired: q.isRequired,
        }))
      );
      console.log(`    Cloned ${srcQuestions.length} question(s)`);
    }

    // Clone collections for this template
    const srcCollections = templateCollections.get(srcTemplate.id) || [];
    let collectionsToClone = srcCollections;

    if (COLLECTION_NAME_FILTER) {
      collectionsToClone = srcCollections.filter((c) => c.name === COLLECTION_NAME_FILTER);
      if (collectionsToClone.length === 0 && srcCollections.length > 0) {
        console.log(`    No collection named "${COLLECTION_NAME_FILTER}". Available:`);
        srcCollections.forEach((c) => console.log(`      - "${c.name}"`));
        console.log("    Skipping collections for this template.");
        continue;
      }
    }

    for (const srcCol of collectionsToClone) {
      const [targetCol] = await db
        .insert(collections)
        .values({
          templateId: targetTemplate.id,
          name: srcCol.name,
          description: srcCol.description,
          isActive: srcCol.isActive,
          targetResponses: srcCol.targetResponses,
          voiceProvider: srcCol.voiceProvider,
          realtimeModel: srcCol.realtimeModel,
          maxAdditionalQuestions: srcCol.maxAdditionalQuestions,
          endOfInterviewSummaryEnabled: srcCol.endOfInterviewSummaryEnabled,
          vadEagernessMode: srcCol.vadEagernessMode,
        })
        .returning();
      console.log(`    Cloned collection: "${targetCol.name}" (${targetCol.id})`);
    }
  }

  // 12. Add to invite list
  const [existingInvite] = await db
    .select()
    .from(inviteList)
    .where(eq(inviteList.email, TARGET_EMAIL!));

  if (!existingInvite) {
    await db.insert(inviteList).values({
      email: TARGET_EMAIL!,
      addedBy: sourceUser.id,
      notes: `Auto-added by clone script`,
    });
    console.log(`\nAdded ${TARGET_EMAIL} to invite list`);
  } else {
    console.log(`\n${TARGET_EMAIL} already on invite list`);
  }

  console.log("\n--- Done! ---");
  console.log(`When ${TARGET_EMAIL} logs in via Clerk, their placeholder ID will be`);
  console.log(`automatically remapped to their real Clerk ID by syncClerkUser.`);
  console.log(`They will see the cloned project, template(s), and collection(s) immediately.\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
