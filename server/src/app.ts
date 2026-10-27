import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { HttpError } from "./lib";
import { auth } from "./routes/auth";
import { spaces } from "./routes/spaces";
import { bookings } from "./routes/bookings";
import { misc } from "./routes/misc";

export const app = express();
app.use(cors());
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/spaces", spaces);
app.use("/api/bookings", bookings);
app.use("/api", misc);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: "Validation failed", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  if (err?.code === "P2025") return res.status(404).json({ error: "Record not found" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
