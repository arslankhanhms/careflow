import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useLang } from "@/hooks/use-lang";
import { Languages, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function MarketingHeader({ forcePublic = false }: { forcePublic?: boolean }) {
  const router = useRouter();
  const { t, toggle, lang } = useLang();
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoggedIn = !!user && !forcePublic;
  // On the public Find-a-Doctor page, hide the duplicate "Find a Doctor" + "Sign in"
  // buttons — the page already has its own search + sign-in panel.
  const onFindDoctor = pathname.startsWith("/find-doctor");

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/"><Brand /></Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={toggle} title={lang === "en" ? "Switch to Urdu" : "Switch to English"}>
            <Languages className="mr-1 h-4 w-4" /> {t("lang.toggle")}
          </Button>
          {isLoggedIn ? (
            <>
              <Button size="sm" variant="outline" onClick={() => router.navigate({ to: "/patient/dashboard" })}>
                <LayoutDashboard className="mr-1 h-4 w-4" /> Dashboard
              </Button>
              <Button size="sm" variant="ghost" onClick={async () => { await signOut(); router.navigate({ to: "/" }); }}>
                <LogOut className="mr-1 h-4 w-4" /> Logout
              </Button>
            </>
          ) : !onFindDoctor ? (
            <>
              <Button size="sm" variant="outline" onClick={() => router.navigate({ to: "/find-doctor" })}>
                {t("nav.findDoctor")}
              </Button>
              <Button size="sm" className="bg-gradient-brand text-primary-foreground shadow-soft hover:opacity-95"
                onClick={() => router.navigate({ to: "/login" })}>
                {t("nav.signIn")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
