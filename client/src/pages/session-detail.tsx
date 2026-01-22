import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DropdownMenuTrigger 
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
  AlertCircle
} from "lucide-react";
import type { InterviewSession, Segment, Question, QuestionSummary, Respondent, SessionReviewFlag } from "@shared/schema";
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
  const { icon: Icon, color } = config[flag] || { icon: Info, color: "text-muted-foreground" };

  return (
    <Badge variant="outline" className={`gap-1 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {flag.replace(/_/g, " ")}
    </Badge>
  );
}

function SessionReviewFlagBadge({ flag, onRemove }: { flag: SessionReviewFlag; onRemove?: () => void }) {
  const config: Record<SessionReviewFlag, { color: string; label: string }> = {
    needs_review: { color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400", label: "Needs Review" },
    flagged_quality: { color: "bg-red-500/20 text-red-700 dark:text-red-400", label: "Flagged Quality" },
    verified: { color: "bg-green-500/20 text-green-700 dark:text-green-400", label: "Verified" },
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

function RespondentInfoPanel({ respondent }: { respondent: Respondent | null }) {
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
            <span className="text-xs font-medium text-muted-foreground">Custom Fields</span>
            {Object.entries(profileFields).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
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

  summaries.forEach(s => {
    if (s.qualityScore) {
      totalQualityScore += s.qualityScore;
      scoredCount++;
    }
    (s.qualityFlags || []).forEach(flag => {
      allFlags[flag] = (allFlags[flag] || 0) + 1;
    });
  });

  const avgQualityScore = scoredCount > 0 ? Math.round(totalQualityScore / scoredCount) : null;
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
            <span className="text-sm text-muted-foreground">Average Quality Score</span>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                avgQualityScore >= 80 ? "bg-green-500" : 
                avgQualityScore >= 60 ? "bg-yellow-500" : "bg-red-500"
              }`} />
              <span className="font-medium">{avgQualityScore}%</span>
            </div>
          </div>
        )}
        {flagEntries.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Quality Flags</span>
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

  const { data: siblings } = useQuery<{ prevId: string | null; nextId: string | null }>({
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
      await apiRequest("PATCH", `/api/sessions/${sessionId}/status`, { status });
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
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/resume-link`);
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.resumeUrl);
      toast({ title: "Resume link copied to clipboard" });
    },
    onError: () => {
      toast({ title: "Failed to generate resume link", variant: "destructive" });
    },
  });

  const generateReviewLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/review/generate-link`);
      return res.json();
    },
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.reviewUrl);
      toast({ title: "Review link copied to clipboard" });
    },
    onError: () => {
      toast({ title: "Failed to generate review link", variant: "destructive" });
    },
  });

  const handleExport = async (format: "json" | "csv") => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/export?format=${format}`, {
        credentials: "include",
      });
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
      .map(entry => `[${entry.speaker === "alvia" ? "Alvia" : "Respondent"}] ${entry.text}`)
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
    updateFlagsMutation.mutate(currentFlags.filter(f => f !== flag));
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
  const isIncomplete = ["paused", "in_progress", "consent_given", "pending"].includes(session.status);
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
              {currentFlags.map(flag => (
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

        <div className="flex items-center gap-2">
          {/* Session Navigation */}
          {siblings && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={!siblings.prevId}
                onClick={() => siblings.prevId && navigate(`/sessions/${siblings.prevId}`)}
                data-testid="button-prev-session"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={!siblings.nextId}
                onClick={() => siblings.nextId && navigate(`/sessions/${siblings.nextId}`)}
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
              <DropdownMenuItem onClick={() => handleExport("json")} data-testid="menu-export-json">
                <FileText className="w-4 h-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("csv")} data-testid="menu-export-csv">
                <FileText className="w-4 h-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-actions">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyTranscript} data-testid="menu-copy-transcript">
                <Copy className="w-4 h-4 mr-2" />
                Copy Transcript
              </DropdownMenuItem>
              {session.status === "completed" && (
                <DropdownMenuItem onClick={() => generateReviewLinkMutation.mutate()} data-testid="menu-share-review">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Review Link
                </DropdownMenuItem>
              )}
              {isIncomplete && (
                <DropdownMenuItem onClick={() => generateResumeLinkMutation.mutate()} data-testid="menu-resume-link">
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Generate Resume Link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => addFlag("needs_review")} data-testid="menu-flag-review">
                <Eye className="w-4 h-4 mr-2" />
                Flag: Needs Review
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addFlag("flagged_quality")} data-testid="menu-flag-quality">
                <Flag className="w-4 h-4 mr-2" />
                Flag: Quality Issue
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addFlag("verified")} data-testid="menu-flag-verified">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark: Verified
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addFlag("excluded")} data-testid="menu-flag-excluded">
                <XCircle className="w-4 h-4 mr-2" />
                Mark: Excluded
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {session.status !== "completed" && (
                <DropdownMenuItem onClick={() => updateStatusMutation.mutate("completed")} data-testid="menu-status-completed">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark as Completed
                </DropdownMenuItem>
              )}
              {session.status !== "abandoned" && (
                <DropdownMenuItem onClick={() => updateStatusMutation.mutate("abandoned")} data-testid="menu-status-abandoned">
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
              This will permanently delete this session and all its data, including transcripts and analysis. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
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
                            {summary.qualityScore && (
                              <Badge variant="secondary" className="text-xs">
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

                      {summary.qualityFlags && summary.qualityFlags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {summary.qualityFlags.map((flag, i) => (
                            <QualityFlag key={i} flag={flag} />
                          ))}
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
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Full Transcript</CardTitle>
                      <CardDescription>
                        Complete conversation log from the interview
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCopyTranscript} data-testid="button-copy-transcript">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                  </div>
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

        {/* Right sidebar */}
        <div className="space-y-6">
          <RespondentInfoPanel respondent={session.respondent || null} />
          <QualityScoreSummary summaries={(session.questionSummaries as QuestionSummary[]) || []} />
          
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
