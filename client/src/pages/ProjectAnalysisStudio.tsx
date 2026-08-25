import { Redirect, useParams } from "wouter";

/** Compatibility redirect for bookmarks created before analysis moved here. */
export default function ProjectAnalysisStudio() {
  const { id = "" } = useParams<{ id: string }>();
  return <Redirect to={id ? `/projects/${id}` : "/"} replace />;
}
