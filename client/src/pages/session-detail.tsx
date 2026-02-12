import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Calendar,
  MessageSquare,
  Quote,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  Trash2,
  Copy,
  Link as LinkIcon,
  User,
  Mail,
  Flag,
  MoreVertical,
  Save,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Share2,
  StickyNote,
  Shield,
  XCircle,
  Eye,
  AlertCircle,
} from "lucide-react";
import type {
  InterviewSession,
  Segment,
  Question,
  QuestionSummary,
  Respondent,
  SessionReviewFlag,
  TranscriptionQualityMetrics,
  AlviaSessionSummary,
  BarbaraSessionSummary,
  BarbaraGuidanceLogEntry,
} from "@shared/schema";
import { GuidanceEffectivenessCard } from "@/components/guidance-effectiveness";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface TranscriptEntry {
  text: string;
  speaker: "alvia" | "respondent";
  timestamp: number;
  questionIndex: number;
}

interface SessionWithDetails extends InterviewSession {
  segments?: (Segment & { question?: Question })[];
  respondent?: Respondent | null;
}

function QualityFlag({ flag }: { flag: string }) {
  const config: Record<string, { icon: React.ElementType; color: string }> = {
    incomplete: { icon: AlertTriangle, color: "text-yellow-500" },
    ambiguous: { icon: Info, color: "text-blue-500" },
    contradiction: { icon: AlertTriangle, color: "text-orange-500" },
    distress_cue: { icon: AlertTriangle, color: "text-red-500" },
    off_topic: { icon: XCircle, color: "text-muted-foreground" },
    low_engagement: { icon: AlertCircle, color: "text-muted-foreground" },
  };
  const { icon: Icon, color } = config[flag] || {
    icon: Info,
    color: "text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={`gap-1 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {flag.replace(/_/g, " ")}
    </Badge>
  );
}

function SessionReviewFlagBadge({
  flag,
  onRemove,
}: {
  flag: SessionReviewFlag;
  onRemove?: () => void;
}) {
  const config: Record<SessionReviewFlag, { color: string; label: string }> = {
    needs_review: {
      color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
      label: "Needs Review",
    },
    flagged_quality: {
      color: "bg-red-500/20 text-red-700 dark:text-red-400",
      label: "Flagged Quality",
    },
    verified: {
      color: "bg-green-500/20 text-green-700 dark:text-green-400",
      label: "Verified",
    },
    excluded: { color: "bg-muted text-muted-foreground", label: "Excluded" },
  };
  const { color, label } = config[flag] || { color: "bg-muted", label: flag };

  return (
    <Badge variant="outline" className={`gap-1 ${color}`}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="ml-1 hover:text-destructive">
          <XCircle className="w-3 h-3" />
        </button>
      )}
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

