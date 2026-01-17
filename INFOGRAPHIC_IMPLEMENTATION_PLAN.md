# Nano Banana 2 Infographic Integration - Implementation Plan

## Executive Summary

This document outlines the implementation plan for integrating Google's Nano Banana 2 (Gemini image generation) API into Alvia to automatically generate infographics from interview analytics data.

**Primary Model**: `gemini-3-pro-image-preview` (Nano Banana Pro)
**Fallback Model**: `gemini-2.5-flash-image` (for faster/cheaper generation)
**SDK**: `@google/genai` (v1.37.0+)

---

## API Research Summary

### Available Models

| Model | Resolution | Best For | Pricing | Text Accuracy |
|-------|-----------|----------|---------|---------------|
| `gemini-3-pro-image-preview` | Up to 4K | Professional infographics, high-fidelity text | $0.139 (1080p/2K), $0.24 (4K) | 94% legible text rendering |
| `gemini-2.5-flash-image` | 1024x1024 | Quick previews, lower cost | $0.039 per image | Good text rendering |

### Key Capabilities for Infographics

1. **Advanced Text Rendering**: Generates legible, stylized text for infographics, menus, diagrams
2. **World Knowledge Integration**: Can use Google Search grounding for factual accuracy
3. **Multi-turn Conversation**: Iterative refinement through chat interface
4. **High Resolution**: Native 1K, 2K, and 4K support
5. **Structured Data Visualization**: Capable of charts, diagrams, timelines

### Rate Limits & Quotas (2026)

**Free Tier**:
- 5-15 requests per minute (RPM)
- 100-1,000 requests per day (RPD)
- Resets daily at midnight Pacific Time

**Paid Tier 1**:
- 500 RPM
- Unlimited daily requests

**Note**: Gemini 3 Pro has no free API access (paid only)

### Authentication

- API Key from [Google AI Studio](https://aistudio.google.com/)
- Environment variable: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- Server-side only (never expose API key client-side)

---

## Architecture Design

### Data Flow

```
Collection Analytics Refresh
    ↓
Infographic Generation Request
    ↓
Format Analytics Data → Structured Prompt
    ↓
Call Gemini API (gemini-3-pro-image-preview)
    ↓
Receive Base64 Image Response
    ↓
Save to Cloud Storage (or local filesystem)
    ↓
Store Metadata in Database
    ↓
Return URL to Frontend
    ↓
Display in UI with Download Option
```

### Storage Strategy

**Option A: Local Filesystem** (MVP)
- Store in `/server/generated-infographics/`
- Serve via Express static route
- Simple, no external dependencies

**Option B: Cloud Storage** (Production)
- AWS S3 / Google Cloud Storage
- Better for multi-instance deployments
- CDN integration for faster delivery

### Database Schema Addition

```typescript
// In shared/schema.ts

export const infographics = pgTable('infographics', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  collectionId: text('collection_id').references(() => collections.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // 'collection_summary' | 'theme_network' | 'question_performance'
  model: text('model').notNull(), // 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image'
  resolution: text('resolution').notNull(), // '1080p' | '2K' | '4K'
  imageUrl: text('image_url').notNull(),
  prompt: text('prompt').notNull(), // Store for debugging/regeneration
  metadata: jsonb('metadata'), // { generatedAt, cost, attemptCount, etc. }
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## Implementation Plan

### Phase 1: Backend Infrastructure

#### 1.1 Install Dependencies

```bash
npm install @google/genai
```

#### 1.2 Create Infographic Service (`server/infographic-service.ts`)

```typescript
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createId } from '@paralleldrive/cuid2';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const INFOGRAPHICS_DIR = path.join(__dirname, '../generated-infographics');

interface InfographicConfig {
  model: 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image';
  resolution: '1080p' | '2K' | '4K';
  aspectRatio?: '16:9' | '4:3' | '1:1';
}

interface InfographicResult {
  id: string;
  imageUrl: string;
  prompt: string;
  cost: number;
  model: string;
}

export class InfographicService {
  private ai: GoogleGenAI;

