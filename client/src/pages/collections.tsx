import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { 
  Search, 
  FileText,
  Users,
  Clock,
  CheckCircle2,
  Play,
  Pause,
  ArrowRight,
  Calendar,
  Target
} from "lucide-react";
import { levelConfig } from "@/components/ui/hierarchy-nav";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { Collection } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface CollectionWithStats extends Collection {
  totalSessions?: number;
  completedSessions?: number;
}

function CollectionCard({ collection }: { collection: CollectionWithStats }) {
  const createdAt = collection.createdAt 
    ? formatDistanceToNow(new Date(collection.createdAt), { addSuffix: true })
    : "Recently";

  const progress = collection.targetResponses && collection.completedSessions
    ? (collection.completedSessions / collection.targetResponses) * 100
    : 0;

  const collectionConfig = levelConfig.collection;
  const CollectionIcon = collectionConfig.icon;

  return (
    <Link href={`/collections/${collection.id}`}>
      <Card 
        className="hover-elevate cursor-pointer transition-all duration-200 group overflow-hidden"
        data-testid={`card-collection-${collection.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                  collectionConfig.bgColor
                )}
              >
                <CollectionIcon className={cn("w-4 h-4", collectionConfig.color)} />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-medium", collectionConfig.color)}>
                    Collection
                  </span>
                  <Badge variant={collection.isActive ? "default" : "secondary"}>
                    {collection.isActive ? "Active" : "Closed"}
                  </Badge>
                </div>
                <CardTitle className="text-base font-medium truncate">
                  {collection.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {collection.description || "No description"}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 pl-4 sm:pl-[3.25rem] space-y-4 min-w-0">
          <div className="flex items-center gap-4 sm:gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4 shrink-0" />
              <span>{collection.totalSessions || 0} sessions</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{collection.completedSessions || 0} completed</span>
            </div>
          </div>

          {collection.targetResponses && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3 shrink-0" />
                  Progress
                </span>
                <span className="font-medium">
                  {collection.completedSessions || 0} / {collection.targetResponses}
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              Created {createdAt}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CollectionCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-full mt-2" />
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex gap-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </CardContent>
    </Card>
  );
}

export default function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: collections, isLoading } = useQuery<CollectionWithStats[]>({
    queryKey: ["/api/collections"],
  });

  const filteredCollections = collections?.filter(collection => 
    collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    collection.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = collections?.filter(c => c.isActive).length || 0;
  const totalSessions = collections?.reduce((sum, c) => sum + (c.totalSessions || 0), 0) || 0;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-w-0">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
        <p className="text-muted-foreground mt-1">
          Manage launched interview collections
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{collections?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total Collections</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalSessions}</p>
              <p className="text-sm text-muted-foreground">Total Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search collections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-collections"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          <CollectionCardSkeleton />
          <CollectionCardSkeleton />
          <CollectionCardSkeleton />
        </div>
      ) : filteredCollections && filteredCollections.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredCollections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      ) : (
        <Card className="py-16">
          <CardContent className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "No collections found" : "No collections yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              {searchQuery 
                ? "Try adjusting your search terms"
                : "Launch a collection from a template to start collecting interviews"
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
