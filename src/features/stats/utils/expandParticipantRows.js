function splitPeopleField(v) {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\/／]/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

/**
 * Expand "multi-person-in-one-response" rows into "1 person = 1 record".
 *
 * Current backend format:
 * - role: "部長/課長"
 * - name: "田中/佐藤"
 *
 * This function turns it into:
 * - { role: "部長", name: "田中", count: 1 }
 * - { role: "課長", name: "佐藤", count: 1 }
 */
export function expandParticipantRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {any[]} */
  const out = [];

  for (const r of list) {
    const roles = splitPeopleField(r?.role);
    const names = splitPeopleField(r?.name);
    const n = Math.max(roles.length, names.length, 1);

    // Nothing to expand
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
        // Default "per person" record should be 1.
        count: 1,
      };

      // If count is provided and larger than the number of filled people,
      // keep the sum consistent by putting the remainder into the last row.
      if (hasCount && countNum >= n) {
        next.count = i === n - 1 ? Math.max(1, countNum - (n - 1)) : 1;
      }

      out.push(next);
    }
  }

  return out;
}