  constructor() {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async generateInfographic(
    prompt: string,
    config: InfographicConfig
  ): Promise<InfographicResult> {
    const startTime = Date.now();

    try {
      // Make API call with retry logic
      const response = await this.generateWithRetry(prompt, config);

      // Extract image data
      const imageData = this.extractImageData(response);

      // Save to filesystem
      const id = createId();
      const filename = `${id}.png`;
      const filepath = path.join(INFOGRAPHICS_DIR, filename);

      await fs.mkdir(INFOGRAPHICS_DIR, { recursive: true });
      await fs.writeFile(filepath, Buffer.from(imageData, 'base64'));

      // Calculate cost
      const cost = this.calculateCost(config);

      return {
        id,
        imageUrl: `/infographics/${filename}`,
        prompt,
        cost,
        model: config.model,
      };
    } catch (error) {
      console.error('Infographic generation failed:', error);
      throw new Error(`Failed to generate infographic: ${error.message}`);
    }
  }

  private async generateWithRetry(
    prompt: string,
    config: InfographicConfig,
    maxRetries = 3
  ) {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: config.model,
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'], // Required for image generation
            imageConfig: {
              aspectRatio: config.aspectRatio || '16:9',
              imageSize: config.resolution,
            },
          },
        });

        return response;
      } catch (error) {
        lastError = error;

        // Check if rate limited
        if (error.status === 429) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on other errors
        throw error;
      }
    }

    throw lastError;
  }

  private extractImageData(response: any): string {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    throw new Error('No image data found in response');
  }

  private calculateCost(config: InfographicConfig): number {
    const costMap = {
      'gemini-3-pro-image-preview': {
        '1080p': 0.139,
        '2K': 0.139,
        '4K': 0.24,
      },
      'gemini-2.5-flash-image': {
        '1080p': 0.039,
        '2K': 0.039,
        '4K': 0.039,
      },
    };

    return costMap[config.model][config.resolution];
  }
}
```

#### 1.3 Create Prompt Templates (`server/infographic-prompts.ts`)

```typescript
import type { CollectionAnalytics } from '@shared/schema';

export class InfographicPromptBuilder {
  /**
   * Best practices for Gemini 3 Pro Image text rendering:
   * 1. Be explicit about text content, font, size, color
   * 2. Use structured format: [Subject] + [Action] + [Location] + [Style]
   * 3. Specify composition and layout clearly
   * 4. Include visual hierarchy instructions
   */

  static buildCollectionSummary(
    collectionName: string,
    analytics: CollectionAnalytics['analyticsData']
  ): string {
    const { overallStats, themes, questionPerformance } = analytics;

    // Extract top 5 themes
    const topThemes = themes
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(t => `"${t.theme}" (${t.count} mentions)`);

    // Extract quality insights
    const topIssues = overallStats.commonQualityIssues
      .slice(0, 3)
      .map(i => `${i.flag}: ${i.count}`);

    return `Create a professional research infographic titled "${collectionName} - Research Summary".

Layout Requirements:
- 16:9 landscape orientation
- Clean, modern design with ample white space
- Professional color scheme: navy blue header, teal accents, white background

Header Section (top 20%):
- Large bold title: "${collectionName}"
- Subtitle: "Interview Collection Analytics"

Key Metrics Section (middle-left 30%):
- Display these stats in large colored boxes:
  • Total Sessions: ${overallStats.totalCompletedSessions}
  • Avg Duration: ${Math.round(overallStats.avgSessionDuration)} minutes
  • Avg Quality: ${Math.round(overallStats.avgQualityScore)}/100

Top Themes Section (middle-right 40%):
- Heading: "Most Common Themes"
- Display as a vertical list with bar indicators:
${topThemes.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}

Quality Insights Section (bottom 30%):
- Heading: "Quality Analysis"
- Show top quality issues as tags/badges:
${topIssues.join(' | ')}

Footer:
- Small text: "Generated by Alvia • ${new Date().toLocaleDateString()}"

Style: Clean vector art, data visualization aesthetic, professional presentation quality.
Font: Sans-serif, readable at distance, excellent text clarity.
Ensure all text is perfectly legible and spelled correctly.`;
  }

  static buildThemeNetwork(
    themes: CollectionAnalytics['analyticsData']['themes']
  ): string {
    const topThemes = themes.sort((a, b) => b.count - a.count).slice(0, 8);

    return `Create a visual network diagram showing research theme relationships.

Title: "Theme Co-occurrence Network"

Visual Elements:
- Draw ${topThemes.length} circular nodes of varying sizes
- Node size represents frequency (larger = more mentions)
- Each node labeled with theme name in white text
- Node colors: gradient from teal (high frequency) to light blue (lower frequency)

Nodes to display:
${topThemes.map((t, i) => `- Node ${i + 1}: "${t.theme}" (${t.count} mentions)`).join('\n')}

Connections:
- Draw curved lines connecting nodes that appear together in sessions
- Line thickness represents co-occurrence strength
- Use semi-transparent lines

Layout:
- 16:9 landscape orientation
- Center the network diagram
- Add subtle grid background
- Modern, clean infographic style

Legend (bottom-right):
- Small legend showing: "Circle size = frequency"

Ensure all theme names are clearly readable within or next to their nodes.
Use professional data visualization design principles.`;
  }

