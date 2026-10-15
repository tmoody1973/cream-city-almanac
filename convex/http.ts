import { httpRouter } from "convex/server";
import { targets, upload } from "./health";

// Convex's own web routes (https://<deployment>.convex.site). Only the Health Compass download script uses them.
const http = httpRouter();
http.route({ path: "/health-compass/targets", method: "GET", handler: targets });
http.route({ path: "/health-compass", method: "POST", handler: upload });
export default http;
