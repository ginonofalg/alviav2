import { useState } from "react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { 
  ProjectAnalytics, 
  CollectionAnalytics,
  CrossTemplateTheme,
  EnhancedTheme,
  KeyFinding,
  EnhancedQuestionPerformance,
  ThemeVerbatim,
} from "@shared/schema";

interface ProjectExportData {
  level: "project";
  name: string;
  analytics: ProjectAnalytics;
  lastAnalyzedAt?: string;
  templateNameMap?: Record<string, string>;
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

const COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  accent: [34, 197, 94] as [number, number, number],
  warning: [234, 179, 8] as [number, number, number],
  error: [239, 68, 68] as [number, number, number],
  lightGray: [243, 244, 246] as [number, number, number],
};

class PdfBuilder {
  private pdf: jsPDF;
  private y: number = 20;
  private readonly pageWidth: number;
  private readonly pageHeight: number;
  private readonly margin: number = 20;
  private readonly contentWidth: number;
  private readonly lineHeight: number = 6;

  constructor() {
    this.pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - 2 * this.margin;
  }

  private checkPageBreak(requiredHeight: number): void {
    if (this.y + requiredHeight > this.pageHeight - this.margin) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }

  private sanitizeText(text: string): string {
    return text
      .replace(/\u2212/g, "-")
      .replace(/\u2011/g, "-")
      .replace(/\u2013/g, "-")
      .replace(/\u2014/g, "-")
      .replace(/\u200B/g, "")
      .replace(/\u200C/g, "")
      .replace(/\u200D/g, "")
      .replace(/\uFEFF/g, "")
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")
      .replace(/\u2018/g, "'")
      .replace(/\u2019/g, "'")
      .replace(/\u201C/g, '"')
      .replace(/\u201D/g, '"')
      .replace(/\u2026/g, "...")
      .replace(/\u2002/g, " ")
      .replace(/\u2003/g, " ")
      .replace(/\u2009/g, " ")
      .replace(/\u200A/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/\u2010/g, "-")
      .replace(/\u00AD/g, "")
      .replace(/\u00B7/g, "-")
      .replace(/\u202F/g, " ")
      .replace(/\u2060/g, "")
      .replace(/\u2022/g, "-")
      .replace(/\u2192/g, "->")
      .replace(/\u2190/g, "<-")
      .replace(/\u2264/g, "<=")
      .replace(/\u2265/g, ">=")
      .replace(/\u2260/g, "!=")
      .replace(/[^\x00-\xFF]/g, "");
  }

  private wrapText(text: string, maxWidth: number): string[] {
    return this.pdf.splitTextToSize(this.sanitizeText(text), maxWidth);
  }

  addTitle(text: string): this {
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(18);
    this.pdf.setTextColor(...COLORS.text);
    const lines = this.wrapText(text, this.contentWidth);
    const titleLineHeight = 8;
    this.checkPageBreak(lines.length * titleLineHeight);
    lines.forEach((line) => {
      this.pdf.text(line, this.margin, this.y);
      this.y += titleLineHeight;
    });
    this.y += 2;
    return this;
  }