  static buildQuestionPerformance(
    questions: CollectionAnalytics['analyticsData']['questionPerformance']
  ): string {
    const topQuestions = questions.slice(0, 6);

    return `Create a horizontal bar chart infographic showing question performance metrics.

Title: "Question Performance Analysis"
Subtitle: "Quality scores and engagement metrics"

Chart Layout:
- 6 horizontal bars, one per question
- Each bar shows quality score (0-100) as filled percentage
- Color code: green (80-100), yellow (60-79), orange (40-59), red (0-39)

Questions (left-aligned, truncated if needed):
${topQuestions.map((q, i) => `${i + 1}. "${q.questionText.substring(0, 60)}..."`).join('\n')}

Performance Data (on each bar):
${topQuestions.map((q, i) => `Bar ${i + 1}: Quality ${Math.round(q.avgQualityScore)}/100 | ${q.responseCount} responses | ${Math.round(q.avgWordCount)} avg words`).join('\n')}

Visual Requirements:
- 16:9 landscape orientation
- Clear axis labels
- Professional color scheme
- Large, readable text labels
- Data labels visible on or next to bars

Style: Modern data visualization, clean and professional.
Ensure all question text and numbers are perfectly legible.`;
  }
}
```

#### 1.4 Add API Endpoints (`server/routes.ts`)

```typescript
import { InfographicService } from './infographic-service';
import { InfographicPromptBuilder } from './infographic-prompts';

// Initialize service
const infographicService = new InfographicService();

// Add route for serving infographics
app.use('/infographics', express.static(path.join(__dirname, '../generated-infographics')));

