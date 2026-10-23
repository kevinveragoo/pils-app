//
//  treatment-status.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
// Preserve each instrument's existing codes and labels. Equivalent statuses have
// different legacy codes; never copy a code directly between PrEP and HIV.
export const prepStatusChoices: [string,string][] = [["1", "Active"], ["2", "No longer active"], ["4", "On demand"], ["5", "Abroad"], ["6", "Transferred to NDCCI"], ["7", "HIV positive"], ["8", "In prison"], ["99", "Other"]];
export const hivStatusChoices: [string, string][] = [
  ["1", "Active at PILS"], ["2", "Transferred to NDDCI"], ["3", "In prison"],
  ["4", "Transferred to another facility"], ["5", "Returned to PILS"],
  ["6", "Treatment interrupted"], ["7", "Lost to follow-up"], ["8", "Abroad"],
  ["9", "Deported"], ["99", "Other"], ["10", "Not interested"], ["11", "On demand"], ["12", "HIV positive"],
];
