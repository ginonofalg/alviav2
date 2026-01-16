import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Copy, 
  ExternalLink,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Collection, InterviewTemplate, Project, SessionWithRespondent } from "@shared/schema";

interface CollectionWithDetails extends Collection {
  template?: InterviewTemplate;
  project?: Project;
}

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const collectionId = params.id;
  const { toast } = useToast();

  const { data: collection, isLoading } = useQuery<CollectionWithDetails>({
    queryKey: ["/api/collections", collectionId],
    enabled: !!collectionId,
  });

  const { data: sessions } = useQuery<SessionWithRespondent[]>({
    queryKey: ["/api/collections", collectionId, "sessions"],
    enabled: !!collectionId,
  });

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/join/${collectionId}`;
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Share this link with your respondents.",
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Collection not found</h3>
            <p className="text-muted-foreground mb-4">
              The collection you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/collections">
              <Button>Back to Collections</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedSessions = sessions?.filter(s => s.status === "completed").length || 0;
  const inProgressSessions = sessions?.filter(s => s.status === "in_progress").length || 0;
  const totalSessions = sessions?.length || 0;
  const progress = collection.targetResponses 
    ? Math.min(100, Math.round((completedSessions / collection.targetResponses) * 100))
    : 0;

  const shareUrl = `${window.location.origin}/join/${collectionId}`;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/collections">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
              {collection.isOpen ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Open
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  Closed
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {collection.template?.name || "Interview Template"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyShareLink} data-testid="button-copy-link">
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" data-testid="button-preview">
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalSessions}</p>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{completedSessions}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{inProgressSessions}</p>
              <p className="text-sm text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{progress}%</p>
              <p className="text-sm text-muted-foreground">Progress</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Share Link</CardTitle>
          <CardDescription>
            Share this link with respondents to collect interviews
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm truncate">
              {shareUrl}
            </div>
            <Button variant="outline" onClick={copyShareLink} data-testid="button-copy-share-link">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>
                Interview sessions from this collection
              </CardDescription>
            </div>
            {totalSessions > 0 && (
              <Link href={`/sessions?collectionId=${collectionId}`}>
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!sessions || sessions.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2">No sessions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share the collection link to start collecting responses.
              </p>
              <Button onClick={copyShareLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Share Link
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => {
                const displayName = session.respondent?.informalName || session.respondent?.fullName || "Anonymous";
                return (
                  <Link key={session.id} href={`/sessions/${session.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer" data-testid={`session-row-${session.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm" data-testid={`session-name-${session.id}`}>{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={session.status === "completed" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