// Generate collection summary infographic
app.post('/api/collections/:collectionId/infographic/summary', async (req, res) => {
  try {
    const { collectionId } = req.params;
    const { resolution = '2K', model = 'gemini-3-pro-image-preview' } = req.body;

    // Fetch collection with analytics
    const collection = await storage.getCollection(collectionId);
    if (!collection?.analyticsData) {
      return res.status(400).json({ error: 'Analytics not available. Refresh analytics first.' });
    }

    // Build prompt
    const prompt = InfographicPromptBuilder.buildCollectionSummary(
      collection.name,
      collection.analyticsData
    );

    // Generate infographic
    const result = await infographicService.generateInfographic(prompt, {
      model,
      resolution,
      aspectRatio: '16:9',
    });

    // Save to database
    await storage.saveInfographic({
      collectionId,
      type: 'collection_summary',
      model: result.model,
      resolution,
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      metadata: {
        cost: result.cost,
        generatedAt: new Date().toISOString(),
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Infographic generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get infographics for a collection
app.get('/api/collections/:collectionId/infographics', async (req, res) => {
  try {
    const { collectionId } = req.params;
    const infographics = await storage.getInfographics(collectionId);
    res.json(infographics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Phase 2: Frontend Integration

#### 2.1 Create Infographic Component (`client/src/components/InfographicViewer.tsx`)

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Loader2, Image as ImageIcon } from 'lucide-react';

interface InfographicViewerProps {
  collectionId: string;
  collectionName: string;
}

export function InfographicViewer({ collectionId, collectionName }: InfographicViewerProps) {
  const [loading, setLoading] = useState(false);
  const [infographicUrl, setInfographicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateInfographic = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/collections/${collectionId}/infographic/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: '2K', model: 'gemini-3-pro-image-preview' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate infographic');
      }

      const result = await response.json();
      setInfographicUrl(result.imageUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadInfographic = () => {
    if (!infographicUrl) return;

    const link = document.createElement('a');
    link.href = infographicUrl;
    link.download = `${collectionName}-summary.png`;
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          Collection Summary Infographic
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!infographicUrl && !loading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Generate a visual summary of your collection analytics
            </p>
            <Button onClick={generateInfographic} disabled={loading}>
              Generate Infographic
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2">Generating infographic... (15-30 seconds)</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
            {error}
          </div>
        )}

        {infographicUrl && (
          <div className="space-y-4">
            <img
              src={infographicUrl}
              alt="Collection summary infographic"
              className="w-full rounded-lg border shadow-lg"
            />
            <div className="flex gap-2">
              <Button onClick={downloadInfographic} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download PNG
              </Button>
              <Button onClick={generateInfographic} variant="outline">
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### 2.2 Add to Collection Detail Page (`client/src/pages/collection-detail.tsx`)

```typescript
import { InfographicViewer } from '@/components/InfographicViewer';

// Inside the CollectionDetail component, after the analytics section:

{collection.analyticsData && (
  <div className="mt-8">
    <InfographicViewer
      collectionId={collection.id}
      collectionName={collection.name}
    />
  </div>
)}
```

### Phase 3: Database Integration

#### 3.1 Add Schema (`shared/schema.ts`)

Add the infographics table schema as shown in the Database Schema section above.

#### 3.2 Add Storage Methods (`server/storage.ts`)

```typescript
export class DatabaseStorage {
  // ... existing methods ...

  async saveInfographic(data: {
    collectionId: string;
    type: string;
    model: string;
    resolution: string;
    imageUrl: string;
    prompt: string;
    metadata: any;
  }) {
    const id = createId();
    await this.db.insert(infographics).values({
      id,
      ...data,
    });
    return id;
  }

  async getInfographics(collectionId: string) {
    return await this.db
      .select()
      .from(infographics)
      .where(eq(infographics.collectionId, collectionId))
      .orderBy(desc(infographics.createdAt));
  }

  async deleteInfographic(id: string) {
    await this.db.delete(infographics).where(eq(infographics.id, id));
  }
}
```

#### 3.3 Push Schema to Database

```bash
npm run db:push
```

---

## Environment Variables

Add to `.env`:

```bash
# Google Gemini API
GEMINI_API_KEY=your_api_key_from_google_ai_studio

# Optional: Model configuration
GEMINI_DEFAULT_MODEL=gemini-3-pro-image-preview
GEMINI_DEFAULT_RESOLUTION=2K
```

---

## Testing Strategy

### Unit Tests
- Test prompt generation with various analytics data
- Test cost calculation for different configurations
- Test image data extraction from API responses

### Integration Tests
- Test full flow from analytics → prompt → API → storage
- Test retry logic with mock rate limiting
- Test error handling for invalid API keys

### Manual Testing Checklist
1. Generate infographic with sample collection data
2. Verify text legibility in generated image
3. Test download functionality
4. Verify database storage of metadata
5. Test regeneration (should create new entry)
6. Check cost tracking accuracy

---

## Cost Management

### Estimation
- **Gemini 3 Pro (2K)**: $0.139 per infographic
- **100 collections/month**: ~$14/month
- **Free tier**: Limited to 100-1000 requests/day

### Optimization Strategies
1. **Cache infographics**: Don't regenerate unless analytics change
2. **Use flash model for previews**: Switch to Pro only for final generation
3. **Batch generation**: Generate during off-peak hours
4. **User-initiated only**: Don't auto-generate (add explicit button)

### Monitoring
- Track generation count per day/month
- Alert if approaching rate limits
- Log costs to database for billing analysis

---

## Deployment Checklist

- [ ] Install `@google/genai` package
- [ ] Add `GEMINI_API_KEY` to environment variables
- [ ] Create `generated-infographics/` directory
- [ ] Add schema and push to database
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Test with real collection data
- [ ] Monitor API usage in Google AI Studio
- [ ] Set up cost alerts

---

## Future Enhancements

### Phase 2 Features
1. **Multiple infographic types**:
   - Theme network diagrams
   - Question performance charts
   - Session timeline visualizations

2. **Customization options**:
   - Color scheme selection
   - Template variations
   - Logo/branding overlay

3. **Export formats**:
   - PDF reports (multi-page)
   - PowerPoint slides
   - SVG for editing

4. **Iterative refinement**:
   - Chat interface to modify generated infographic
   - A/B testing of prompts
   - User feedback loop

### Phase 3 Features
1. **Scheduled generation**: Auto-generate daily/weekly summaries
2. **Email integration**: Send infographic reports via email
3. **Multi-collection comparison**: Side-by-side analysis infographics
4. **Respondent-facing**: Generate "Your Interview Summary" for respondents

---

## References

- [Nano Banana image generation - Google AI for Developers](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [@google/genai npm package](https://www.npmjs.com/package/@google/genai)
- [Nano Banana Pro prompting tips - Google Blog](https://blog.google/products/gemini/prompting-tips-nano-banana-pro/)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-17
**Author**: Claude Code Implementation Plan
