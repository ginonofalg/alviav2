import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HierarchyHeader } from "@/components/ui/hierarchy-nav";
import { 
  Plus, 
  Settings, 
  FileText, 
  Users, 
  BarChart3,
  MoreVertical,
  Play,
  Clock,
  CheckCircle2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectAnalyticsView } from "@/components/analytics";
import { InfographicGenerator } from "@/components/InfographicGenerator";
import { Image as ImageIcon } from "lucide-react";
import type { Project, InterviewTemplate, Collection } from "@shared/schema";

interface ProjectWithCounts extends Project {
  templateCount: number;
  sessionCount: number;
}
import { formatDistanceToNow } from "date-fns";

function TemplateCard({ template }: { template: InterviewTemplate }) {
  return (
    <Card className="hover-elevate transition-all duration-200 group" data-testid={`card-template-${template.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/templates/${template.id}`}>
              <CardTitle className="text-base font-medium hover:text-primary cursor-pointer">
                {template.name}
              </CardTitle>
            </Link>
            <Badge variant="outline" className="text-xs">v{template.version}</Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {template.objective || "No objective set"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/templates/${template.id}/edit`}>Edit Template</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/templates/${template.id}/preview`}>Preview</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/collections/new?templateId=${template.id}`}>Launch Collection</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 mt-2">
          {template.isActive ? (
            <Badge variant="default" className="text-xs gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Draft</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CollectionCard({ collection }: { collection: Collection }) {
  const createdAt = collection.createdAt 
    ? formatDistanceToNow(new Date(collection.createdAt), { addSuffix: true })
    : "Recently";

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-collection-${collection.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <Link href={`/collections/${collection.id}`}>
              <CardTitle className="text-base font-medium hover:text-primary cursor-pointer">
                {collection.name}
              </CardTitle>
            </Link>
            <p className="text-sm text-muted-foreground">{collection.description || "No description"}</p>
          </div>
          <Badge variant={collection.isActive ? "default" : "secondary"}>
            {collection.isActive ? "Active" : "Closed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Created {createdAt}</span>
          </div>
          {collection.targetResponses && (
            <span>Target: {collection.targetResponses} responses</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { data: project, isLoading: projectLoading } = useQuery<ProjectWithCounts>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<InterviewTemplate[]>({
    queryKey: ["/api/projects", projectId, "templates"],
    enabled: !!projectId,
  });

  const { data: collections, isLoading: collectionsLoading } = useQuery<Collection[]>({
    queryKey: ["/api/projects", projectId, "collections"],
    enabled: !!projectId,
  });

  const { data: analyticsData } = useQuery<{ analytics: unknown | null }>({
    queryKey: ["/api/projects", projectId, "analytics"],
    enabled: !!projectId,
  });

  if (projectLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
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

  if (!project) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Card className="py-16">
          <CardContent className="text-center">
            <h3 className="text-lg font-medium mb-2">Project not found</h3>
            <p className="text-muted-foreground mb-4">
              The project you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <HierarchyHeader
        level="project"
        title={project.name}
        subtitle={project.description || "No description"}
        breadcrumbItems={[
          { label: "Projects", href: "/projects", level: "project" },
          { label: project.name, level: "project" },
        ]}
        actions={
          <>
            <Link href={`/projects/${projectId}/edit`}>
              <Button variant="outline" size="sm" data-testid="button-edit-project">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/templates/new`}>
              <Button size="sm" data-testid="button-new-template">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{templates?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Templates</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{collections?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Collections</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{project?.sessionCount ?? 0}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="collections" data-testid="tab-collections">
            <Play className="w-4 h-4 mr-2" />
            Collections
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="infographics" data-testid="tab-infographics">
            <ImageIcon className="w-4 h-4 mr-2" />
            Infographics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          {templatesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-medium mb-2">No templates yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first interview template to start collecting responses.
                </p>
                <Link href={`/projects/${projectId}/templates/new`}>
                  <Button data-testid="button-create-first-template">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="collections" className="space-y-4">
          {collectionsLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : collections && collections.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {collections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </div>
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <Play className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
                <h3 className="font-medium mb-2">No collections yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Launch a collection from a template to start collecting interviews.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics">
          <ProjectAnalyticsView projectId={projectId!} projectName={project.name} />
        </TabsContent>

        <TabsContent value="infographics">
          <InfographicGenerator
            entityId={projectId!}
            entityName={project.name}
            entityLevel="project"
            hasAnalytics={!!analyticsData?.analytics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