  addSubtitle(text: string): this {
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.muted);
    const lines = this.wrapText(text, this.contentWidth);
    const subtitleLineHeight = 5;
    this.checkPageBreak(lines.length * subtitleLineHeight);
    lines.forEach((line) => {
      this.pdf.text(line, this.margin, this.y);
      this.y += subtitleLineHeight;
    });
    this.y += 3;
    return this;
  }

  addSectionHeader(text: string): this {
    this.y += 5;
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(14);
    this.pdf.setTextColor(...COLORS.primary);
    const lines = this.wrapText(text, this.contentWidth);
    const sectionLineHeight = 7;
    this.checkPageBreak(lines.length * sectionLineHeight + 6);
    lines.forEach((line) => {
      this.pdf.text(line, this.margin, this.y);
      this.y += sectionLineHeight;
    });
    this.pdf.setDrawColor(...COLORS.primary);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(this.margin, this.y, this.margin + 40, this.y);
    this.y += 4;
    return this;
  }

  addSubsectionHeader(text: string): this {
    this.y += 3;
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(11);
    this.pdf.setTextColor(...COLORS.text);
    const lines = this.wrapText(text, this.contentWidth);
    const subLineHeight = 6;
    this.checkPageBreak(lines.length * subLineHeight);
    lines.forEach((line) => {
      this.pdf.text(line, this.margin, this.y);
      this.y += subLineHeight;
    });
    this.y += 1;
    return this;
  }

  addParagraph(text: string): this {
    if (!text) return this;
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.text);
    const lines = this.wrapText(text, this.contentWidth);
    const height = lines.length * this.lineHeight;
    this.checkPageBreak(height);
    lines.forEach((line) => {
      this.pdf.text(line, this.margin, this.y);
      this.y += this.lineHeight;
    });
    this.y += 2;
    return this;
  }

  addBulletList(items: string[]): this {
    if (!items || items.length === 0) return this;
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.text);
    
    items.forEach((item) => {
      const bulletIndent = this.margin + 5;
      const lines = this.wrapText(item, this.contentWidth - 10);
      const height = lines.length * this.lineHeight;
      this.checkPageBreak(height);
      
      this.pdf.text("-", this.margin, this.y);
      lines.forEach((line, idx) => {
        this.pdf.text(line, idx === 0 ? bulletIndent : bulletIndent, this.y);
        this.y += this.lineHeight;
      });
    });
    this.y += 2;
    return this;
  }

  addNumberedList(items: string[]): this {
    if (!items || items.length === 0) return this;
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.text);
    
    items.forEach((item, index) => {
      const numIndent = this.margin + 8;
      const lines = this.wrapText(item, this.contentWidth - 12);
      const height = lines.length * this.lineHeight;
      this.checkPageBreak(height);
      
      this.pdf.text(`${index + 1}.`, this.margin, this.y);  
      lines.forEach((line, idx) => {
        this.pdf.text(line, idx === 0 ? numIndent : numIndent, this.y);
        this.y += this.lineHeight;
      });
    });
    this.y += 2;
    return this;
  }

  addQuote(text: string, attribution?: string): this {
    if (!text) return this;
    this.pdf.setFont("helvetica", "italic");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.muted);
    
    const quoteText = `"${text}"`;
    const lines = this.wrapText(quoteText, this.contentWidth - 10);
    const height = lines.length * this.lineHeight + (attribution ? this.lineHeight : 0);
    this.checkPageBreak(height);
    
    this.pdf.setDrawColor(...COLORS.primary);
    this.pdf.setLineWidth(0.8);
    const startY = this.y - 2;
    
    lines.forEach((line) => {
      this.pdf.text(line, this.margin + 5, this.y);
      this.y += this.lineHeight;
    });
    
    this.pdf.line(this.margin, startY, this.margin, this.y - 2);
    
    if (attribution) {
      this.pdf.setFont("helvetica", "normal");
      this.pdf.setFontSize(9);
      this.pdf.text(this.sanitizeText(`— ${attribution}`), this.margin + 5, this.y);
      this.y += this.lineHeight;
    }
    this.y += 3;
    return this;
  }

  addKeyValue(label: string, value: string | number): this {
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...COLORS.muted);
    this.checkPageBreak(this.lineHeight);
    this.pdf.text(this.sanitizeText(`${label}:`), this.margin, this.y);
    
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setTextColor(...COLORS.text);
    this.pdf.text(this.sanitizeText(String(value)), this.margin + 35, this.y);
    this.y += this.lineHeight;
    return this;
  }

  addMetricsGrid(metrics: { label: string; value: string | number }[]): this {
    if (!metrics || metrics.length === 0) return this;
    const cols = Math.min(4, metrics.length);
    const colWidth = this.contentWidth / cols;
    this.checkPageBreak(25);
    
    const startX = this.margin;
    const startY = this.y;
    
    metrics.forEach((metric, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = startX + col * colWidth;
      const y = startY + row * 20;
      
      if (row > 0 && col === 0) {
        this.checkPageBreak(20);
      }
      
      this.pdf.setFillColor(...COLORS.lightGray);
      this.pdf.roundedRect(x, y - 3, colWidth - 3, 18, 2, 2, "F");
      
      this.pdf.setFont("helvetica", "bold");
      this.pdf.setFontSize(14);
      this.pdf.setTextColor(...COLORS.primary);
      this.pdf.text(this.sanitizeText(String(metric.value)), x + 3, y + 5);
      
      this.pdf.setFont("helvetica", "normal");
      this.pdf.setFontSize(8);
      this.pdf.setTextColor(...COLORS.muted);
      this.pdf.text(this.sanitizeText(metric.label), x + 3, y + 11);
    });
    
    const rows = Math.ceil(metrics.length / cols);
    this.y = startY + rows * 20 + 5;
    return this;
  }

  addBadge(text: string, color: [number, number, number] = COLORS.primary): this {
    this.pdf.setFont("helvetica", "bold");
    this.pdf.setFontSize(8);
    const sanitized = this.sanitizeText(text).toUpperCase();
    const textWidth = this.pdf.getTextWidth(sanitized) + 4;
    this.pdf.setFillColor(...color);
    this.pdf.roundedRect(this.margin, this.y - 3, textWidth, 5, 1, 1, "F");
    this.pdf.setTextColor(255, 255, 255);
    this.pdf.text(sanitized, this.margin + 2, this.y);
    this.y += 6;
    return this;
  }

  addTagLine(label: string, tags: string[]): this {
    if (!tags || tags.length === 0) return this;
    this.checkPageBreak(10);
    
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(...COLORS.muted);
    const sanitizedLabel = this.sanitizeText(label);
    this.pdf.text(`${sanitizedLabel}:`, this.margin, this.y);
    
    let x = this.margin + this.pdf.getTextWidth(`${sanitizedLabel}: `);
    this.pdf.setFontSize(8);
    
    tags.forEach((tag) => {
      const tagText = this.sanitizeText(tag);
      const tagWidth = this.pdf.getTextWidth(tagText) + 4;
      
      if (x + tagWidth > this.pageWidth - this.margin) {
        this.y += this.lineHeight;
        x = this.margin;
        this.checkPageBreak(this.lineHeight);
      }
      
      this.pdf.setFillColor(...COLORS.lightGray);
      this.pdf.roundedRect(x, this.y - 3, tagWidth, 5, 1, 1, "F");
      this.pdf.setTextColor(...COLORS.text);
      this.pdf.text(tagText, x + 2, this.y);
      x += tagWidth + 2;
    });
    
    this.y += 6;
    return this;
  }

  addSpacer(height: number = 5): this {
    this.y += height;
    return this;
  }

  addDivider(): this {
    this.checkPageBreak(5);
    this.y += 3;
    this.pdf.setDrawColor(...COLORS.lightGray);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 5;
    return this;
  }

  save(filename: string): void {
    this.pdf.save(filename);
  }
}

