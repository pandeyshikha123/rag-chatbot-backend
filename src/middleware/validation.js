export function requireFields(fields = []) {
  return (req, res, next) => {
    for (const f of fields) {
      if (req.body[f] === undefined) return res.status(400).json({ error: `Missing field ${f}` });
    }
    next();
  };
}
