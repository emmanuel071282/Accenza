import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { LayoutDashboard, ShoppingCart, BarChart3, Store, Package, Tag, MessageCircle, Megaphone, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/sales", label: "Sales Report", icon: BarChart3 },
  { href: "/admin/stores", label: "Stores", icon: Store },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/articles", label: "Articles", icon: Tag },
  { href: "/admin/support", label: "Support", icon: MessageCircle },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isLoading, isLoggedIn, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || user?.role !== "admin")) {
      navigate("/login");
    }
  }, [isLoading, isLoggedIn, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn || user?.role !== "admin") return null;

  return (
    <div className="min-h-screen flex bg-secondary/30">
      <aside className="w-64 bg-foreground text-background flex flex-col shrink-0 fixed inset-y-0 left-0 z-40">
        <div className="p-6 border-b border-background/10">
          <Link href="/admin" className="text-2xl font-bold tracking-tighter">ACCENZA</Link>
          <p className="text-[10px] uppercase tracking-widest text-background/50 mt-1">Admin Panel</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "flex items-center gap-3 px-6 py-3 text-sm transition-colors",
                  isActive ? "bg-background/10 text-background font-semibold" : "text-background/60 hover:text-background hover:bg-background/5"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-background/10 space-y-2">
          <Link href="/" className="block text-xs text-background/50 hover:text-background transition-colors px-2 py-1">
            View Storefront
          </Link>
          <button
            onClick={() => logout.mutateAsync().then(() => navigate("/"))}
            className="flex items-center gap-2 text-xs text-background/50 hover:text-background transition-colors px-2 py-1 w-full"
            data-testid="button-admin-logout"
          >
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
