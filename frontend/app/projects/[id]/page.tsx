import { ProjectDetailClient } from "./ProjectDetailClient";

// Thin server wrapper around the client project detail UI. Its only job beyond
// rendering the client component is to satisfy the static `output: 'export'`
// build (GitHub Pages): a client component cannot export `generateStaticParams`,
// so it lives here instead.
//
// We intentionally return an empty param set and do NOT set
// `dynamicParams = false`. In a normal server build (Docker/dev), `dynamicParams`
// stays true, so real project IDs are still rendered on demand. Only the static
// export — which has no server to render on demand — drops this route.
export async function generateStaticParams() {
  // Under `output: 'export'` Next treats an empty array as "no params" and
  // refuses to build the segment, so for the GitHub Pages export we emit a
  // single throwaway param — it produces a harmless static shell at
  // /agntcy/projects/placeholder/ that nothing links to. Normal server builds
  // get an empty list and continue to render real project IDs on demand.
  return process.env.GITHUB_PAGES === "true" ? [{ id: "placeholder" }] : [];
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailClient id={id} />;
}
