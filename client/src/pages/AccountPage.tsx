import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  User, Mail, Phone, Calendar, LogOut, Loader2,
  Package, ShieldCheck, Share2, Copy, Sparkles,
  Heart, MapPin, ChevronRight, HelpCircle, RefreshCw,
  CreditCard, Bell, FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveCampaign } from "@/hooks/use-campaign";

export default function AccountPage() {
  const [, navigate] = useLocation();
  const { user, isLoading, isLoggedIn, logout } = useAuth();
  const { toast } = useToast();
  const { data: campaign } = useActiveCampaign();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) navigate("/login");
  }, [isLoading, isLoggedIn, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn || !user) return null;

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      toast({ title: "Signed out", description: "You have been signed out successfully." });
      navigate("/");
    } catch {
      toast({ title: "Error", description: "Failed to sign out. Please try again.", variant: "destructive" });
    }
  };

  const formatBirthday = (dateStr: string) => {
    try {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const referralUrl = campaign ? `${origin}/summer?ref=${user.id}&promo=${campaign.promoCode}` : "";
  const shareText = campaign ? `Say hello to summer with me on ACCENZA — the new Summer '26 range has landed. ${referralUrl}` : "";

  const handleShare = async () => {
    if (!campaign) return;
    if (navigator.share) {
      try { await navigator.share({ title: "ACCENZA — Hello Summer", text: shareText, url: referralUrl }); } catch {}
    } else {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "Copied!", description: "Share message copied to clipboard." });
    }
  };

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    toast({ title: "Link copied", description: referralUrl });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f6] dark:bg-background pt-20 pb-20">
      {/* Profile Header */}
      <div className="bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-foreground text-background flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate" data-testid="text-user-name">{user.name}</h1>
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-1">
                <p className="text-sm text-muted-foreground" data-testid="text-user-mobile">
                  <Phone className="w-3.5 h-3.5 inline mr-1" />
                  +91 {user.mobile}
                </p>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-user-email">
                  <Mail className="w-3.5 h-3.5 inline mr-1" />
                  {user.email}
                </p>
              </div>
            </div>
            {user.role === "admin" && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 bg-foreground text-background text-[10px] uppercase tracking-widest font-semibold rounded-full">
                <ShieldCheck className="w-3 h-3" />
                Admin
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Referral / Share Banner */}
        {campaign && (
          <div className="bg-background border border-border p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="card-referral">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400">Share & Earn</span>
              </div>
              <h3 className="font-semibold text-sm">Share the Summer '26 range with friends</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Send your link — friends land straight on the new range.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleShare}
                data-testid="button-share-referral"
                className="bg-foreground text-background px-4 py-2.5 text-[11px] uppercase tracking-widest font-semibold hover:opacity-90 flex items-center gap-2"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
              <button
                onClick={handleCopyLink}
                data-testid="button-copy-referral"
                className="border border-foreground px-4 py-2.5 text-[11px] uppercase tracking-widest font-semibold hover:bg-foreground hover:text-background flex items-center gap-2 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>
        )}

        {/* Quick Action Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Link
            href="/orders"
            data-testid="link-my-orders"
            className="bg-background border border-border p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow group"
          >
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider">Orders</span>
          </Link>

          <Link
            href="/wishlist"
            data-testid="link-wishlist"
            className="bg-background border border-border p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow group"
          >
            <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-950/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Heart className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider">Wishlist</span>
          </Link>

          <Link
            href="/exchange-policy"
            data-testid="link-exchange-policy"
            className="bg-background border border-border p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow group"
          >
            <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <RefreshCw className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider">Exchange Policy</span>
          </Link>
        </div>

        {/* Profile Details Section */}
        <div className="bg-background border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest">Profile Details</h2>
          </div>

          <div className="divide-y divide-border">
            <div className="px-5 py-4 flex items-center gap-4">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Full Name</p>
                <p className="text-sm font-medium" data-testid="text-profile-name">{user.name}</p>
              </div>
            </div>

            <div className="px-5 py-4 flex items-center gap-4">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Mobile Number</p>
                <p className="text-sm font-medium" data-testid="text-profile-mobile">+91 {user.mobile}</p>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-green-700 dark:text-green-400 font-semibold flex items-center gap-1">
                Verified
              </span>
            </div>

            <div className="px-5 py-4 flex items-center gap-4">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Email Address</p>
                <p className="text-sm font-medium" data-testid="text-profile-email">{user.email}</p>
              </div>
            </div>

            <div className="px-5 py-4 flex items-center gap-4">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Birthday</p>
                <p className="text-sm font-medium" data-testid="text-profile-birthday">{formatBirthday(user.birthday)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Panel Link */}
        {user.role === "admin" && (
          <Link
            href="/admin"
            data-testid="link-admin-panel"
            className="bg-foreground text-background p-4 flex items-center gap-4 hover:opacity-90 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-wider">Admin Panel</p>
              <p className="text-xs opacity-70">Manage products, orders & inventory</p>
            </div>
            <ChevronRight className="w-5 h-5 opacity-50" />
          </Link>
        )}

        {/* Account Actions */}
        <div className="bg-background border border-border">
          <button
            data-testid="button-logout"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="w-full px-5 py-4 flex items-center gap-4 hover:bg-secondary transition-colors text-left disabled:opacity-50"
          >
            {logout.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            ) : (
              <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
            <span className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Sign Out</span>
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground pt-2">
          ACCENZA Fashion &mdash; Premium Indian Fashion
        </p>
      </div>
    </div>
  );
}
