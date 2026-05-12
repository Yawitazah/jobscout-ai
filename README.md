# JobScout AI

JobScout AI is an intelligent job search assistant that helps candidates discover relevant opportunities, tailor their applications, and track their job hunt — all in one place. It combines a modern Next.js frontend with a FastAPI backend to deliver real-time job matching and AI-powered resume feedback.

## Setup

```bash
# Install all dependencies from the repo root
pnpm install

# Start the Next.js dev server
pnpm dev
```

The web app will be available at [http://localhost:3000](http://localhost:3000).

## Folder Structure

```
jobscout-ai/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router, TypeScript, Tailwind CSS)
│   └── api/          # FastAPI backend service (set up in prompt 1.6)
├── packages/
│   └── shared/       # Shared TypeScript types used by both web and api
├── pnpm-workspace.yaml
└── package.json      # Workspace root — run scripts here to target all packages
```