function SegmentCard({
  segment,
  index,
}: {
  segment: Segment & { question?: Question };
  index: number;
}) {
  const keyQuotes = (segment.keyQuotes as any[]) || [];
  const summaryBullets = segment.summaryBullets || [];
  const qualityFlags = segment.qualityFlags || [];

  return (
    <Card className="mb-4" data-testid={`card-segment-${segment.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Q{index + 1}
              </Badge>
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
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
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

function RespondentInfoPanel({
  respondent,
}: {
  respondent: Respondent | null;
}) {
  if (!respondent) return null;

  const profileFields = (respondent.profileFields as Record<string, any>) || {};

  return (
    <Card data-testid="card-respondent-info">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Respondent Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(respondent.fullName || respondent.displayName) && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>{respondent.fullName || respondent.displayName}</span>
          </div>
        )}
        {respondent.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span>{respondent.email}</span>
          </div>
        )}
        {Object.keys(profileFields).length > 0 && (
          <div className="pt-2 border-t space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Custom Fields
            </span>
            {Object.entries(profileFields).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QualityScoreSummary({ summaries }: { summaries: QuestionSummary[] }) {
  if (!summaries || summaries.length === 0) return null;

  const allFlags: Record<string, number> = {};
  let totalQualityScore = 0;
  let scoredCount = 0;

  summaries.forEach((s) => {
    if (s.qualityScore) {
      totalQualityScore += s.qualityScore;
      scoredCount++;
    }
    (s.qualityFlags || []).forEach((flag) => {
      allFlags[flag] = (allFlags[flag] || 0) + 1;
    });
  });

  const avgQualityScore =
    scoredCount > 0 ? Math.round(totalQualityScore / scoredCount) : null;
  const flagEntries = Object.entries(allFlags).sort((a, b) => b[1] - a[1]);

  if (!avgQualityScore && flagEntries.length === 0) return null;

  return (
    <Card data-testid="card-quality-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Quality Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {avgQualityScore && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Average Quality Score
            </span>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  avgQualityScore >= 80
                    ? "bg-green-500"
                    : avgQualityScore >= 60
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              <span className="font-medium">{avgQualityScore}%</span>
            </div>
          </div>
        )}
        {flagEntries.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Quality Flags
            </span>
            <div className="flex flex-wrap gap-2">
              {flagEntries.map(([flag, count]) => (
                <Badge key={flag} variant="outline" className="text-xs">
                  {flag.replace(/_/g, " ")} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TranscriptionQualityCard({
  metrics,
}: {
  metrics: TranscriptionQualityMetrics | null | undefined;
}) {
  if (!metrics) return null;

  const { qualityScore, flagsDetected, signals, environmentCheckCount } =
    metrics;

  const flagLabels: Record<string, string> = {
    garbled_audio: "Garbled Audio",
    environment_noise: "Environment Noise",
    repeated_clarification: "Repeated Clarifications",
    foreign_language_hallucination: "Language Detection Issues",
  };

  return (
    <Card data-testid="card-transcription-quality">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary" />
          Transcription Quality
        </CardTitle>
        <CardDescription>
          Audio quality metrics from the interview
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Overall Score</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                qualityScore >= 80
                  ? "bg-green-500"
                  : qualityScore >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
            <span className="font-medium">{qualityScore}%</span>
          </div>
        </div>

        {flagsDetected && flagsDetected.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Issues Detected
            </span>
            <div className="flex flex-wrap gap-2">
              {flagsDetected.map((flag) => (
                <Badge key={flag} variant="outline" className="text-xs">
                  {flagLabels[flag] || flag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {signals && (
          <div className="space-y-2 pt-2 border-t">
            <span className="text-xs font-medium text-muted-foreground">
              Signal Details
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {signals.totalRespondentUtterances > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Total Utterances
                  </span>
                  <span>{signals.totalRespondentUtterances}</span>
                </div>
              )}
              {signals.foreignLanguageCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Language Issues</span>
                  <span className="text-yellow-600">
                    {signals.foreignLanguageCount}
                  </span>
                </div>
              )}
              {signals.incoherentPhraseCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unclear Phrases</span>
                  <span className="text-yellow-600">
                    {signals.incoherentPhraseCount}
                  </span>
                </div>
              )}
              {signals.questionRepeatCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repeat Requests</span>
                  <span className="text-yellow-600">
                    {signals.questionRepeatCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {environmentCheckCount > 0 && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Environment check was triggered during this interview
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [notesLoaded, setNotesLoaded] = useState(false);

  const { data: session, isLoading } = useQuery<SessionWithDetails>({
    queryKey: ["/api/sessions", sessionId],
    enabled: !!sessionId,
  });

  const { data: siblings } = useQuery<{
    prevId: string | null;
    nextId: string | null;
  }>({
    queryKey: ["/api/sessions", sessionId, "siblings"],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/siblings`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch siblings");
      return res.json();
    },
    enabled: !!sessionId,
  });

  // Load notes when session loads - useEffect to avoid setState during render
  useEffect(() => {
    if (session && !notesLoaded) {
      setNotes(session.researcherNotes || "");
      setNotesLoaded(true);
    }
  }, [session, notesLoaded]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      toast({ title: "Session deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      navigate("/sessions");
    },
    onError: () => {
      toast({ title: "Failed to delete session", variant: "destructive" });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      await apiRequest("PATCH", `/api/sessions/${sessionId}/notes`, { notes });
    },
    onSuccess: () => {
      toast({ title: "Notes saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
    onError: () => {
      toast({ title: "Failed to save notes", variant: "destructive" });
    },
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async (flags: SessionReviewFlag[]) => {
      await apiRequest("PATCH", `/api/sessions/${sessionId}/flags`, { flags });
    },
    onSuccess: () => {
      toast({ title: "Flags updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
    onError: () => {
      toast({ title: "Failed to update flags", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/sessions/${sessionId}/status`, {
        status,
      });
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const generateResumeLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/sessions/${sessionId}/resume-link`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.resumeUrl);
      toast({ title: "Resume link copied to clipboard" });
    },
    onError: () => {
      toast({
        title: "Failed to generate resume link",
        variant: "destructive",
      });
    },
  });

  const generateReviewLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/sessions/${sessionId}/review/generate-link`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.reviewUrl);
      toast({ title: "Review link copied to clipboard" });
    },
    onError: () => {
      toast({
        title: "Failed to generate review link",
        variant: "destructive",
      });
    },
  });

  const regenerateBarbaraSummaryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/sessions/${sessionId}/generate-summary`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
      toast({
        title: "Summary regenerated",
        description: "Barbara's analytical summary has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to regenerate summary",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExport = async (format: "json" | "csv") => {
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/export?format=${format}`,
        {
          credentials: "include",
        },
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${sessionId?.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: `Session exported as ${format.toUpperCase()}` });
    } catch (error) {
      toast({ title: "Failed to export session", variant: "destructive" });
    }
  };

  const handleCopyTranscript = () => {
    if (!session?.liveTranscript) return;
    const transcript = (session.liveTranscript as TranscriptEntry[])
      .map(
        (entry) =>
          `[${entry.speaker === "alvia" ? "Alvia" : "Respondent"}] ${entry.text}`,
      )
      .join("\n\n");
    navigator.clipboard.writeText(transcript);
    toast({ title: "Transcript copied to clipboard" });
  };

  const addFlag = (flag: SessionReviewFlag) => {
    const currentFlags = (session?.reviewFlags as SessionReviewFlag[]) || [];
    if (!currentFlags.includes(flag)) {
      updateFlagsMutation.mutate([...currentFlags, flag]);
    }
  };

  const removeFlag = (flag: SessionReviewFlag) => {
    const currentFlags = (session?.reviewFlags as SessionReviewFlag[]) || [];
    updateFlagsMutation.mutate(currentFlags.filter((f) => f !== flag));
  };

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
    ? formatDuration(
        intervalToDuration({ start: 0, end: session.totalDurationMs }),
      )
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
  const isIncomplete = [
    "paused",
    "in_progress",
    "consent_given",
    "pending",
  ].includes(session.status);
  const currentFlags = (session.reviewFlags as SessionReviewFlag[]) || [];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header with navigation */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/sessions">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">
                Session #{session.id.slice(0, 8)}
              </h1>
              <Badge className={`${status.color} text-white`}>
                {status.label}
              </Badge>
              {currentFlags.map((flag) => (
                <SessionReviewFlagBadge
                  key={flag}
                  flag={flag}
                  onRemove={() => removeFlag(flag)}
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              {session.startedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(
                    new Date(session.startedAt),
                    "MMM d, yyyy 'at' h:mm a",
                  )}
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

        <div className="flex items-center gap-2">
          {/* Session Navigation */}
          {siblings && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={!siblings.prevId}
                onClick={() =>
                  siblings.prevId && navigate(`/sessions/${siblings.prevId}`)
                }
                data-testid="button-prev-session"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={!siblings.nextId}
                onClick={() =>
                  siblings.nextId && navigate(`/sessions/${siblings.nextId}`)
                }
                data-testid="button-next-session"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleExport("json")}
                data-testid="menu-export-json"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("csv")}
                data-testid="menu-export-csv"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                data-testid="button-actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleCopyTranscript}
                data-testid="menu-copy-transcript"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Transcript
              </DropdownMenuItem>
              {session.status === "completed" && (
                <DropdownMenuItem
                  onClick={() => generateReviewLinkMutation.mutate()}
                  data-testid="menu-share-review"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Review Link
                </DropdownMenuItem>
              )}
              {isIncomplete && (
                <DropdownMenuItem
                  onClick={() => generateResumeLinkMutation.mutate()}
                  data-testid="menu-resume-link"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Generate Resume Link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => addFlag("needs_review")}
                data-testid="menu-flag-review"
              >
                <Eye className="w-4 h-4 mr-2" />
                Flag: Needs Review
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => addFlag("flagged_quality")}
                data-testid="menu-flag-quality"
              >
                <Flag className="w-4 h-4 mr-2" />
                Flag: Quality Issue
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => addFlag("verified")}
                data-testid="menu-flag-verified"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark: Verified
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => addFlag("excluded")}
                data-testid="menu-flag-excluded"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Mark: Excluded
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {session.status !== "completed" && (
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate("completed")}
                  data-testid="menu-status-completed"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark as Completed
                </DropdownMenuItem>
              )}
              {session.status !== "abandoned" && (
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate("abandoned")}
                  data-testid="menu-status-abandoned"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Mark as Abandoned
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive"
                data-testid="menu-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session and all its data,
              including transcripts and analysis. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sidebar panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {session.satisfactionRating && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Respondent Satisfaction
                  </span>
                  <div className="flex items-center gap-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-full ${
                          i < session.satisfactionRating!
                            ? "bg-primary"
                            : "bg-muted"
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
              {Array.isArray(session.barbaraGuidanceLog) && (session.barbaraGuidanceLog as BarbaraGuidanceLogEntry[]).length > 0 && (
                <TabsTrigger value="guidance" data-testid="tab-guidance">
                  <Eye className="w-4 h-4 mr-2" />
                  Guidance
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {(() => {
                // Build the full summaries list including AQs from legacy data
                const templateSummaries = Array.isArray(
                  session.questionSummaries,
                )
                  ? (session.questionSummaries as QuestionSummary[])
                  : [];

                // additional_questions is stored as an array directly in the database
                // Now includes enriched fields: metrics, quality scores, verbatims
                type VerbatimData = {
                  quote: string;
                  context: string;
                  sentiment?: "positive" | "negative" | "neutral" | "mixed";
                  themeTag?: string;
                };
                type AQData = {
                  index?: number;
                  questionText: string;
                  rationale?: string;
                  summaryBullets?: string[];
                  respondentSummary?: string;
                  completenessAssessment?: string;
                  // Metrics (enriched)
                  wordCount?: number;
                  turnCount?: number;
                  activeTimeMs?: number;
                  // Quality assessment (enriched)
                  qualityScore?: number;
                  qualityFlags?: (
                    | "incomplete"
                    | "ambiguous"
                    | "contradiction"
                    | "distress_cue"
                    | "off_topic"
                    | "low_engagement"
                  )[];
                  qualityNotes?: string;
                  // Verbatims (enriched)
                  verbatims?: VerbatimData[];
                };
                const additionalQuestionsArray = Array.isArray(
                  session.additionalQuestions,
                )
                  ? (session.additionalQuestions as AQData[])
                  : null;

                // Check if any AQ summaries are already in questionSummaries
                const hasAQInSummaries = templateSummaries.some(
                  (s) => s.isAdditionalQuestion,
                );

                // For legacy sessions: synthesize AQ summaries from additionalQuestions data
                // Uses enriched fields when available, falls back to zeros for older data
                let allSummaries = [...templateSummaries];
                if (
                  !hasAQInSummaries &&
                  additionalQuestionsArray &&
                  additionalQuestionsArray.length > 0
                ) {
                  additionalQuestionsArray.forEach((aq, i) => {
                    if (aq.respondentSummary) {
                      allSummaries.push({
                        questionIndex: templateSummaries.length + i,
                        questionText: aq.questionText,
                        respondentSummary: aq.respondentSummary,
                        keyInsights: aq.summaryBullets || [],
                        completenessAssessment: aq.completenessAssessment || "",
                        relevantToFutureQuestions: [],
                        wordCount: aq.wordCount ?? 0,
                        turnCount: aq.turnCount ?? 0,
                        activeTimeMs: aq.activeTimeMs ?? 0,
                        timestamp: Date.now(),
                        isAdditionalQuestion: true,
                        additionalQuestionIndex: aq.index ?? i,
                        // Quality assessment
                        qualityScore: aq.qualityScore,
                        qualityFlags: aq.qualityFlags,
                        qualityNotes: aq.qualityNotes,
                        // Verbatims
                        verbatims: aq.verbatims,
                      });
                    }
                  });
                }

                return allSummaries.length > 0 ? (
                  allSummaries.map(
                    (summary: QuestionSummary, index: number) => (
                      <Card
                        key={index}
                        className="mb-4"
                        data-testid={`card-summary-${index}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {summary.isAdditionalQuestion
                                    ? `AQ${(summary.additionalQuestionIndex ?? 0) + 1}`
                                    : `Q${summary.questionIndex + 1}`}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {summary.turnCount} turns, {summary.wordCount}{" "}
                                  words
                                </span>
                                {summary.qualityScore && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Quality: {summary.qualityScore}%
                                  </Badge>
                                )}
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

                          {summary.keyInsights &&
                            summary.keyInsights.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                  <Quote className="w-4 h-4 text-primary" />
                                  Key Insights
                                </h4>
                                <ul className="space-y-1.5">
                                  {summary.keyInsights.map((insight, i) => (
                                    <li
                                      key={i}
                                      className="text-sm text-muted-foreground flex items-start gap-2"
                                    >
                                      <span className="text-primary mt-1.5">
                                        •
                                      </span>
                                      <span>{insight}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          {summary.verbatims &&
                            summary.verbatims.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                  <MessageSquare className="w-4 h-4 text-primary" />
                                  Verbatims
                                </h4>
                                <div className="space-y-3">
                                  {summary.verbatims.map((verbatim, i) => (
                                    <div
                                      key={i}
                                      className="border-l-2 border-primary/30 pl-3 py-1 space-y-1"
                                    >
                                      <p className="text-sm italic text-muted-foreground">
                                        "{verbatim.quote}"
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {verbatim.sentiment && (
                                          <Badge
                                            variant="secondary"
                                            className={`text-xs ${
                                              verbatim.sentiment === "positive"
                                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                : verbatim.sentiment ===
                                                    "negative"
                                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                  : verbatim.sentiment ===
                                                      "mixed"
                                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                    : ""
                                            }`}
                                            data-testid={`badge-sentiment-${i}`}
                                          >
                                            {verbatim.sentiment}
                                          </Badge>
                                        )}
                                        {verbatim.themeTag && (
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                            data-testid={`badge-theme-${i}`}
                                          >
                                            {verbatim.themeTag}
                                          </Badge>
                                        )}
                                      </div>
                                      {verbatim.context && (
                                        <p className="text-xs text-muted-foreground/70">
                                          {verbatim.context}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          {summary.qualityFlags &&
                            summary.qualityFlags.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {summary.qualityFlags.map((flag, i) => (
                                  <QualityFlag key={i} flag={flag} />
                                ))}
                              </div>
                            )}

                          <div className="text-xs text-muted-foreground pt-2 border-t">
                            <span className="font-medium">Completeness:</span>{" "}
                            {summary.completenessAssessment}
                          </div>
                        </CardContent>
                      </Card>
                    ),
                  )
                ) : session.segments && session.segments.length > 0 ? (
                  session.segments.map((segment, index) => (
                    <SegmentCard
                      key={segment.id}
                      segment={segment}
                      index={index}
                    />
                  ))
                ) : (
                  <Card className="py-12">
                    <CardContent className="text-center">
                      <FileText className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                      <h3 className="font-medium mb-2">No summaries yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Question summaries will appear here as the interview
                        progresses.
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Session-level summaries (Alvia + Barbara) */}
              {(() => {
                const alviaSummary =
                  session.alviaSummary as AlviaSessionSummary | null;
                const barbaraSummary =
                  session.barbaraSessionSummary as BarbaraSessionSummary | null;
                const canGenerateSummary =
                  session.status === "completed" && !barbaraSummary;
                if (!alviaSummary && !barbaraSummary && !canGenerateSummary)
                  return null;
                return (
                  <div
                    className="space-y-4"
                    data-testid="section-session-summaries"
                  >
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Session Summaries
                    </h3>
                    <div className="space-y-4">
                      {alviaSummary && (
                        <Card data-testid="card-alvia-summary">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Alvia
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Audio-informed perspective
                              </span>
                            </div>
                            <CardTitle className="text-sm font-medium">
                              Conversational Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p
                              className="text-sm text-muted-foreground leading-relaxed"
                              data-testid="text-alvia-overall-summary"
                            >
                              {alviaSummary.overallSummary}
                            </p>
                            {alviaSummary.themes.length > 0 && (
                              <div
                                className="space-y-1.5"
                                data-testid="section-alvia-themes"
                              >
                                <h4 className="text-xs font-medium">
                                  Key Themes
                                </h4>
                                {alviaSummary.themes.map((t, i) => (
                                  <div
                                    key={i}
                                    className="text-xs"
                                    data-testid={`text-alvia-theme-${i}`}
                                  >
                                    <span className="font-medium">
                                      {t.theme}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      — {t.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {alviaSummary.objectiveSatisfaction && (
                              <div
                                className="space-y-1.5"
                                data-testid="section-alvia-objective"
                              >
                                <h4 className="text-xs font-medium">
                                  Objective Coverage
                                </h4>
                                <p
                                  className="text-xs text-muted-foreground"
                                  data-testid="text-alvia-objective-assessment"
                                >
                                  {
                                    alviaSummary.objectiveSatisfaction
                                      .assessment
                                  }
                                </p>
                                {alviaSummary.objectiveSatisfaction.gaps
                                  .length > 0 && (
                                  <div
                                    className="text-xs text-muted-foreground"
                                    data-testid="text-alvia-gaps"
                                  >
                                    <span className="font-medium">Gaps: </span>
                                    {alviaSummary.objectiveSatisfaction.gaps.join(
                                      ", ",
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div
                              className="text-xs text-muted-foreground pt-1 border-t"
                              data-testid="text-alvia-model"
                            >
                              {alviaSummary.provider} / {alviaSummary.model}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {!barbaraSummary && canGenerateSummary && (
                        <Card data-testid="card-barbara-summary-empty">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Barbara
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Analytical perspective
                              </span>
                            </div>
                            <CardTitle className="text-sm font-medium">
                              Analytical Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-center py-4">
                            <p className="text-sm text-muted-foreground mb-3">
                              No analytical summary generated yet
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                regenerateBarbaraSummaryMutation.mutate()
                              }
                              disabled={
                                regenerateBarbaraSummaryMutation.isPending
                              }
                              data-testid="button-generate-barbara-summary"
                            >
                              <RefreshCw
                                className={`w-3 h-3 mr-1 ${regenerateBarbaraSummaryMutation.isPending ? "animate-spin" : ""}`}
                              />
                              {regenerateBarbaraSummaryMutation.isPending
                                ? "Generating..."
                                : "Generate Summary"}
                            </Button>
                          </CardContent>
                        </Card>
                      )}
                      {barbaraSummary && (
                        <Card data-testid="card-barbara-summary">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Barbara
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Analytical perspective
                              </span>
                            </div>
                            <CardTitle className="text-sm font-medium">
                              Analytical Summary
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p
                              className="text-sm text-muted-foreground leading-relaxed"
                              data-testid="text-barbara-overall-summary"
                            >
                              {barbaraSummary.overallSummary}
                            </p>
                            {barbaraSummary.themes.length > 0 && (
                              <div
                                className="space-y-1.5"
                                data-testid="section-barbara-themes"
                              >
                                <h4 className="text-xs font-medium">
                                  Key Themes
                                </h4>
                                {barbaraSummary.themes.map((t, i) => (
                                  <div
                                    key={i}
                                    className="text-xs"
                                    data-testid={`text-barbara-theme-${i}`}
                                  >
                                    <span className="font-medium">
                                      {t.theme}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] ml-1"
                                      data-testid={`badge-barbara-sentiment-${i}`}
                                    >
                                      {t.sentiment}
                                    </Badge>
                                    <p className="text-muted-foreground mt-0.5">
                                      {t.description}
                                    </p>
                                    {t.supportingEvidence.length > 0 && (
                                      <ul className="list-disc list-inside text-muted-foreground mt-0.5 space-y-0.5">
                                        {t.supportingEvidence.map((e, j) => (
                                          <li key={j}>{e}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {barbaraSummary.objectiveSatisfaction && (
                              <div
                                className="space-y-1.5"
                                data-testid="section-barbara-objective"
                              >
                                <h4 className="text-xs font-medium">
                                  Objective Satisfaction
                                </h4>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                    data-testid="badge-barbara-rating"
                                  >
                                    {
                                      barbaraSummary.objectiveSatisfaction
                                        .rating
                                    }
                                    /100
                                  </Badge>
                                  <span
                                    className="text-xs text-muted-foreground"
                                    data-testid="text-barbara-objective-assessment"
                                  >
                                    {
                                      barbaraSummary.objectiveSatisfaction
                                        .assessment
                                    }
                                  </span>
                                </div>
                                {barbaraSummary.objectiveSatisfaction
                                  .gapsIdentified.length > 0 && (
                                  <div
                                    className="text-xs text-muted-foreground"
                                    data-testid="text-barbara-gaps"
                                  >
                                    <span className="font-medium">Gaps: </span>
                                    {barbaraSummary.objectiveSatisfaction.gapsIdentified.join(
                                      ", ",
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            {barbaraSummary.respondentEngagement && (
                              <div
                                className="text-xs text-muted-foreground"
                                data-testid="section-barbara-engagement"
                              >
                                <span className="font-medium">
                                  Engagement:{" "}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                  data-testid="badge-barbara-engagement"
                                >
                                  {barbaraSummary.respondentEngagement.level}
                                </Badge>
                                <span className="ml-1">
                                  {barbaraSummary.respondentEngagement.notes}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t">
                              <span
                                className="text-xs text-muted-foreground"
                                data-testid="text-barbara-model"
                              >
                                {barbaraSummary.model}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  regenerateBarbaraSummaryMutation.mutate()
                                }
                                disabled={
                                  regenerateBarbaraSummaryMutation.isPending
                                }
                                data-testid="button-regenerate-barbara-summary"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 mr-1 ${regenerateBarbaraSummaryMutation.isPending ? "animate-spin" : ""}`}
                                />
                                {regenerateBarbaraSummaryMutation.isPending
                                  ? "Regenerating..."
                                  : "Regenerate"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="transcript">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        Full Transcript
                      </CardTitle>
                      <CardDescription>
                        Complete conversation log from the interview
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyTranscript}
                      data-testid="button-copy-transcript"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {Array.isArray(session.liveTranscript) &&
                  session.liveTranscript.length > 0 ? (
                    <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-3">
                        {(session.liveTranscript as TranscriptEntry[]).map(
                          (entry: TranscriptEntry, index: number) => (
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
                                  <Badge
                                    variant="outline"
                                    className="text-xs py-0"
                                  >
                                    Q{entry.questionIndex + 1}
                                  </Badge>
                                  <span>
                                    {format(
                                      new Date(entry.timestamp),
                                      "h:mm:ss a",
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </ScrollArea>
                  ) : session.segments && session.segments.length > 0 ? (
                    <ScrollArea className="h-[600px] pr-4">
                      <div className="space-y-6">
                        {session.segments.map((segment, index) => (
                          <div key={segment.id}>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                Q{index + 1}
                              </Badge>
                              <span className="text-sm font-medium">
                                {segment.question?.questionText}
                              </span>
                            </div>
                            <div className="pl-4 border-l-2 border-muted">
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {segment.transcript ||
                                  "No transcript available"}
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

            {Array.isArray(session.barbaraGuidanceLog) && (session.barbaraGuidanceLog as BarbaraGuidanceLogEntry[]).length > 0 && (
              <TabsContent value="guidance" className="space-y-4">
                <GuidanceEffectivenessCard sessionId={session.id} />
              </TabsContent>
            )}
          </Tabs>

          {session.closingComments && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Closing Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {session.closingComments}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <RespondentInfoPanel respondent={session.respondent || null} />
          <QualityScoreSummary
            summaries={(session.questionSummaries as QuestionSummary[]) || []}
          />
          <TranscriptionQualityCard
            metrics={
              session.transcriptionQualityMetrics as TranscriptionQualityMetrics | null
            }
          />

          {/* Researcher Notes */}
          <Card data-testid="card-researcher-notes">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-primary" />
                Researcher Notes
              </CardTitle>
              <CardDescription>
                Internal notes that don't affect analytics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this session..."
                className="min-h-[100px] text-sm"
                data-testid="textarea-notes"
              />
              <Button
                size="sm"
                onClick={() => saveNotesMutation.mutate(notes)}
                disabled={saveNotesMutation.isPending}
                data-testid="button-save-notes"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveNotesMutation.isPending ? "Saving..." : "Save Notes"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
