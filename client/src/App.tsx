import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UiLanguageProvider } from "./contexts/UiLanguageContext";

const ProjectList = lazy(() => import("./pages/ProjectList"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const ProjectRecycleBin = lazy(() => import("./pages/ProjectRecycleBin"));
const ProjectAnalysisStudio = lazy(
  () => import("./pages/ProjectAnalysisStudio")
);
const ProjectUpload = lazy(() => import("./pages/ProjectUpload"));
const FieldSettings = lazy(() => import("./pages/FieldSettings"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const InternalStorage = lazy(() => import("./pages/InternalStorage"));
const IterationWorkspace = lazy(() => import("./pages/IterationWorkspace"));
const FeedbackWorkspace = lazy(() => import("./pages/FeedbackWorkspace"));
const CollaborationApprovals = lazy(
  () => import("./pages/CollaborationApprovals")
);
const CollaborationAudit = lazy(() => import("./pages/CollaborationAudit"));
const CollaborationAnnotations = lazy(
  () => import("./pages/CollaborationAnnotations")
);
const CollaborationDashboard = lazy(
  () => import("./pages/CollaborationDashboard")
);
const CollaborationMembers = lazy(() => import("./pages/CollaborationMembers"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const Login = lazy(() => import("./pages/Login"));
const LinkSharePage = lazy(() => import("./pages/LinkSharePage"));
const ShareDemo = lazy(() => import("./pages/ShareDemo"));
const HostedLanding = lazy(() => import("./pages/HostedLanding"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));
const PortalDownloads = lazy(() => import("./pages/PortalDownloads"));
const PortalFileViewer = lazy(() => import("./pages/PortalFileViewer"));
const PortalProjectDetail = lazy(() => import("./pages/PortalProjectDetail"));
const ShareProject = lazy(() => import("./pages/ShareProject"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Router() {
  const hosted = !["127.0.0.1", "localhost"].includes(window.location.hostname);
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground"
          role="status"
        >
          正在加载界面…
        </div>
      }
    >
      <Switch>
        <Route path="/demo/share" component={ShareDemo} />
        <Route path="/share/:token" component={LinkSharePage} />
        <Route path="/" component={hosted ? HostedLanding : ProjectList} />
        <Route path="/projects/new" component={ProjectUpload} />
        <Route path="/projects/recycle-bin" component={ProjectRecycleBin} />
        <Route path="/settings/fields" component={FieldSettings} />
        <Route path="/settings" component={AccountSettings} />
        <Route path="/internal-storage" component={InternalStorage} />
        {!hosted ? (
          <Route path="/feedback" component={FeedbackWorkspace} />
        ) : null}
        {!hosted ? (
          <Route path="/improvements" component={IterationWorkspace} />
        ) : null}
        <Route
          path="/projects/:id/analysis"
          component={ProjectAnalysisStudio}
        />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route
          path="/collaboration/projects/:projectId"
          component={ShareProject}
        />
        <Route path="/collaboration/members" component={CollaborationMembers} />
        <Route
          path="/collaboration/approvals"
          component={CollaborationApprovals}
        />
        <Route path="/collaboration/audit" component={CollaborationAudit} />
        <Route
          path="/collaboration/annotations"
          component={CollaborationAnnotations}
        />
        <Route path="/collaboration" component={CollaborationDashboard} />
        <Route
          path="/portal/projects/:publicationId/files/:fileId"
          component={PortalFileViewer}
        />
        <Route
          path="/portal/projects/:publicationId"
          component={PortalProjectDetail}
        />
        <Route path="/portal/downloads" component={PortalDownloads} />
        <Route path="/portal" component={PortalDashboard} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/login" component={Login} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <UiLanguageProvider>
          <TooltipProvider>
            <Toaster theme="light" position="top-right" />
            <Router />
          </TooltipProvider>
        </UiLanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
