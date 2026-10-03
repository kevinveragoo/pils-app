import { NextResponse } from "next/server";
import { isAppLocale, localeCookieName } from "@/lib/localization";

export async function POST(request: Request) {
  const formData = await request.formData();
  const locale = String(formData.get("locale") ?? "");
  const requestedPath = String(formData.get("pathname") ?? "/");
  const pathname = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const publicOrigin = host ? `${protocol}://${host}` : new URL(request.url).origin;
  const response = NextResponse.redirect(new URL(pathname, publicOrigin), 303);
  if (isAppLocale(locale)) {
    response.cookies.set(localeCookieName, locale, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.AUTH_COOKIE_SECURE === "true",
      path: "/",
      maxAge: 31_536_000,
    });
  }
  return response;
}
