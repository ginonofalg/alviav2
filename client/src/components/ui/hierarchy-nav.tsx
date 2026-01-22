import { Link } from "wouter";
import { ChevronRight, FolderKanban, FileText, Play, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type HierarchyLevel = "project" | "template" | "collection" | "session";

interface BreadcrumbItem {
  label: string;
  href?: string;
  level: HierarchyLevel;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const levelConfig: Record<HierarchyLevel, { icon: typeof FolderKanban; color: string; bgColor: string }> = {
  project: {
    icon: FolderKanban,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  template: {
    icon: FileText,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  collection: {
    icon: Play,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  session: {
    icon: Mic,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
};

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-sm", className)}
      data-testid="nav-breadcrumb"
    >
      {items.map((item, index) => {
        const config = levelConfig[item.level];
        const Icon = config.icon;
        const isLast = index === items.length - 1;
        const testId = isLast ? `breadcrumb-${item.level}-current` : `breadcrumb-${item.level}`;

        return (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
            )}
            {item.href && !isLast ? (
              <Link href={item.href}>
                <span
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
                    "hover:bg-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50",
                    config.color
                  )}
                  data-testid={testId}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="max-w-[150px] truncate">{item.label}</span>
                </span>
              </Link>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md",
                  isLast ? "font-medium text-foreground" : config.color
                )}
                data-testid={testId}
                aria-current={isLast ? "page" : undefined}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="max-w-[200px] truncate">{item.label}</span>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

interface HierarchyHeaderProps {
  level: HierarchyLevel;
  title: string;
  subtitle?: string;
  breadcrumbItems?: BreadcrumbItem[];
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
}

export function HierarchyHeader({
  level,
  title,
  subtitle,
  breadcrumbItems,
  actions,
  badges,
  className,
}: HierarchyHeaderProps) {
  const config = levelConfig[level];
  const Icon = config.icon;

  return (
    <div className={cn("space-y-3", className)}>
      {breadcrumbItems && breadcrumbItems.length > 0 && (
        <Breadcrumb items={breadcrumbItems} />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-lg shrink-0",
              config.bgColor
            )}
            data-testid="icon-hierarchy-level"
          >
            <Icon className={cn("w-6 h-6", config.color)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-2xl font-semibold tracking-tight truncate max-w-[400px]"
                data-testid="heading-page-title"
              >
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p
                className="text-muted-foreground mt-1 line-clamp-2"
                data-testid="text-page-subtitle"
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function getLevelLabel(level: HierarchyLevel): string {
  const labels: Record<HierarchyLevel, string> = {
    project: "Project",
    template: "Template",
    collection: "Collection",
    session: "Session",
  };
  return labels[level];
}

export { levelConfig };
