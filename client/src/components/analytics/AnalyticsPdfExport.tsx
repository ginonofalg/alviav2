import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Loader2,
  FileText,
  Users,
  BarChart3,
  Lightbulb,
  Target,
  TrendingUp,
  Layers,
  Star,
  Quote,
  CheckCircle,
  Sparkles,
  MessageSquareQuote,
} from "lucide-react";
import type { 
  ProjectAnalytics, 
  CollectionAnalytics,
  CrossTemplateTheme,
  EnhancedTheme,
  KeyFinding,
  ConsensusPoint,
  DivergencePoint,
  EnhancedQuestionPerformance,
  Recommendation,
  ThemeVerbatim,
} from "@shared/schema";

type ExportLevel = "project" | "collection";

interface ProjectExportData {
  level: "project";
  name: string;
  analytics: ProjectAnalytics;
  lastAnalyzedAt?: string;
}

interface CollectionExportData {
  level: "collection";
  name: string;
  templateName?: string;
  analytics: CollectionAnalytics;
  lastAnalyzedAt?: string;
}

type ExportData = ProjectExportData | CollectionExportData;

interface AnalyticsPdfExportProps {
  data: ExportData;
  disabled?: boolean;
}

function VerbatimItem({ verbatim }: { verbatim: ThemeVerbatim }) {
  return (
    <div className="pl-4 border-l-2 border-primary/30 py-1 my-2">
      <p className="text-sm italic">"{verbatim.quote}"</p>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    positive: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    negative: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    mixed: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[sentiment] || colors.neutral}`}>
      {sentiment}
    </span>
  );
}

function ProjectPdfContent({ data }: { data: ProjectExportData }) {
  const { analytics, name, lastAnalyzedAt } = data;

  return (
    <div className="space-y-8 p-6 bg-background text-foreground" style={{ width: "800px" }}>
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">{name} - Project Analytics Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generated: {new Date().toLocaleDateString()} | 
          Last Analyzed: {lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : "N/A"}
        </p>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Executive Summary
        </h2>
        <Card>
          <CardContent className="p-4">
            <p className="text-lg font-medium mb-4">{analytics.executiveSummary.headline}</p>
            
            {analytics.executiveSummary.keyTakeaways.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Key Takeaways</h4>
                <ul className="space-y-2">
                  {analytics.executiveSummary.keyTakeaways.map((takeaway, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      {takeaway}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analytics.executiveSummary.recommendedActions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Recommended Actions</h4>
                <ul className="space-y-2">
                  {analytics.executiveSummary.recommendedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Target className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Project Metrics
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.projectMetrics.totalTemplates}</p>
              <p className="text-sm text-muted-foreground">Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Layers className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.projectMetrics.totalCollections}</p>
              <p className="text-sm text-muted-foreground">Collections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.projectMetrics.totalSessions}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.projectMetrics.avgQualityScore}%</p>
              <p className="text-sm text-muted-foreground">Avg Quality</p>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Sentiment Distribution</h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Positive: {analytics.projectMetrics.sentimentDistribution.positive}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-sm">Neutral: {analytics.projectMetrics.sentimentDistribution.neutral}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">Negative: {analytics.projectMetrics.sentimentDistribution.negative}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {analytics.contextualRecommendations && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            Tailored Recommendations
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 p-3 bg-muted/50 rounded-md">
                <p className="text-xs font-medium text-muted-foreground mb-1">Strategic Context</p>
                <p className="text-sm">{analytics.contextualRecommendations.strategicContext}</p>
              </div>
              <p className="font-medium mb-4">{analytics.contextualRecommendations.strategicSummary}</p>
              
              {analytics.contextualRecommendations.actionItems.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Action Items
                  </h4>
                  <div className="space-y-3">
                    {analytics.contextualRecommendations.actionItems.map((item, idx) => (
                      <div key={idx} className="p-3 border rounded-md">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{item.title}</span>
                          <Badge variant={item.priority === "high" ? "destructive" : item.priority === "medium" ? "default" : "secondary"}>
                            {item.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                        {item.suggestedContent && (
                          <div className="mt-2 p-2 bg-muted/30 rounded text-sm">
                            <p className="text-xs font-medium text-muted-foreground">Suggested Content</p>
                            <p>{item.suggestedContent}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.contextualRecommendations.curatedVerbatims.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <MessageSquareQuote className="w-4 h-4 text-blue-500" />
                    Curated Quotes
                  </h4>
                  <div className="space-y-2">
                    {analytics.contextualRecommendations.curatedVerbatims.map((v, idx) => (
                      <div key={idx} className="p-3 border rounded-md bg-muted/30">
                        <p className="text-sm italic">"{v.quote}"</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{v.theme}</Badge>
                          <span>{v.usageNote}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Template Performance
        </h2>
        <div className="space-y-3">
          {analytics.templatePerformance.map((template, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{template.templateName}</h4>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{template.collectionCount} collections</span>
                      <span>{template.totalSessions} sessions</span>
                      <span>{template.avgQualityScore}% quality</span>
                    </div>
                    {template.topThemes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {template.topThemes.map((theme, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{theme}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />{template.sentimentDistribution.positive}%</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-400" />{template.sentimentDistribution.neutral}%</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" />{template.sentimentDistribution.negative}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Cross-Template Themes
        </h2>
        <div className="space-y-4">
          {analytics.crossTemplateThemes.map((theme, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{theme.theme}</h4>
                    <SentimentBadge sentiment={theme.sentiment} />
                    {theme.isStrategic && (
                      <Badge className="gap-1 text-xs">
                        <Star className="w-3 h-3" />
                        Strategic
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={theme.avgPrevalence} className="w-20" />
                    <span className="text-xs text-muted-foreground">{theme.avgPrevalence}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{theme.description}</p>
                <div className="text-xs text-muted-foreground mb-2">
                  {theme.templatesAppeared.length} templates • {theme.totalMentions} mentions
                </div>
                {theme.verbatims && theme.verbatims.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Quote className="w-3 h-3" /> Verbatims ({theme.verbatims.length})
                    </p>
                    {theme.verbatims.map((v, i) => (
                      <VerbatimItem key={i} verbatim={v} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          Strategic Insights
        </h2>
        <div className="space-y-3">
          {analytics.strategicInsights.map((insight, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium">{insight.insight}</p>
                    <p className="text-sm text-muted-foreground mt-1">{insight.significance}</p>
                    {insight.supportingTemplates.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on {insight.supportingTemplates.length} template(s)
                      </p>
                    )}
                    {insight.verbatims && insight.verbatims.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Supporting Quotes:</p>
                        {insight.verbatims.map((v, i) => (
                          <VerbatimItem key={i} verbatim={v} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function CollectionPdfContent({ data }: { data: CollectionExportData }) {
  const { analytics, name, templateName, lastAnalyzedAt } = data;

  return (
    <div className="space-y-8 p-6 bg-background text-foreground" style={{ width: "800px" }}>
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">{name} - Collection Analytics Report</h1>
        {templateName && <p className="text-sm text-muted-foreground">Template: {templateName}</p>}
        <p className="text-sm text-muted-foreground mt-1">
          Generated: {new Date().toLocaleDateString()} | 
          Last Analyzed: {lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : "N/A"}
        </p>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Overall Statistics
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.overallStats.totalCompletedSessions}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{Math.round(analytics.overallStats.avgQualityScore)}%</p>
              <p className="text-sm text-muted-foreground">Avg Quality</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Layers className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.overallStats.avgThemesPerSession.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">Themes/Session</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{analytics.overallStats.themeDepthScore}</p>
              <p className="text-sm text-muted-foreground">Depth Score</p>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Sentiment Distribution</h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Positive: {analytics.overallStats.sentimentDistribution.positive}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-sm">Neutral: {analytics.overallStats.sentimentDistribution.neutral}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">Negative: {analytics.overallStats.sentimentDistribution.negative}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {analytics.keyFindings.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Key Findings
          </h2>
          <div className="space-y-3">
            {analytics.keyFindings.map((finding, idx) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <p className="font-medium">{finding.finding}</p>
                  <p className="text-sm text-muted-foreground mt-1">{finding.significance}</p>
                  {finding.supportingVerbatims && finding.supportingVerbatims.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Supporting Quotes:</p>
                      {finding.supportingVerbatims.map((v, i) => (
                        <VerbatimItem key={i} verbatim={v} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {analytics.consensusPoints.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Consensus Points
          </h2>
          <div className="space-y-3">
            {analytics.consensusPoints.map((point, idx) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{point.topic}</span>
                    <Badge variant="outline" className="text-green-600">{point.agreementLevel}% agree</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{point.position}</p>
                  {point.verbatims && point.verbatims.length > 0 && (
                    <div className="mt-3">
                      {point.verbatims.map((v, i) => (
                        <VerbatimItem key={i} verbatim={v} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {analytics.divergencePoints.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            Divergence Points
          </h2>
          <div className="space-y-3">
            {analytics.divergencePoints.map((point, idx) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <p className="font-medium mb-2">{point.topic}</p>
                  {point.perspectives && point.perspectives.length > 0 && (
                    <div className="space-y-2">
                      {point.perspectives.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline">{p.count}x</Badge>
                          <span>{p.position}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Themes
        </h2>
        <div className="space-y-4">
          {analytics.themes.map((theme, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{theme.theme}</h4>
                    <SentimentBadge sentiment={theme.sentiment} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{theme.prevalence}% prevalence</span>
                    <span className="text-xs text-muted-foreground">Depth: {theme.depth}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{theme.description}</p>
                <p className="text-xs text-muted-foreground mb-2">{theme.count} mentions</p>
                {theme.verbatims && theme.verbatims.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Quote className="w-3 h-3" /> Verbatims ({theme.verbatims.length})
                    </p>
                    {theme.verbatims.map((v, i) => (
                      <VerbatimItem key={i} verbatim={v} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Question Performance
        </h2>
        <div className="space-y-4">
          {analytics.questionPerformance.map((q, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Q{q.questionIndex + 1}: {q.questionText}</h4>
                <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Avg Words:</span> {Math.round(q.avgWordCount)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Quality:</span> {Math.round(q.avgQualityScore)}%
                  </div>
                  <div>
                    <span className="text-muted-foreground">Responses:</span> {q.responseCount}
                  </div>
                </div>
                {q.primaryThemes && q.primaryThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {q.primaryThemes.map((theme: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{theme}</Badge>
                    ))}
                  </div>
                )}
                {q.verbatims && q.verbatims.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Responses ({q.verbatims.length}):</p>
                    {q.verbatims.map((v, i) => (
                      <VerbatimItem key={i} verbatim={v} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {analytics.recommendations.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Recommendations
          </h2>
          <div className="space-y-3">
            {analytics.recommendations.map((rec, idx) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "default" : "secondary"}>
                      {rec.priority}
                    </Badge>
                    <span className="font-medium">{rec.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  {rec.relatedThemes && rec.relatedThemes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rec.relatedThemes.map((theme: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{theme}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {analytics.overallStats.commonQualityIssues && analytics.overallStats.commonQualityIssues.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Common Quality Issues
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {analytics.overallStats.commonQualityIssues.map((issue, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-sm">{issue.flag.replace(/_/g, " ")}</span>
                    <Badge variant="secondary">{issue.count} occurrences</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

export function AnalyticsPdfExport({ data, disabled }: AnalyticsPdfExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!contentRef.current) return;

    setIsExporting(true);

    try {
      const element = contentRef.current;
      element.style.position = "absolute";
      element.style.left = "-9999px";
      element.style.top = "0";
      element.style.visibility = "visible";
      element.style.display = "block";

      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 850,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = contentWidth / (imgWidth / 2);
      const scaledHeight = (imgHeight / 2) * ratio;

      let yPosition = 0;
      let remainingHeight = scaledHeight;
      const maxContentHeight = pageHeight - margin * 2;

      while (remainingHeight > 0) {
        if (yPosition > 0) {
          pdf.addPage();
        }

        const sourceY = (yPosition / ratio) * 2;
        const sourceHeight = Math.min((maxContentHeight / ratio) * 2, imgHeight - sourceY);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imgWidth;
        tempCanvas.height = sourceHeight;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            imgWidth,
            sourceHeight,
            0,
            0,
            imgWidth,
            sourceHeight
          );
        }

        const pageImgData = tempCanvas.toDataURL("image/png");
        const pageImgHeight = (sourceHeight / 2) * ratio;

        pdf.addImage(pageImgData, "PNG", margin, margin, contentWidth, pageImgHeight);

        yPosition += maxContentHeight;
        remainingHeight -= maxContentHeight;
      }

      const filename = `${data.name.replace(/[^a-z0-9]/gi, "_")}_analytics_${new Date().toISOString().split("T")[0]}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      if (contentRef.current) {
        contentRef.current.style.position = "";
        contentRef.current.style.left = "";
        contentRef.current.style.top = "";
        contentRef.current.style.visibility = "hidden";
        contentRef.current.style.display = "none";
      }
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleExport}
        disabled={disabled || isExporting}
        variant="outline"
        data-testid="button-export-pdf"
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {isExporting ? "Exporting..." : "Export PDF"}
      </Button>

      <div
        ref={contentRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          visibility: "hidden",
          display: "none",
        }}
      >
        {data.level === "project" ? (
          <ProjectPdfContent data={data} />
        ) : (
          <CollectionPdfContent data={data} />
        )}
      </div>
    </>
  );
}