function buildProjectPdf(data: ProjectExportData): PdfBuilder {
  const { analytics, name, lastAnalyzedAt, templateNameMap = {} } = data;
  const builder = new PdfBuilder();
  
  const getTemplateName = (id: string) => templateNameMap[id] || id;
  
  const themeNameMap: Record<string, string> = {};
  analytics.crossTemplateThemes?.forEach((t, index) => {
    themeNameMap[`theme_${index + 1}`] = t.theme;
  });
  const getThemeName = (id: string) => themeNameMap[id] || id;

  builder
    .addTitle(`${name} - Project Analytics Report`)
    .addSubtitle(`Generated: ${new Date().toLocaleDateString()} | Last Analyzed: ${lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : "N/A"}`)
    .addDivider();

  builder.addSectionHeader("Executive Summary");
  builder.addParagraph(analytics.executiveSummary.headline);
  
  if (analytics.executiveSummary.keyTakeaways.length > 0) {
    builder.addSubsectionHeader("Key Takeaways");
    builder.addBulletList(analytics.executiveSummary.keyTakeaways);
  }
  
  if (analytics.executiveSummary.recommendedActions.length > 0) {
    builder.addSubsectionHeader("Recommended Actions");
    builder.addNumberedList(analytics.executiveSummary.recommendedActions);
  }

  builder.addSectionHeader("Project Metrics");
  builder.addMetricsGrid([
    { label: "Templates", value: analytics.projectMetrics.totalTemplates },
    { label: "Collections", value: analytics.projectMetrics.totalCollections },
    { label: "Sessions", value: analytics.projectMetrics.totalSessions },
    { label: "Avg Quality", value: `${analytics.projectMetrics.avgQualityScore}%` },
  ]);
  
  builder.addSubsectionHeader("Sentiment Distribution");
  builder.addKeyValue("Positive", `${analytics.projectMetrics.sentimentDistribution.positive}%`);
  builder.addKeyValue("Neutral", `${analytics.projectMetrics.sentimentDistribution.neutral}%`);
  builder.addKeyValue("Negative", `${analytics.projectMetrics.sentimentDistribution.negative}%`);

  if (analytics.contextualRecommendations) {
    builder.addSectionHeader("Tailored Recommendations");
    
    if (analytics.contextualRecommendations.strategicContext) {
      builder.addSubsectionHeader("Strategic Context");
      builder.addParagraph(analytics.contextualRecommendations.strategicContext);
    }
    
    if (analytics.contextualRecommendations.actionItems?.length) {
      builder.addSubsectionHeader("Action Items");
      analytics.contextualRecommendations.actionItems.forEach((item) => {
        const priorityColor = item.priority === "high" ? COLORS.error : 
                             item.priority === "medium" ? COLORS.warning : COLORS.accent;
        builder.addBadge(item.priority, priorityColor);
        builder.addSubsectionHeader(item.title);
        builder.addParagraph(item.description);
        if (item.relatedThemes?.length) {
          const themeNames = item.relatedThemes.map(getThemeName);
          builder.addTagLine("Related Themes", themeNames);
        }
        builder.addSpacer(2);
      });
    }
    
    if (analytics.contextualRecommendations.strategicSummary) {
      builder.addSubsectionHeader("Strategic Summary");
      builder.addParagraph(analytics.contextualRecommendations.strategicSummary);
    }
  }

  if (analytics.crossTemplateThemes?.length) {
    builder.addSectionHeader("Cross-Template Themes");
    
    analytics.crossTemplateThemes.forEach((theme: CrossTemplateTheme, idx) => {
      builder.addSubsectionHeader(`${idx + 1}. ${theme.theme}`);
      builder.addParagraph(theme.description);
      builder.addKeyValue("Prevalence", `${theme.avgPrevalence}%`);
      builder.addKeyValue("Sentiment", theme.sentiment);
      builder.addKeyValue("Strategic", theme.isStrategic ? "Yes" : "No");
      
      if (theme.templatesAppeared?.length) {
        const templateNames = theme.templatesAppeared.map(getTemplateName);
        builder.addTagLine("Templates", templateNames);
      }
      
      if (theme.verbatims?.length) {
        builder.addSubsectionHeader("Supporting Evidence");
        theme.verbatims.slice(0, 5).forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.strategicInsights?.length) {
    builder.addSectionHeader("Strategic Insights");
    
    analytics.strategicInsights.forEach((insight) => {
      builder.addSubsectionHeader(insight.insight);
      builder.addParagraph(insight.significance);
      
      if (insight.supportingTemplates?.length) {
        const templateNames = insight.supportingTemplates.map(getTemplateName);
        builder.addTagLine("Supporting Templates", templateNames);
      }
      
      if (insight.verbatims?.length) {
        builder.addSubsectionHeader("Supporting Quotes");
        insight.verbatims.slice(0, 3).forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.recommendations?.length) {
    builder.addSectionHeader("Recommendations");
    
    analytics.recommendations.forEach((rec) => {
      const priorityColor = rec.priority === "high" ? COLORS.error : 
                           rec.priority === "medium" ? COLORS.warning : COLORS.accent;
      builder.addBadge(rec.priority, priorityColor);
      builder.addSubsectionHeader(rec.title);
      builder.addParagraph(rec.description);
      
      if (rec.relatedThemes?.length) {
        const themeNames = rec.relatedThemes.map(getThemeName);
        builder.addTagLine("Related Themes", themeNames);
      }
      builder.addSpacer();
    });
  }

  return builder;
}

function buildCollectionPdf(data: CollectionExportData): PdfBuilder {
  const { analytics, name, templateName, lastAnalyzedAt } = data;
  const builder = new PdfBuilder();
  
  const themeNameMap: Record<string, string> = {};
  analytics.themes?.forEach((t, index) => {
    themeNameMap[t.id] = t.theme;
    themeNameMap[`theme_${index + 1}`] = t.theme;
  });
  const getThemeName = (id: string) => themeNameMap[id] || id;

  builder
    .addTitle(`${name} - Collection Analytics Report`)
    .addSubtitle(`Template: ${templateName || "N/A"} | Generated: ${new Date().toLocaleDateString()} | Last Analyzed: ${lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : "N/A"}`)
    .addDivider();

  builder.addSectionHeader("Overall Statistics");
  const avgDurationMins = analytics.overallStats.avgSessionDuration 
    ? Math.round(analytics.overallStats.avgSessionDuration / 60) 
    : 0;
  builder.addMetricsGrid([
    { label: "Completed Sessions", value: analytics.overallStats.totalCompletedSessions || 0 },
    { label: "Avg Duration", value: `${avgDurationMins}min` },
    { label: "Avg Quality", value: `${analytics.overallStats.avgQualityScore || 0}%` },
    { label: "Theme Depth", value: `${analytics.overallStats.themeDepthScore || 0}%` },
  ]);
  
  builder.addSubsectionHeader("Sentiment Distribution");
  builder.addKeyValue("Positive", `${analytics.overallStats.sentimentDistribution.positive}%`);
  builder.addKeyValue("Neutral", `${analytics.overallStats.sentimentDistribution.neutral}%`);
  builder.addKeyValue("Negative", `${analytics.overallStats.sentimentDistribution.negative}%`);

  if (analytics.themes?.length) {
    builder.addSectionHeader("Key Themes");
    
    analytics.themes.forEach((theme: EnhancedTheme, idx) => {
      builder.addSubsectionHeader(`${idx + 1}. ${theme.theme}`);
      builder.addParagraph(theme.description);
      builder.addKeyValue("Prevalence", `${theme.prevalence}%`);
      builder.addKeyValue("Sentiment", theme.sentiment);
      builder.addKeyValue("Depth", theme.depth.replace(/_/g, " "));
      
      if (theme.subThemes?.length) {
        builder.addTagLine("Subthemes", theme.subThemes);
      }
      
      if (theme.verbatims?.length) {
        builder.addSubsectionHeader("Supporting Quotes");
        theme.verbatims.forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.keyFindings?.length) {
    builder.addSectionHeader("Key Findings");
    
    analytics.keyFindings.forEach((finding: KeyFinding, idx) => {
      builder.addSubsectionHeader(`${idx + 1}. ${finding.finding}`);
      builder.addParagraph(finding.significance);
      
      if (finding.relatedThemes?.length) {
        const themeNames = finding.relatedThemes.map(getThemeName);
        builder.addTagLine("Related Themes", themeNames);
      }
      
      if (finding.supportingVerbatims?.length) {
        builder.addSubsectionHeader("Supporting Quotes");
        finding.supportingVerbatims.forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.consensusPoints?.length) {
    builder.addSectionHeader("Consensus Points");
    
    analytics.consensusPoints.forEach((point) => {
      builder.addSubsectionHeader(point.topic);
      builder.addParagraph(point.position);
      builder.addKeyValue("Agreement Level", `${point.agreementLevel}%`);
      
      if (point.verbatims?.length) {
        point.verbatims.slice(0, 2).forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.divergencePoints?.length) {
    builder.addSectionHeader("Divergence Points");
    
    analytics.divergencePoints.forEach((point) => {
      builder.addSubsectionHeader(point.topic);
      
      if (point.perspectives?.length) {
        point.perspectives.forEach((p) => {
          builder.addParagraph(`${p.position} (${p.count} respondents)`);
          if (p.verbatims?.length) {
            p.verbatims.slice(0, 1).forEach((v: ThemeVerbatim) => {
              builder.addQuote(v.quote);
            });
          }
        });
      }
      builder.addSpacer();
    });
  }

  if (analytics.questionPerformance?.length) {
    builder.addSectionHeader("Question Performance");
    
    analytics.questionPerformance.forEach((q: EnhancedQuestionPerformance, idx) => {
      builder.addSubsectionHeader(`Q${idx + 1}: ${q.questionText}`);
      builder.addKeyValue("Responses", q.responseCount);
      builder.addKeyValue("Avg Quality", `${q.avgQualityScore}%`);
      builder.addKeyValue("Response Richness", q.responseRichness);
      builder.addKeyValue("Perspective Range", q.perspectiveRange);
      
      if (q.primaryThemes?.length) {
        const themeNames = q.primaryThemes.map(getThemeName);
        builder.addTagLine("Themes", themeNames);
      }
      
      if (q.verbatims?.length) {
        builder.addSubsectionHeader("All Responses");
        q.verbatims.forEach((v: ThemeVerbatim) => {
          builder.addQuote(v.quote);
        });
      }
      builder.addDivider();
    });
  }

  if (analytics.recommendations?.length) {
    builder.addSectionHeader("Recommendations");
    
    analytics.recommendations.forEach((rec) => {
      const priorityColor = rec.priority === "high" ? COLORS.error : 
                           rec.priority === "medium" ? COLORS.warning : COLORS.accent;
      builder.addBadge(rec.priority, priorityColor);
      builder.addSubsectionHeader(rec.title);
      builder.addParagraph(rec.description);
      
      if (rec.relatedThemes?.length) {
        const themeNames = rec.relatedThemes.map(getThemeName);
        builder.addTagLine("Related Themes", themeNames);
      }
      builder.addSpacer();
    });
  }

  if (analytics.overallStats.commonQualityIssues?.length) {
    builder.addSectionHeader("Common Quality Issues");
    builder.addBulletList(
      analytics.overallStats.commonQualityIssues.map((issue) => 
        `${issue.flag.replace(/_/g, " ")}: ${issue.count} occurrences`
      )
    );
  }

  return builder;
}

export function AnalyticsPdfExport({ data, disabled }: AnalyticsPdfExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const builder = data.level === "project" 
        ? buildProjectPdf(data)
        : buildCollectionPdf(data);

      const filename = `${data.name.replace(/[^a-z0-9]/gi, "_")}_analytics_${new Date().toISOString().split("T")[0]}.pdf`;
      builder.save(filename);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
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
  );
}
