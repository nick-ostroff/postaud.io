import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  crons: [
    { path: "/api/jobs/tick", schedule: "* * * * *" },
  ],
};
