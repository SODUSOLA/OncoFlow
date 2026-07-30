import "dotenv/config";
import { createApp } from "./app.js";

const port = parseInt(process.env.PORT ?? "3000", 10);

const app = createApp();

app.listen(port, () => {
  console.log(`oncoflow api listening on :${String(port)}`);
});