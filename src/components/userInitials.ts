// Up to two initials from the full name (falls back to the email)
export const initials = (name?: string, email?: string) => {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const pick = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2);
  return pick.toUpperCase();
};
