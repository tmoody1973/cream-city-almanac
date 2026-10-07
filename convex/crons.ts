import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Mondays 09:00 UTC (4am Milwaukee time in summer, 3am in winter).
crons.cron("weekly catalog build", "0 9 * * 1", internal.build.start, {});

export default crons;
