//
//  organization-access.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 22/10/2026.
//
export function isPilsUser(user: { organization?: string | null }) {
  return user.organization?.trim().toUpperCase() === "PILS";
}
