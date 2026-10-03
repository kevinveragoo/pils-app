import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";
import { LocalizationProvider } from "@/components/Localization";
import { currentLocale, translationsFor } from "@/lib/localization";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PILS Services",
  description: "PILS outreach and healthcare navigation services.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await currentLocale();
  const strings = await translationsFor(locale);
  return (
    <html
      lang={locale}
      className={`${publicSans.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><LocalizationProvider key={locale} locale={locale} strings={strings}>{children}</LocalizationProvider></body>
    </html>
  );
}
