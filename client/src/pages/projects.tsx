import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { 
  Plus, 
  Search, 
  FolderKanban,
  MoreVertical,
  FileText,
  Users,
  Calendar
} from "lucide-react";
import { levelConfig } from "@/components/ui/hierarchy-nav";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import type { Project } from "@shared/schema";

interface ProjectWithCounts extends Project {
  templateCount: number;
  sessionCount: number;
}
import { formatDistanceToNow } from "date-fns";

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  const updatedAt = project.updatedAt 
    ? formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })
    : "Recently";

  const projectConfig = levelConfig.project;
  const ProjectIcon = projectConfig.icon;

  return (
    <Card className="hover-elevate transition-all duration-200 group overflow-hidden" data-testid={`card-project-${project.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
              projectConfig.bgColor
            )}
          >
            <ProjectIcon className={cn("w-4 h-4", projectConfig.color)} />
          </div>
          <div className="space-y-1 min-w-0">
            <span className={cn("text-xs font-medium", projectConfig.color)}>
              Project
            </span>
            <Link href={`/projects/${project.id}`}>
              <CardTitle className="text-base font-medium hover:text-primary cursor-pointer truncate">
                {project.name}
              </CardTitle>
            </Link>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {project.description || "No description"}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`button-project-menu-${project.id}`}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`}>View Project</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}/edit`}>Edit Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}/templates/new`}>New Template</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="pt-0 pl-[3.25rem]">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            <span>{project.templateCount} {project.templateCount === 1 ? 'template' : 'templates'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{project.sessionCount} {project.sessionCount === 1 ? 'session' : 'sessions'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>Updated {updatedAt}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {project.piiRedactionEnabled ? "PII Protected" : "Standard"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full mt-2" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: projects, isLoading } = useQuery<ProjectWithCounts[]>({
    queryKey: ["/api/projects"],
  });

  const filteredProjects = projects?.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your research projects and interview templates
          </p>
        </div>
        <Link href="/projects/new">
          <Button data-testid="button-new-project">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : filteredProjects && filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Card className="py-16">
          <CardContent className="text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "No projects found" : "No projects yet"}
            </h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              {searchQuery 
                ? "Try adjusting your search terms"
                : "Create your first project to start conducting voice interviews"
              }
            </p>
            {!searchQuery && (
              <Link href="/projects/new">
                <Button data-testid="button-create-first-project">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
