import "dotenv/config";
import { app } from "./app";
import { runMaintenance } from "./booking";

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
setInterval(() => runMaintenance().catch((e) => console.error("maintenance failed", e)), 60_000);
