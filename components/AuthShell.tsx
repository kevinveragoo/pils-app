import Image from "next/image";
import { LanguagePicker } from "@/components/Localization";

export default function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="auth-page"><section className="auth-card"><div className="pils-brand items-center"><Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority className="mx-auto h-20 w-auto" /><LanguagePicker /></div><div><h1>{title}</h1><p>{description}</p></div>{children}</section></main>;
}
