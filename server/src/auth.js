import jwt from "jsonwebtoken";

export function signToken(user) {
  return jwt.sign(
    { uuid: user.uuid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Autenticacao necessaria." });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Somente o administrador pode fazer isso." });
  }
  return next();
}

// Lê o usuário do token (se houver) sem rejeitar quando não há token.
// Usado em rotas que precisam ser acessíveis sem login (ex.: primeiro registro).
export function resolveUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}
