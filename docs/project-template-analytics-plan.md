# Project & Template Level Analytics Implementation Plan

## Executive Summary

This document outlines the implementation plan for elevating analytics from Collection-level to Template-level and Project-level in the Alvia platform.

**Current State**: Analytics exist only at the Collection level (single launch of a template)

**Proposed State**: Three-tier analytics hierarchy
- **Collection Analytics** (existing) - Insights from a single launch
- **Template Analytics** (NEW) - Performance across multiple launches of the same template
- **Project Analytics** (NEW) - Strategic insights across all templates in a project

## Recommendation: Implement Both Template & Project Levels

### Template-Level Analytics - Essential for Template Optimization

**Purpose**: Track how a specific interview script performs across multiple launches

**Key Value**:
- Compare different deployments of the same template
- Identify consistently strong/weak questions
- Optimize interview templates based on performance data
- Example: "Question 3 consistently gets low engagement across all 5 collections using this template"

### Project-Level Analytics - Essential for Strategic Insights

**Purpose**: Big-picture view across all research in a project

**Key Value**:
- Cross-template theme discovery (themes appearing across different interview types)
- Executive summaries for stakeholders
- Compare different interview approaches within the same project
- Example: "Pricing concerns emerged as the top theme across all customer interviews, regardless of which template we used"

---

## Entity Relationships Recap

### Data Hierarchy
```
Workspace
  └─ Project (1)
      ├─ Template (many)
      │   ├─ Collection (many)
      │   │   ├─ Session (many)
      │   │   │   └─ Segment (many)
      │   │   └─ Analytics ✅ Exists
      │   └─ Analytics ⭐ NEW
      └─ Analytics ⭐ NEW
```

### Analytics Flow
```
Collection Analytics (exists now)
    ↓ aggregates into
Template Analytics (NEW - aggregates collections)
    ↓ aggregates into
Project Analytics (NEW - aggregates templates + AI cross-template analysis)
```

---

## What Each Level Shows

| Level | Focus | Key Metrics | AI Required? | Typical Time |
|-------|-------|-------------|--------------|--------------|
| **Collection** | Single launch insights | Themes, findings, consensus/divergence, session quality | ✅ Heavy AI | 30-60s |
| **Template** | Template performance | Question consistency, collection comparison, template effectiveness | ⚡ Minimal AI | 10-30s |
| **Project** | Strategic overview | Cross-template themes, template comparison, project-wide patterns | ✅ Moderate AI | 60-120s |

---

## Implementation Plan

### Phase 1: Database Schema Changes

**File**: `/home/user/alviav2/shared/schema.ts`

#### Add Analytics Fields to `interviewTemplates` Table

```typescript
export const interviewTemplates = pgTable("interview_templates", {
  // ... existing fields ...

  // Analytics metadata
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analyzedCollectionCount: integer("analyzed_collection_count").default(0),
  analyticsData: jsonb("analytics_data"),
});
```

#### Add Analytics Fields to `projects` Table

```typescript
export const projects = pgTable("projects", {
  // ... existing fields ...

  // Analytics metadata
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  analyzedSessionCount: integer("analyzed_session_count").default(0),
  analyticsData: jsonb("analytics_data"),
});
```

#### Create New TypeScript Types

**Template Analytics Type**:
```typescript
// Template-level analytics (focus on template performance)
export type TemplateAnalytics = {
  // Collection comparison
  collectionComparison: {
    collectionId: string;
    collectionName: string;
    completedSessions: number;
    avgQualityScore: number;
    avgDuration: number;
    topThemes: string[];
  }[];

  // Question performance across all collections
  questionPerformance: EnhancedQuestionPerformance[];

  // Template-level recommendations
  recommendations: Recommendation[];

  // Overall template stats
  overallStats: {
    totalCollections: number;
    totalCompletedSessions: number;
    avgSessionDuration: number;
    avgQualityScore: number;
    mostConsistentQuestions: number[]; // Question indices with consistent performance
    mostVariableQuestions: number[]; // Questions with inconsistent performance
  };

  generatedAt: number;
};
```

