//
//  utils.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
