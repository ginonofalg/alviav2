import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import ProjectsPage from "@/pages/projects";
import NewProjectPage from "@/pages/project-new";
import ProjectDetailPage from "@/pages/project-detail";
import TemplateBuilderPage from "@/pages/template-builder";
import CollectionsPage from "@/pages/collections";
import SessionsPage from "@/pages/sessions";
import SessionDetailPage from "@/pages/session-detail";
import AnalyticsPage from "@/pages/analytics";
import SettingsPage from "@/pages/settings";
import InterviewConsentPage from "@/pages/interview-consent";
import InterviewPage from "@/pages/interview";
import NotFound from "@/pages/not-found";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1">
          <header className="flex items-center justify-between h-14 px-4 border-b bg-background/80 backdrop-blur-md sticky top-0 z-40 gap-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedRoutes() {
  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/projects" component={ProjectsPage} />
        <Route path="/projects/new" component={NewProjectPage} />
        <Route path="/projects/:id" component={ProjectDetailPage} />
        <Route path="/projects/:projectId/templates/new" component={TemplateBuilderPage} />
        <Route path="/collections" component={CollectionsPage} />
        <Route path="/sessions" component={SessionsPage} />
        <Route path="/sessions/:id" component={SessionDetailPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function InterviewRoutes() {
  return (
    <Switch>
      <Route path="/join/:collectionId" component={InterviewConsentPage} />
      <Route path="/interview/:sessionId" component={InterviewPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <Skeleton className="w-16 h-16 rounded-xl mx-auto" />
        <Skeleton className="w-32 h-4 mx-auto" />
      </div>
    </div>
  );
}

function Router() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Switch>
      <Route path="/join/:collectionId" component={InterviewConsentPage} />
      <Route path="/interview/:sessionId" component={InterviewPage} />
      <Route>
        {isAuthenticated ? <AuthenticatedRoutes /> : <LandingPage />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
