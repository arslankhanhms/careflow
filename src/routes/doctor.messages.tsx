import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutDashboard, CalendarDays, Stethoscope, FlaskConical, ClipboardList, TrendingUp as TrendingUpIcon, MessageSquare, Sparkles, LogOut } from "lucide-react";
import { AppSidebar, AppTopbar, type SidebarSection } from "@/components/layout/app-shell";
import { MessagesInbox } from "@/components/messages-inbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/messages")({
  head: () => ({ meta: [{ title: "Messages — Doctor" }] }),
  component: DoctorMessagesPage,
});

function DoctorMessagesPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      try {
        const { data: prof } = await supabase
          .from("profiles").select("hospital_id").eq("user_id", user.id).maybeSingle();
        if (!prof?.hospital_id) { toast.error("Your profile is not linked to a hospital"); navigate({ to: "/doctor/appointments" }); return; }
        const { data: hosp } = await supabase
          .from("hospitals").select("slug").eq("id", prof.hospital_id).maybeSingle();
        if (!hosp?.slug) { toast.error("Hospital not found"); navigate({ to: "/doctor/appointments" }); return; }
        setSlug(hosp.slug);
      } finally { setResolving(false); }
    })();
  }, [user, loading]);

  const doctorSidebar: SidebarSection[] = [{
    items: [
      { label: "Overview", to: "/doctor/overview", icon: LayoutDashboard },
      { label: "Today's Appointments", to: "/doctor/appointments", icon: CalendarDays },
      { label: "My Schedule", to: "/doctor/schedule", icon: LayoutDashboard },
      { label: "My Patients", to: "/doctor/patients", icon: Stethoscope },
      { label: "Patient Reports", to: "/doctor/reports", icon: FlaskConical },
      { label: "Closure Requests", to: "/doctor/closures", icon: ClipboardList },
      { label: "My Earnings", to: "/doctor/earnings", icon: TrendingUpIcon },
      { label: "Messages", to: "/doctor/messages", icon: MessageSquare },
      { label: "AI Assistant", to: "/doctor/ai-assistant", icon: Sparkles },
    ],
  }];
  const sidebarFooter = (
    <Button size="sm" variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-1.5 h-3 w-3" /> Sign out
    </Button>
  );
  const topbarRight = <Badge variant="outline" className="capitalize text-[10px]">Doctor</Badge>;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar sections={doctorSidebar} footer={sidebarFooter} />
      <div className="flex flex-1 flex-col">
        <AppTopbar title="Messages" subtitle={user?.email ?? undefined} right={topbarRight} />
        <main className="flex-1">
          {resolving || !slug ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <MessagesInbox slug={slug} />
          )}
        </main>
      </div>
    </div>
  );
}
