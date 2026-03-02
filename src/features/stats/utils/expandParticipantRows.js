function splitPeopleField(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\/／]/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

export function expandParticipantRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {any[]} */
  const out = [];

  for (const r of list) {
    const roles = splitPeopleField(r?.role);
    const names = splitPeopleField(r?.name);
    const n = Math.max(roles.length, names.length, 1);

    if (n <= 1) {
      out.push(r);
      continue;
    }

    const countNum = Number(r?.count);
    const hasCount = Number.isFinite(countNum) && countNum > 0;

    for (let i = 0; i < n; i += 1) {
      const next = {
        ...r,
        role: roles[i] || "",
        name: names[i] || "",
        count: 1,
      };

      if (hasCount && countNum >= n) {
        next.count = i === n - 1 ? Math.max(1, countNum - (n - 1)) : 1;
      }

      out.push(next);
    }
  }

  return out;
}


