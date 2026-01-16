import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Clock, 
  Calendar,
  MessageSquare,
  Quote,
  FileText,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download
} from "lucide-react";
import type { InterviewSession, Segment, Question, QuestionSummary } from "@shared/schema";
import { format, formatDuration, intervalToDuration } from "date-fns";

interface TranscriptEntry {
  text: string;
  speaker: "alvia" | "respondent";
  timestamp: number;
  questionIndex: number;
}

interface SessionWithDetails extends InterviewSession {
  segments?: (Segment & { question?: Question })[];
}

function QualityFlag({ flag }: { flag: string }) {
  const config: Record<string, { icon: React.ElementType; color: string }> = {
    incomplete: { icon: AlertTriangle, color: "text-yellow-500" },
    ambiguous: { icon: Info, color: "text-blue-500" },
    contradiction: { icon: AlertTriangle, color: "text-orange-500" },
    distress_cue: { icon: AlertTriangle, color: "text-red-500" },
  };
  const { icon: Icon, color } = config[flag] || { icon: Info, color: "text-muted-foreground" };

  return (
    <Badge variant="outline" className={`gap-1 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {flag.replace("_", " ")}
    </Badge>
  );
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const level = confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low";
  const colors = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-3 rounded-sm ${
              i < Math.ceil(confidence / 20) ? colors[level] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{confidence}%</span>
    </div>
  );
}

function SegmentCard({ segment, index }: { segment: Segment & { question?: Question }; index: number }) {
  const keyQuotes = (segment.keyQuotes as any[]) || [];
  const summaryBullets = segment.summaryBullets || [];
  const qualityFlags = segment.qualityFlags || [];

  return (
    <Card className="mb-4" data-testid={`card-segment-${segment.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
              {segment.question?.questionType && (
                <Badge variant="secondary" className="text-xs">
                  {segment.question.questionType.replace("_", " ")}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-medium">
              {segment.question?.questionText || "Question"}
            </CardTitle>
          </div>
          {segment.confidence && (
            <ConfidenceIndicator confidence={segment.confidence} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summaryBullets.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Summary
            </h4>
            <ul className="space-y-1.5">
              {summaryBullets.map((bullet, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {keyQuotes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Quote className="w-4 h-4 text-primary" />
              Key Quotes
            </h4>
            <div className="space-y-2">
              {keyQuotes.map((quote: any, i: number) => (
                <blockquote 
                  key={i} 
                  className="border-l-2 border-primary/30 pl-3 py-1 bg-yellow-500/5 rounded-r"
                >
                  <p className="text-sm italic">"{quote.quote}"</p>
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {qualityFlags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {qualityFlags.map((flag, i) => (
              <QualityFlag key={i} flag={flag} />
            ))}
          </div>
        )}

        {segment.transcript && (
          <details className="group">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View full transcript
            </summary>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm leading-relaxed">
              {segment.transcript}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const { data: session, isLoading } = useQuery<SessionWithDetails>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Session not found</h3>
            <p className="text-muted-foreground mb-4">
              The session you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/sessions">
              <Button>Back to Sessions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const duration = session.totalDurationMs 
    ? formatDuration(intervalToDuration({ start: 0, end: session.totalDurationMs }))
    : null;

  const statusConfig: Record<string, { color: string; label: string }> = {
    completed: { color: "bg-green-500", label: "Completed" },
    in_progress: { color: "bg-blue-500", label: "In Progress" },
    paused: { color: "bg-yellow-500", label: "Paused" },
    pending: { color: "bg-muted", label: "Pending" },
    abandoned: { color: "bg-destructive", label: "Abandoned" },
    consent_given: { color: "bg-muted", label: "Consent Given" },
  };

  const status = statusConfig[session.status] || statusConfig.pending;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/sessions">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Session #{session.id.slice(0, 8)}
              </h1>
              <Badge className={`${status.color} text-white`}>
                {status.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {session.startedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(session.startedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {duration}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" data-testid="button-export">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {session.satisfactionRating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Respondent Satisfaction</span>
              <div className="flex items-center gap-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full ${
                      i < session.satisfactionRating! ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
                <span className="text-sm text-muted-foreground ml-2">
                  {session.satisfactionRating}/5
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList>
          <TabsTrigger value="summary" data-testid="tab-summary">
            <FileText className="w-4 h-4 mr-2" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="transcript" data-testid="tab-transcript">
            <MessageSquare className="w-4 h-4 mr-2" />
            Full Transcript
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          {Array.isArray(session.questionSummaries) && session.questionSummaries.length > 0 ? (
            (session.questionSummaries as QuestionSummary[]).map((summary: QuestionSummary, index: number) => (
              <Card key={index} className="mb-4" data-testid={`card-summary-${index}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Q{summary.questionIndex + 1}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {summary.turnCount} turns, {summary.wordCount} words
                        </span>
                      </div>
                      <CardTitle className="text-base font-medium">
                        {summary.questionText}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Summary
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {summary.respondentSummary}
                    </p>
                  </div>

                  {summary.keyInsights && summary.keyInsights.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Quote className="w-4 h-4 text-primary" />
                        Key Insights
                      </h4>
                      <ul className="space-y-1.5">
                        {summary.keyInsights.map((insight, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1.5">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <span className="font-medium">Completeness:</span> {summary.completenessAssessment}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : session.segments && session.segments.length > 0 ? (
            session.segments.map((segment, index) => (
              <SegmentCard key={segment.id} segment={segment} index={index} />
            ))
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-medium mb-2">No summaries yet</h3>
                <p className="text-sm text-muted-foreground">
                  Question summaries will appear here as the interview progresses.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transcript">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Transcript</CardTitle>
              <CardDescription>
                Complete conversation log from the interview
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(session.liveTranscript) && session.liveTranscript.length > 0 ? (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-3">
                    {(session.liveTranscript as TranscriptEntry[]).map((entry: TranscriptEntry, index: number) => (
                      <div 
                        key={index} 
                        className={`flex gap-3 ${entry.speaker === "alvia" ? "" : "flex-row-reverse"}`}
                      >
                        <div 
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            entry.speaker === "alvia" 
                              ? "bg-primary/10 text-primary" 
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.speaker === "alvia" ? "A" : "R"}
                        </div>
                        <div 
                          className={`flex-1 max-w-[80%] p-3 rounded-lg text-sm ${
                            entry.speaker === "alvia" 
                              ? "bg-primary/5 border border-primary/10" 
                              : "bg-muted"
                          }`}
                        >
                          <p className="leading-relaxed">{entry.text}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs py-0">Q{entry.questionIndex + 1}</Badge>
                            <span>{format(new Date(entry.timestamp), "h:mm:ss a")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : session.segments && session.segments.length > 0 ? (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-6">
                    {session.segments.map((segment, index) => (
                      <div key={segment.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
                          <span className="text-sm font-medium">
                            {segment.question?.questionText}
                          </span>
                        </div>
                        <div className="pl-4 border-l-2 border-muted">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {segment.transcript || "No transcript available"}
                          </p>
                        </div>
                        {index < session.segments!.length - 1 && (
                          <Separator className="mt-6" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">No transcript available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {session.closingComments && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closing Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{session.closingComments}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