**Project Analytics Type**:
```typescript
// Project-level analytics (focus on big-picture insights)
export type ProjectAnalytics = {
  // Cross-template themes (themes appearing across multiple templates)
  crossTemplateThemes: (EnhancedTheme & {
    templateIds: string[];
    templateNames: string[];
  })[];

  // Key findings across the project
  keyFindings: KeyFinding[];

  // Template comparison
  templateComparison: {
    templateId: string;
    templateName: string;
    collectionCount: number;
    completedSessions: number;
    avgQualityScore: number;
    avgDuration: number;
    topThemes: string[];
  }[];

  // Overall project stats
  overallStats: {
    totalTemplates: number;
    totalCollections: number;
    totalCompletedSessions: number;
    avgSessionDuration: number;
    avgQualityScore: number;
    sentimentDistribution: { positive: number; neutral: number; negative: number };
  };

  generatedAt: number;
};
```

---

### Phase 2: Backend Implementation - Barbara Orchestrator

**File**: `/home/user/alviav2/server/barbara-orchestrator.ts`

#### Add Template Analytics Function

```typescript
export interface TemplateAnalysisInput {
  collections: {
    collectionId: string;
    collectionName: string;
    analytics: CollectionAnalytics;
    completedSessions: number;
  }[];
  templateQuestions: { text: string; guidance: string }[];
  templateObjective: string;
}

export async function generateTemplateAnalytics(
  input: TemplateAnalysisInput
): Promise<Omit<TemplateAnalytics, "generatedAt">> {
  // Implementation steps:
  // 1. Aggregate collection analytics
  // 2. Compare question performance across collections
  // 3. Identify consistent patterns and anomalies
  // 4. Calculate consistency scores for questions
  // 5. Generate template-specific recommendations
  // 6. Return aggregated analytics
}
```

#### Add Project Analytics Function

```typescript
export interface ProjectAnalysisInput {
  templates: {
    templateId: string;
    templateName: string;
    analytics: TemplateAnalytics | null;
    collections: {
      collectionId: string;
      collectionName: string;
      analytics: CollectionAnalytics;
    }[];
  }[];
  projectObjective: string;
}

export async function generateProjectAnalytics(
  input: ProjectAnalysisInput
): Promise<Omit<ProjectAnalytics, "generatedAt">> {
  // Implementation steps:
  // 1. Use AI to identify cross-template themes
  // 2. Extract project-level key findings
  // 3. Compare template effectiveness
  // 4. Calculate project-wide statistics
  // 5. Generate project-level recommendations
  // 6. Return project analytics
}
```

**Key Design Considerations**:
- Template analytics: Mostly aggregation logic (fast, minimal AI)
- Project analytics: Requires AI for cross-template theme extraction (slower)
- Both should have timeout protection similar to `generateCrossInterviewAnalysis()`
- Handle missing collection analytics gracefully with warnings

---

### Phase 3: Backend Implementation - Storage Layer

**File**: `/home/user/alviav2/server/storage.ts`

#### Add Methods to `IStorage` Interface and `DatabaseStorage` Class

```typescript
// Template analytics methods
async getTemplateAnalytics(templateId: string): Promise<TemplateAnalytics | null>;
async updateTemplateAnalytics(
  templateId: string,
  analytics: TemplateAnalytics,
  analyzedCollectionCount: number
): Promise<void>;

// Project analytics methods
async getProjectAnalytics(projectId: string): Promise<ProjectAnalytics | null>;
async updateProjectAnalytics(
  projectId: string,
  analytics: ProjectAnalytics,
  analyzedSessionCount: number
): Promise<void>;

// Helper to get all collections for a template with their analytics
async getCollectionsByTemplate(
  templateId: string
): Promise<Array<Collection & { analytics: CollectionAnalytics | null }>>;

// Helper to get all templates for a project with their analytics
async getTemplatesByProject(
  projectId: string
): Promise<Array<InterviewTemplate & { analytics: TemplateAnalytics | null }>>;

// Helper to count completed sessions
async getCompletedSessionCountByTemplate(templateId: string): Promise<number>;
async getCompletedSessionCountByProject(projectId: string): Promise<number>;
```

---

### Phase 4: Backend Implementation - API Routes

**File**: `/home/user/alviav2/server/routes.ts`

#### Template-Level Analytics Endpoints

