import { useEffect, useState } from "react";
import { Link } from "wouter";
import { X, Sparkles, Copy } from "lucide-react";
import { useActiveCampaign } from "@/hooks/use-campaign";
import { useToast } from "@/hooks/use-toast";

export function PromoStrip() {
  const { data: campaign } = useActiveCampaign();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!campaign) return;
    const key = `accenza-promo-strip-dismissed-${campaign.id}`;
    setDismissed(localStorage.getItem(key) === "1");
  }, [campaign?.id]);

  const visible = !!campaign && !dismissed;

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.style.setProperty("--accenza-strip-h", "36px");
    else root.style.setProperty("--accenza-strip-h", "0px");
    return () => {
      root.style.setProperty("--accenza-strip-h", "0px");
    };
  }, [visible]);

  if (!campaign || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(`accenza-promo-strip-dismissed-${campaign.id}`, "1");
  };

  const copyCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(campaign.promoCode);
      toast({ title: "Code copied", description: campaign.promoCode });
    } catch {}
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] bg-foreground text-background"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="container mx-auto px-4 md:px-6 py-2 flex items-center justify-between gap-3">
        <Link
          href={campaign.ctaLink}
          className="flex items-center gap-2 flex-1 min-w-0 text-[10px] sm:text-xs uppercase tracking-widest font-semibold"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {campaign.eyebrow || "New Collection"} · {campaign.title} — <span className="underline">{campaign.ctaLabel || "Explore now"}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={copyCode}
          className="hidden sm:inline-flex items-center gap-1.5 border border-background/40 px-2.5 py-1 text-[10px] uppercase tracking-widest font-semibold hover:bg-background hover:text-foreground transition-colors shrink-0"
          aria-label={`Copy code ${campaign.promoCode}`}
        >
          <span>Code {campaign.promoCode}</span>
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={dismiss}
          className="p-1 shrink-0 hover:opacity-80"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
