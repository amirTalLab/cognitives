import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The "Create New Project" routes read .claude/skills/*/SKILL.md at request time so the
  // web app and an interactive Claude Code session share one set of instructions. Those
  // .md files are outside the import graph, so file tracing would leave them out of the
  // deployed serverless bundle — this pulls them in explicitly.
  outputFileTracingIncludes: {
    // The schema source is read as the generation contract, so it must be bundled as a
    // FILE, not just compiled — being imported elsewhere is not enough.
    "/api/create/**": [".claude/skills/**/*.md", "lib/experiment-runtime/schema.ts"],
  },
};

export default nextConfig;
