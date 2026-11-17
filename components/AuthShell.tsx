//
//  AuthShell.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 27/09/2026.
//
import LogoCelebration from "@/components/LogoCelebration";
import { LanguagePicker } from "@/components/Localization";

export default function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="auth-page"><section className="auth-card"><div className="pils-brand items-center"><LogoCelebration className="mx-auto h-20 w-auto" /><LanguagePicker /></div><div><h1>{title}</h1><p>{description}</p></div>{children}</section></main>;
}
