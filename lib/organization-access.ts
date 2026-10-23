// Elisa Kevin Veragoo + ChatGPT
export function isPilsUser(user: { organization?: string | null }) {
  return user.organization?.trim().toUpperCase() === "PILS";
}
