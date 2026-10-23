// Elisa Kevin Veragoo + ChatGPT
import AppHeader from "@/components/AppHeader";
import NotificationSettings from "@/components/NotificationSettings";
import { requireUser } from "@/lib/auth";
export default async function NotificationsPage() {
  await requireUser();
  return <div className="flex flex-1 flex-col"><AppHeader current="notifications" /><main className="mx-auto w-full max-w-2xl p-6"><NotificationSettings /></main></div>;
}
