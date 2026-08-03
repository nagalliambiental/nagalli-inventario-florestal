import "dotenv/config";
import express from "express";
import cors from "cors";
import { initSchema } from "./db.js";
import authRouter from "./routes/auth.js";
import syncRouter from "./routes/sync.js";

const app = express();
app.use(cors());
// Limite alto para aceitar fotos em base64 no sync.
app.use(express.json({ limit: "150mb" }));

app.get("/", (_req, res) =>
  res.json({
    service: "NAGALLI API",
    status: "ok",
    health: "/health",
    endpoints: {
      auth: ["POST /auth/register", "POST /auth/login", "GET /auth/me", "GET /auth/bootstrap", "GET /auth/users", "DELETE /auth/users/:uuid"],
      sync: ["POST /sync/push", "GET /sync/pull?since=<ISO>"],
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/sync", syncRouter);

// Erro padrao
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const port = Number(process.env.PORT) || 3000;

initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`NAGALLI server rodando na porta ${port}`);
    });
  })
  .catch((e) => {
    console.error("Falha ao inicializar o banco:", e);
    process.exit(1);
  });