```typescript
// GET /api/templates/:templateId/analytics
app.get("/api/templates/:templateId/analytics", isAuthenticated, async (req, res) => {
  try {
    const { templateId } = req.params;

    // Get template with analytics
    const template = await storage.getTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Check if user has access
    // ... workspace membership check ...

    // Get analytics from database
    const analytics = await storage.getTemplateAnalytics(templateId);

    // Check staleness
    const collections = await storage.getCollectionsByTemplate(templateId);
    const isStale = !analytics ||
                   collections.length !== template.analyzedCollectionCount ||
                   collections.some(c => !c.lastAnalyzedAt ||
                     (c.lastAnalyzedAt > template.lastAnalyzedAt));

    return res.json({
      analytics,
      isStale,
      lastAnalyzedAt: template.lastAnalyzedAt,
      analyzedCollectionCount: template.analyzedCollectionCount,
      totalCollections: collections.length,
      collectionsWithoutAnalytics: collections.filter(c => !c.analyticsData).length
    });
  } catch (error) {
    console.error("Error fetching template analytics:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// POST /api/templates/:templateId/analytics/refresh
app.post("/api/templates/:templateId/analytics/refresh", isAuthenticated, async (req, res) => {
  try {
    const { templateId } = req.params;

    // Get template
    const template = await storage.getTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Get all collections with analytics
    const collections = await storage.getCollectionsByTemplate(templateId);
    const collectionsWithAnalytics = collections.filter(c => c.analyticsData);

    if (collectionsWithAnalytics.length === 0) {
      return res.status(400).json({
        error: "No collections have analytics yet. Generate collection analytics first."
      });
    }

    // Warn if some collections are missing analytics
    const missingCount = collections.length - collectionsWithAnalytics.length;
    const warnings = missingCount > 0
      ? [`${missingCount} collection(s) without analytics will be excluded`]
      : [];

    // Get template questions
    const questions = await storage.getQuestionsByTemplate(templateId);

    // Generate template analytics
    const analyticsData = await generateTemplateAnalytics({
      collections: collectionsWithAnalytics.map(c => ({
        collectionId: c.id,
        collectionName: c.name,
        analytics: c.analyticsData as CollectionAnalytics,
        completedSessions: c.analyzedSessionCount || 0
      })),
      templateQuestions: questions.map(q => ({
        text: q.questionText,
        guidance: q.guidance || ""
      })),
      templateObjective: template.objective || ""
    });

    const fullAnalytics: TemplateAnalytics = {
      ...analyticsData,
      generatedAt: Date.now()
    };

    // Save to database
    await storage.updateTemplateAnalytics(
      templateId,
      fullAnalytics,
      collectionsWithAnalytics.length
    );

    return res.json({
      analytics: fullAnalytics,
      warnings
    });
  } catch (error) {
    console.error("Error generating template analytics:", error);
    return res.status(500).json({ error: "Failed to generate analytics" });
  }
});
```

#### Project-Level Analytics Endpoints

```typescript
// GET /api/projects/:projectId/analytics
app.get("/api/projects/:projectId/analytics", isAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project with analytics
    const project = await storage.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if user has access
    // ... workspace membership check ...

    // Get analytics from database
    const analytics = await storage.getProjectAnalytics(projectId);

    // Check staleness
    const currentSessionCount = await storage.getCompletedSessionCountByProject(projectId);
    const isStale = !analytics ||
                   currentSessionCount !== project.analyzedSessionCount;

    return res.json({
      analytics,
      isStale,
      lastAnalyzedAt: project.lastAnalyzedAt,
      analyzedSessionCount: project.analyzedSessionCount,
      currentSessionCount
    });
  } catch (error) {
    console.error("Error fetching project analytics:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// POST /api/projects/:projectId/analytics/refresh
app.post("/api/projects/:projectId/analytics/refresh", isAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project
    const project = await storage.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get all templates with their collections
    const templates = await storage.getTemplatesByProject(projectId);

    if (templates.length === 0) {
      return res.status(400).json({
        error: "Project has no templates yet."
      });
    }

    // Build input data
    const projectInput: ProjectAnalysisInput = {
      templates: await Promise.all(templates.map(async (template) => {
        const collections = await storage.getCollectionsByTemplate(template.id);
        return {
          templateId: template.id,
          templateName: template.name,
          analytics: template.analyticsData as TemplateAnalytics | null,
          collections: collections
            .filter(c => c.analyticsData)
            .map(c => ({
              collectionId: c.id,
              collectionName: c.name,
              analytics: c.analyticsData as CollectionAnalytics
            }))
        };
      })),
      projectObjective: project.objective || ""
    };

    // Check if we have enough data
    const templatesWithData = projectInput.templates.filter(t => t.collections.length > 0);
    if (templatesWithData.length === 0) {
      return res.status(400).json({
        error: "No collections have analytics yet. Generate collection analytics first."
      });
    }

    // Generate project analytics
    const analyticsData = await generateProjectAnalytics(projectInput);

    const fullAnalytics: ProjectAnalytics = {
      ...analyticsData,
      generatedAt: Date.now()
    };

    // Count total completed sessions
    const totalSessions = await storage.getCompletedSessionCountByProject(projectId);

    // Save to database
    await storage.updateProjectAnalytics(projectId, fullAnalytics, totalSessions);

    return res.json({
      analytics: fullAnalytics
    });
  } catch (error) {
    console.error("Error generating project analytics:", error);
    return res.status(500).json({ error: "Failed to generate analytics" });
  }
});
```

