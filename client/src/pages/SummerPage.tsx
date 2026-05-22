import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Truck, RefreshCw } from "lucide-react";
import { useActiveCampaign } from "@/hooks/use-campaign";
import { useProducts } from "@/hooks/use-products";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";

const QUICK_TILES = [
  { label: "Earrings", href: "/category/Jewellery?sub=Studs" },
  { label: "Necklaces", href: "/category/Jewellery?sub=Necklaces" },
  { label: "Cosmetics", href: "/category/Cosmetics" },
  { label: "Tote Bags", href: "/category/Handbags?sub=Tote+Bags" },
  { label: "Sunglasses", href: "/category/Accessories?sub=Sunglasses" },
  { label: "Jewellery Sets", href: "/category/Jewellery?sub=Jewellery+Sets" },
];

export default function CampaignPage() {
  const { data: campaign } = useActiveCampaign();
  const { data: products, isLoading } = useProducts();
  const featured = products?.slice(0, 8) || [];

  useEffect(() => {
    const TITLE = `${campaign?.title || "New Collection"} | ACCENZA`;
    const DESC = campaign?.subtitle || "Curated jewellery, cosmetics, handbags & accessories for the modern Indian woman.";
    const canonicalUrl = `${window.location.origin}/campaign`;

    const prev = {
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    };
    document.title = TITLE;

    const setMeta = (selector: string, attr: string, name: string, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
      if (!el) {
        if (selector.startsWith("link")) {
          el = document.createElement("link");
          (el as HTMLLinkElement).rel = name;
        } else {
          el = document.createElement("meta");
          el.setAttribute(attr, name);
        }
        document.head.appendChild(el);
      }
      if (el instanceof HTMLLinkElement) el.href = content;
      else el.setAttribute("content", content);
    };

    setMeta('meta[name="description"]', "name", "description", DESC);
    setMeta('meta[property="og:title"]', "property", "og:title", TITLE);
    setMeta('meta[property="og:description"]', "property", "og:description", DESC);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('link[rel="canonical"]', "rel", "canonical", canonicalUrl);

    const promo = new URLSearchParams(window.location.search).get("promo");
    if (promo) sessionStorage.setItem("accenza-promo-code", promo.toUpperCase());

    return () => {
      document.title = prev.title;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute("content", prev.desc);
    };
  }, [campaign]);

  useEffect(() => {
    if (campaign?.promoCode && !sessionStorage.getItem("accenza-promo-code")) {
      sessionStorage.setItem("accenza-promo-code", campaign.promoCode);
    }
  }, [campaign?.promoCode]);

  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      {/* Hero banner */}
      <section className="container mx-auto px-4 md:px-6 mb-12 md:mb-16">
        <div className="relative w-full aspect-[16/9] md:aspect-[21/8] bg-foreground text-background overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
          <div className="absolute inset-0 flex flex-col justify-center px-6 md:px-16 lg:px-24 max-w-3xl">
            <span className="text-white/85 text-[10px] md:text-xs uppercase tracking-[0.3em] font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> {campaign?.eyebrow || "New Collection · ACCENZA"}
            </span>
            <h1 className="text-white font-display text-4xl md:text-6xl lg:text-7xl font-light tracking-wide leading-tight mb-3 md:mb-5">
              {campaign?.title || "Curated for Her"}
            </h1>
            <p className="text-white/90 text-sm md:text-lg mb-5 md:mb-7 max-w-xl">
              {campaign?.subtitle || "Jewellery, cosmetics, handbags & accessories — handpicked for the modern Indian woman."}
            </p>
            <div className="inline-flex items-center gap-3 flex-wrap">
              <Link
                href={campaign?.ctaLink || "/category/Jewellery"}
                className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 text-xs uppercase tracking-widest font-semibold hover:gap-4 transition-all"
              >
                {campaign?.ctaLabel || "Explore Collection"} <ArrowRight className="w-4 h-4" />
              </Link>
              <span className="text-white text-xs uppercase tracking-widest font-semibold">
                Free Shipping Pan India
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="container mx-auto px-4 md:px-6 mb-12 md:mb-16">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {[
            { icon: Sparkles, title: "Curated Quality", body: "Every piece handpicked for style, quality & value." },
            { icon: Truck, title: "Pan-India Delivery", body: "Fast, tracked shipping to your doorstep." },
            { icon: RefreshCw, title: "Easy Returns", body: "Hassle-free 7-day return & exchange policy." },
          ].map((p) => (
            <div key={p.title} className="border border-border p-5 md:p-6">
              <p.icon className="w-5 h-5 mb-3 text-primary" />
              <h3 className="text-sm uppercase tracking-widest font-semibold mb-1">{p.title}</h3>
              <p className="text-xs text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shop the edit */}
      <section className="container mx-auto px-4 md:px-6 mb-16">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-5">
          <h2 className="font-display text-2xl md:text-3xl font-light tracking-wide">Shop the Edit</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {QUICK_TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group relative aspect-square overflow-hidden bg-amber-50 flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span className="text-white font-display text-lg md:text-xl font-medium tracking-wide">{tile.label}</span>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="container mx-auto px-4 md:px-6 mb-16">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-5">
          <h2 className="font-display text-2xl md:text-3xl font-light tracking-wide">New Arrivals</h2>
          <Link href="/category/Jewellery" className="text-xs uppercase tracking-widest font-semibold hover:text-muted-foreground">Browse All</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="container mx-auto px-4 md:px-6">
        <div className="border border-foreground p-8 md:p-12 text-center">
          <h3 className="font-display text-2xl md:text-4xl font-light tracking-wide">Discover your signature style.</h3>
          <p className="text-sm text-muted-foreground mt-3 mb-6">Jewellery, cosmetics, handbags & accessories — all in one place.</p>
          <Link
            href="/category/Jewellery"
            className="inline-block bg-foreground text-background py-3.5 px-10 text-xs uppercase tracking-widest font-semibold hover:opacity-90"
          >
            Start Shopping
          </Link>
        </div>
      </section>
    </div>
  );
}
