import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Search, 
  FileText,
  FolderKanban,
  ArrowRight,
  Calendar,
  MessageSquare,
  Layers,
  CheckCircle2,
  Clock,
  X
} from "lucide-react";
import { levelConfig } from "@/components/ui/hierarchy-nav";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { InterviewTemplate, Project, Collection } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface TemplateWithDetails extends InterviewTemplate {
  questionCount?: number;
  collectionCount?: number;
  project?: Project;
}

function TemplateCard({ template, collections }: { template: TemplateWithDetails; collections: Collection[] }) {
  const createdAt = template.createdAt 
    ? formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })
    : "Recently";

  const templateCollections = collections.filter(c => c.templateId === template.id);
  const activeCollections = templateCollections.filter(c => c.isActive).length;

  const templateConfig = levelConfig.template;
  const TemplateIcon = templateConfig.icon;

  return (
    <Card 
      className="hover-elevate cursor-pointer transition-all duration-200 group overflow-hidden"
      data-testid={`card-template-${template.id}`}
    >
      <Link href={`/templates/${template.id}`} data-testid={`link-template-${template.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
                  templateConfig.bgColor
                )}
              >
                <TemplateIcon className={cn("w-4 h-4", templateConfig.color)} />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-xs font-medium", templateConfig.color)}>
                    Template
                  </span>
                  <Badge variant={template.isActive ? "default" : "secondary"} data-testid={`badge-template-status-${template.id}`}>
                    {template.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <CardTitle className="text-base font-medium truncate" data-testid={`text-template-name-${template.id}`}>
                  {template.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-template-objective-${template.id}`}>
                  {template.objective || "No objective set"}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </CardHeader>
      </Link>
      <CardContent className="pt-0 pl-[3.25rem] space-y-4">
        {template.project && (
          <Link href={`/projects/${template.projectId}`} data-testid={`link-project-${template.id}`}>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded px-1 -mx-1">
              <FolderKanban className="w-4 h-4" />
              <span className="truncate">{template.project.name}</span>
            </div>
          </Link>
        )}
        
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="w-4 h-4" />
            <span data-testid={`text-questions-count-${template.id}`}>{template.questionCount || 0} questions</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="w-4 h-4" />
            <span data-testid={`text-collections-count-${template.id}`}>{templateCollections.length} collections</span>
          </div>
        </div>

        {templateCollections.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium" data-testid={`label-collections-${template.id}`}>Collections:</p>
            <div className="flex flex-wrap gap-2">
              {templateCollections.slice(0, 3).map(collection => (
                <Link key={collection.id} href={`/collections/${collection.id}`} data-testid={`link-collection-${collection.id}`}>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer"
                    data-testid={`badge-collection-${collection.id}`}
                  >
                    {collection.isActive ? (
                      <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                    ) : (
                      <Clock className="w-3 h-3 mr-1 text-muted-foreground" />
                    )}
                    {collection.name}
                  </Badge>
                </Link>
              ))}
              {templateCollections.length > 3 && (
                <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-more-collections-${template.id}`}>
                  +{templateCollections.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap pt-2 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1" data-testid={`text-created-${template.id}`}>
            <Calendar className="w-3.5 h-3.5" />
            Created {createdAt}
          </span>
          {activeCollections > 0 && (
            <span className="flex items-center gap-1 text-green-600" data-testid={`text-active-collections-${template.id}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {activeCollections} active
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateCardSkeleton() {
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
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: templates, isLoading: templatesLoading } = useQuery<TemplateWithDetails[]>({
    queryKey: ["/api/templates"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: collections } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const templatesWithProjects = templates?.map(template => ({
    ...template,
    project: projects?.find(p => p.id === template.projectId),
  }));

  const filteredTemplates = templatesWithProjects?.filter(template => {
    const matchesSearch = 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.objective?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.project?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProject = projectFilter === "all" || template.projectId === projectFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && template.isActive) ||
      (statusFilter === "inactive" && !template.isActive);

    return matchesSearch && matchesProject && matchesStatus;
  });

  const activeCount = templates?.filter(t => t.isActive).length || 0;
  const totalCollectionCount = collections?.length || 0;

  const clearFilters = () => {
    setSearchQuery("");
    setProjectFilter("all");
    setStatusFilter("all");
  };

  const hasActiveFilters = searchQuery || projectFilter !== "all" || statusFilter !== "all";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-w-0">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">Templates</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-page-subtitle">
          Browse and manage interview templates across all projects
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold" data-testid="text-total-templates">
                {templates?.length || 0}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="label-total-templates">Total Templates</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold" data-testid="text-active-templates">
                {activeCount}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="label-active-templates">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-semibold" data-testid="text-total-collections">
                {totalCollectionCount}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="label-total-collections">Total Collections</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-templates"
          />
        </div>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-project-filter">
            <FolderKanban className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects?.map(project => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearFilters}
            data-testid="button-clear-filters"
          >
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {templatesLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TemplateCardSkeleton />
          <TemplateCardSkeleton />
          <TemplateCardSkeleton />
        </div>
      ) : filteredTemplates && filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredTemplates.map((template) => (
            <TemplateCard 
              key={template.id} 
              template={template} 
              collections={collections || []}
            />
          ))}
        </div>
      ) : (
        <Card className="py-16" data-testid="card-empty-state">
          <CardContent className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-empty-title">
              {hasActiveFilters ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto" data-testid="text-empty-description">
              {hasActiveFilters 
                ? "Try adjusting your search terms or filters"
                : "Create a template from a project to start designing interviews"
              }
            </p>
            {hasActiveFilters && (
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={clearFilters}
                data-testid="button-clear-filters-empty"
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