---

### Phase 5: Frontend Implementation - UI Components

**Create new components in** `/home/user/alviav2/client/src/components/analytics/`

#### `TemplateAnalyticsView.tsx`

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertCircle } from "lucide-react";
import { QuestionAnalysis } from "./QuestionAnalysis";
import { RecommendationsPanel } from "./RecommendationsPanel";

export function TemplateAnalyticsView({ templateId }: { templateId: string }) {
  const queryClient = useQueryClient();

  // Fetch analytics
  const { data, isLoading } = useQuery({
    queryKey: ["template-analytics", templateId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/${templateId}/analytics`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    }
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/${templateId}/analytics/refresh`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Failed to refresh analytics");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["template-analytics", templateId]);
    }
  });

  if (isLoading) return <div>Loading analytics...</div>;

  const { analytics, isStale, collectionsWithoutAnalytics } = data;

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Template Analytics</h2>
          {analytics && (
            <p className="text-sm text-muted-foreground">
              Last analyzed {new Date(analytics.lastAnalyzedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isStale && <Badge variant="warning">Out of date</Badge>}
          {collectionsWithoutAnalytics > 0 && (
            <Badge variant="secondary">
              {collectionsWithoutAnalytics} collection(s) without analytics
            </Badge>
          )}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Analytics
          </Button>
        </div>
      </div>

      {!analytics ? (
        <Card>
          <CardContent className="pt-6">
            <p>No analytics available yet. Click "Refresh Analytics" to generate.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Collections</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.totalCollections}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.totalCompletedSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Avg Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.avgQualityScore.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {Math.round(analytics.overallStats.avgSessionDuration / 60000)}m
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Collection Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Collection Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.collectionComparison.map((collection) => (
                  <div key={collection.collectionId} className="border-b pb-4 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{collection.collectionName}</h4>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>{collection.completedSessions} sessions</span>
                        <span>Quality: {collection.avgQualityScore.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {collection.topThemes.slice(0, 3).map((theme, i) => (
                        <Badge key={i} variant="secondary">{theme}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Question Performance - reuse existing component */}
          <QuestionAnalysis
            questionPerformance={analytics.questionPerformance}
          />

          {/* Recommendations - reuse existing component */}
          <RecommendationsPanel
            recommendations={analytics.recommendations}
          />
        </>
      )}
    </div>
  );
}
```

#### `ProjectAnalyticsView.tsx`

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { ThemeCard } from "./ThemeCard";
import { InsightPanel } from "./InsightPanel";
import { RecommendationsPanel } from "./RecommendationsPanel";

export function ProjectAnalyticsView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  // Fetch analytics
  const { data, isLoading } = useQuery({
    queryKey: ["project-analytics", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    }
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/analytics/refresh`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Failed to refresh analytics");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["project-analytics", projectId]);
    }
  });

  if (isLoading) return <div>Loading analytics...</div>;

  const { analytics, isStale } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Project Analytics</h2>
          {analytics && (
            <p className="text-sm text-muted-foreground">
              Last analyzed {new Date(analytics.lastAnalyzedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isStale && <Badge variant="warning">Out of date</Badge>}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Analytics
          </Button>
        </div>
      </div>

      {!analytics ? (
        <Card>
          <CardContent className="pt-6">
            <p>No analytics available yet. Click "Refresh Analytics" to generate.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall Stats */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.totalTemplates}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Collections</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.totalCollections}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.totalCompletedSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Avg Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{analytics.overallStats.avgQualityScore.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {Math.round(analytics.overallStats.avgSessionDuration / 60000)}m
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Template Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Template Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.templateComparison.map((template) => (
                  <div key={template.templateId} className="border-b pb-4 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{template.templateName}</h4>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>{template.collectionCount} collections</span>
                        <span>{template.completedSessions} sessions</span>
                        <span>Quality: {template.avgQualityScore.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {template.topThemes.slice(0, 3).map((theme, i) => (
                        <Badge key={i} variant="secondary">{theme}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cross-Template Themes - reuse ThemeCard with template badges */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Cross-Template Themes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analytics.crossTemplateThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  extraBadges={
                    <Badge variant="outline">
                      {theme.templateNames.length} template(s)
                    </Badge>
                  }
                />
              ))}
            </div>
          </div>

          {/* Key Findings - reuse InsightPanel */}
          <InsightPanel
            keyFindings={analytics.keyFindings}
          />
        </>
      )}
    </div>
  );
}
```

---

### Phase 6: Frontend Implementation - Page Updates

#### Update Template Detail Page

**File**: `/home/user/alviav2/client/src/pages/template-detail.tsx` (may need to be created)

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateAnalyticsView } from "@/components/analytics/TemplateAnalyticsView";

export function TemplateDetailPage() {
  const { templateId } = useParams();

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Existing overview content */}
        </TabsContent>

        <TabsContent value="questions">
          {/* Existing questions content */}
        </TabsContent>

        <TabsContent value="collections">
          {/* Existing collections list */}
        </TabsContent>

        <TabsContent value="analytics">
          <TemplateAnalyticsView templateId={templateId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

#### Update Project Detail Page

**File**: `/home/user/alviav2/client/src/pages/project-detail.tsx`

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectAnalyticsView } from "@/components/analytics/ProjectAnalyticsView";

export function ProjectDetailPage() {
  const { projectId } = useParams();

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Existing overview content */}
        </TabsContent>

        <TabsContent value="templates">
          {/* Existing templates list */}
        </TabsContent>

        <TabsContent value="analytics">
          <ProjectAnalyticsView projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

### Phase 7: Data Aggregation Strategy

#### Staleness Detection Logic

**Template-Level**:
```typescript
// Template is stale if:
// 1. Template has never been analyzed (lastAnalyzedAt is null)
// 2. Number of collections changed since last analysis
// 3. Any collection was analyzed more recently than the template
const isTemplateStale = !template.lastAnalyzedAt ||
                       currentCollectionCount !== template.analyzedCollectionCount ||
                       collections.some(c => c.lastAnalyzedAt > template.lastAnalyzedAt);
```

**Project-Level**:
```typescript
// Project is stale if:
// 1. Project has never been analyzed (lastAnalyzedAt is null)
// 2. Total completed session count changed since last analysis
// 3. Any template was analyzed more recently than the project
const isProjectStale = !project.lastAnalyzedAt ||
                      currentSessionCount !== project.analyzedSessionCount ||
                      templates.some(t => t.lastAnalyzedAt > project.lastAnalyzedAt);
```

#### Staleness Propagation

```
Collection refreshed → Mark Template as stale
Template refreshed → Mark Project as stale
```

Implementation: Add trigger functions or handle in the refresh endpoint after updating analytics.

#### Performance Considerations

1. **Caching Strategy**:
   - Cache all analytics in JSONB columns
   - Only regenerate when explicitly requested or detected as stale
   - Show cached data immediately, update when fresh

2. **Computation Time**:
   - Collection: 30-60s (AI analysis)
   - Template: 10-30s (aggregation)
   - Project: 60-120s (AI cross-template analysis)
   - Show loading indicators, allow background processing

3. **Cost Management**:
   - Template analytics: Minimal AI usage (mostly aggregation)
   - Project analytics: Moderate AI usage (cross-template theme extraction)
   - Consider rate limiting to prevent abuse

#### Handling Missing Data

Show clear warnings when:
- Collections without analytics exist
- Templates without analytics exist
- Provide "analyze all" batch actions
- Clearly indicate which data is included vs excluded

---

### Phase 8: Database Migration

Run database push to apply schema changes:

```bash
npm run db:push
```

This will:
- Add `lastAnalyzedAt`, `analyzedCollectionCount`, and `analyticsData` columns to `interviewTemplates`
- Add `lastAnalyzedAt`, `analyzedSessionCount`, and `analyticsData` columns to `projects`
- No data migration needed (new columns default to null)

---

## Implementation Considerations

### Hierarchical Dependencies

**Collection → Template → Project**

- Template analytics requires collections to have analytics
- Project analytics requires templates to have analytics
- Show dependency warnings in UI
- Provide clear paths to resolve dependencies

### User Experience Flow

1. **First-time user**:
   - See "No analytics available" message
   - Click "Refresh Analytics" button
   - See loading indicator with progress
   - View generated analytics

2. **Returning user**:
   - See cached analytics immediately
   - See staleness badge if out of date
   - Optional: Refresh to get latest insights

3. **Drill-down navigation**:
   - Project → click template → Template → click collection → Collection
   - Each level provides progressively more detailed insights

### Error Handling

- **Missing dependencies**: Show clear message about which level needs analytics first
- **API failures**: Show error message with retry button
- **Timeout**: Show partial results if possible, or clear timeout message
- **Rate limiting**: Queue requests and show position in queue

---

## Testing Strategy

### Unit Tests

- Test aggregation logic in `generateTemplateAnalytics()`
- Test AI prompt construction in `generateProjectAnalytics()`
- Test staleness detection logic
- Test storage methods

### Integration Tests

- Test full analytics generation flow (collection → template → project)
- Test API endpoints with authentication
- Test staleness propagation
- Test error handling

### E2E Tests

- Test analytics refresh UI flow
- Test navigation between levels
- Test loading states and error states
- Test drill-down from project to collection

---

## Success Metrics

### Technical Metrics
- Analytics generation time < 2 minutes for projects with 10 templates
- Staleness detection accuracy: 100%
- API uptime: 99.9%

### User Metrics
- % of users who use template-level analytics
- % of users who use project-level analytics
- Average time from refresh click to viewing results

### Business Metrics
- Improved template optimization (measured by quality score improvements)
- Faster insight discovery (measured by time to key findings)
- Increased user satisfaction (measured by NPS)

---

## Future Enhancements (Out of Scope)

1. **Real-time analytics**: Update as interviews complete (WebSocket integration)
2. **Custom dashboards**: User-configurable analytics views
3. **Export functionality**: PDF reports, CSV exports, PowerPoint slides
4. **Scheduled refresh**: Auto-refresh on a schedule (e.g., daily at midnight)
5. **Analytics notifications**: Email/Slack alerts when analytics become stale
6. **Comparative analytics**: Side-by-side comparison UI for projects/templates
7. **Historical tracking**: Track analytics over time, show trends
8. **Advanced AI insights**: Predictive analytics, anomaly detection, sentiment trends

---

## Critical Files for Implementation

### Priority 1 (Database & Core Logic)
1. `/home/user/alviav2/shared/schema.ts` - Add analytics fields and types
2. `/home/user/alviav2/server/barbara-orchestrator.ts` - Add generation functions
3. `/home/user/alviav2/server/storage.ts` - Add data access methods

### Priority 2 (API Layer)
4. `/home/user/alviav2/server/routes.ts` - Add 4 new endpoints (GET/POST for template and project)

### Priority 3 (Frontend)
5. `/home/user/alviav2/client/src/components/analytics/TemplateAnalyticsView.tsx` - New component
6. `/home/user/alviav2/client/src/components/analytics/ProjectAnalyticsView.tsx` - New component
7. `/home/user/alviav2/client/src/pages/template-detail.tsx` - Add analytics tab
8. `/home/user/alviav2/client/src/pages/project-detail.tsx` - Add analytics tab

---

## Timeline Estimate

This is provided for reference only - actual implementation speed may vary:

- **Phase 1 (Schema)**: 1-2 hours
- **Phase 2 (Barbara)**: 4-6 hours
- **Phase 3 (Storage)**: 2-3 hours
- **Phase 4 (API)**: 3-4 hours
- **Phase 5-6 (Frontend)**: 6-8 hours
- **Phase 7 (Testing)**: 4-6 hours
- **Phase 8 (Migration & Polish)**: 2-3 hours

**Total**: ~22-32 hours of development time

---

## Questions for Stakeholders

Before implementation, clarify:

1. Should template analytics be auto-generated when a collection is analyzed, or only on-demand?
2. What's the acceptable wait time for project analytics generation?
3. Should we implement background job processing for long-running analytics?
4. What's the priority: Template-level or Project-level first?
5. Are there specific metrics or insights that are must-haves vs nice-to-haves?
6. Should we support exporting analytics to PDF/CSV in this phase?

---

## Conclusion

This plan provides a comprehensive approach to elevating analytics from Collection-level to Template and Project levels. The implementation is structured to:

- Reuse existing analytics components where possible
- Maintain consistency with the current collection analytics pattern
- Provide clear user experience with staleness detection and refresh capabilities
- Scale efficiently with caching and on-demand generation
- Enable drill-down navigation from strategic to tactical insights

The three-tier analytics hierarchy will provide users with insights at the right level of granularity: tactical (collection), operational (template), and strategic (project).
