import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import pool from "../db.js";
import { signToken, requireAuth, requireAdmin } from "../auth.js";

const router = Router();

// POST /auth/register
// Cria uma conta. O PRIMEIRO usuario registrado vira administrador (bootstrap).
// Depois disso, so administradores podem criar contas (token obrigatorio).
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password e name sao obrigatorios." });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    // Autentica o solicitante (opcional: bootstrap nao precisa de token).
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    let requester = null;
    if (token) {
      try {
        requester = jwt.verify(token, process.env.JWT_SECRET);
      } catch {}
    }

    const { rows } = await pool.query("SELECT COUNT(*) AS n FROM users");
    const userCount = Number(rows[0].n);

    if (userCount > 0 && (!requester || requester.role !== "admin")) {
      return res.status(403).json({ error: "Somente o administrador pode criar contas." });
    }

    const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Ja existe uma conta com este email." });
    }

    const finalRole = userCount === 0 ? "admin" : requester?.role === "admin" ? (role === "worker" ? "worker" : "admin") : "worker";
    const hash = await bcrypt.hash(String(password), 10);
    const uuid = randomUUID();
    await pool.query(
      `INSERT INTO users (uuid, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuid, normalizedEmail, hash, String(name).trim(), finalRole]
    );

    return res.status(201).json({
      user: { uuid, email: normalizedEmail, name: String(name).trim(), role: finalRole },
    });
  } catch (e) {
    console.error("register error", e);
    return res.status(500).json({ error: "Erro interno ao criar a conta." });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email e password sao obrigatorios." });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [normalizedEmail]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Email ou senha incorretos." });
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Email ou senha incorretos." });
    }
    const payload = { uuid: user.uuid, email: user.email, name: user.name, role: user.role };
    return res.json({ token: signToken(payload), user: payload });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ error: "Erro interno ao fazer login." });
  }
});

// GET /auth/bootstrap — diz se já existe algum usuário (para o primeiro acesso).
router.get("/bootstrap", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) AS n FROM users");
    return res.json({ users: Number(rows[0].n) });
  } catch (e) {
    console.error("bootstrap error", e);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// GET /auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT uuid, email, name, role, created_at FROM users WHERE uuid = $1",
      [req.user.uuid]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Usuario nao encontrado." });
    }
    return res.json({ user: rows[0] });
  } catch (e) {
    console.error("me error", e);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// GET /auth/users (somente admin) — lista as contas cadastradas
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT uuid, email, name, role, created_at FROM users ORDER BY name"
    );
    return res.json({ users: rows });
  } catch (e) {
    console.error("list users error", e);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// DELETE /auth/users/:uuid (somente admin) — remove uma conta
router.delete("/users/:uuid", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.params.uuid === req.user.uuid) {
      return res.status(400).json({ error: "Voce nao pode remover a propria conta." });
    }
    const result = await pool.query("DELETE FROM users WHERE uuid = $1", [req.params.uuid]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario nao encontrado." });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("delete user error", e);
    return res.status(500).json({ error: "Erro interno." });
  }
});

export default router;
