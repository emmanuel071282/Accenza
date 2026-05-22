import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Truck, Sun, RefreshCw } from "lucide-react";
import { useActiveCampaign } from "@/hooks/use-campaign";
import { useProducts } from "@/hooks/use-products";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";

const QUICK_TILES = [
  { label: "Cord Sets", href: "/category/Ladies?sub=Cord+Sets", img: "/products/cordset-07-mustard-anarkali.jpeg" },
  { label: "Muscle Tees", href: "/category/Mens?sub=Muscle+Tees", img: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=800&auto=format&fit=crop" },
  { label: "Jewellery", href: "/category/Accessories?sub=Jewellery", img: "/products/jewel-02-square-stud-model.png" },
  { label: "Footwear", href: "/category/Footwear", img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=800&auto=format&fit=crop" },
  { label: "Kids Edit", href: "/category/Kids", img: "https://images.unsplash.com/photo-1622290319238-b8144c78f3a0?q=80&w=800&auto=format&fit=crop" },
  { label: "Ladies Western", href: "/category/Ladies", img: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=800&auto=format&fit=crop" },
];

export default function SummerPage() {
  const { data: campaign } = useActiveCampaign();
  const { data: products, isLoading } = useProducts();
  const bestSellers = products?.slice(0, 8) || [];

  useEffect(() => {
    const TITLE = "Hello Summer — The New Summer ’26 Range | BESTA";
    const DESC = "Say hello to summer with BESTA — the new Summer ’26 range of linens, cord sets, holiday dresses and breezy footwear. Free shipping across India.";
    const ogImage = `${window.location.origin}/marketing/summer/banner-1x1-01.svg`;
    const canonicalUrl = `${window.location.origin}/summer`;

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
    setMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", TITLE);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", DESC);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    setMeta('link[rel="canonical"]', "rel", "canonical", canonicalUrl);

    const promo = new URLSearchParams(window.location.search).get("promo");
    if (promo) sessionStorage.setItem("besta-promo-code", promo.toUpperCase());

    return () => {
      document.title = prev.title;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute("content", prev.desc);
    };
  }, []);

  useEffect(() => {
    if (campaign?.promoCode && !sessionStorage.getItem("besta-promo-code")) {
      sessionStorage.setItem("besta-promo-code", campaign.promoCode);
    }
  }, [campaign?.promoCode]);

  return (
    <div className="min-h-screen bg-background pt-28 pb-20" data-testid="page-summer">
      <section className="container mx-auto px-4 md:px-6 mb-12 md:mb-16">
        <div className="relative w-full aspect-[16/9] md:aspect-[21/8] bg-foreground text-background overflow-hidden">
          <img
            src={campaign?.heroImageUrl || "/marketing/summer/banner-1x1-01.svg"}
            alt="BESTA Summer"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-6 md:px-16 lg:px-24 max-w-3xl">
            <span className="text-white/85 text-[10px] md:text-xs uppercase tracking-[0.3em] font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> {campaign?.eyebrow || "New Range · Summer ’26"}
            </span>
            <h1 className="text-white text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tighter leading-[0.95] mb-3 md:mb-5 uppercase">
              {campaign?.title || "Hello Summer"}
            </h1>
            <p className="text-white/90 text-sm md:text-lg font-medium mb-5 md:mb-7 max-w-xl">
              {campaign?.subtitle || "The new Summer ’26 range has landed — linens, cord sets, holiday dresses & breezy footwear."}
            </p>
            <div className="inline-flex items-center gap-3 flex-wrap">
              <Link
                href={campaign?.ctaLink || "/"}
                data-testid="link-summer-hero-cta"
                className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 text-xs uppercase tracking-widest font-semibold hover:gap-4 transition-all"
              >
                {campaign?.ctaLabel || "Explore The Range"} <ArrowRight className="w-4 h-4" />
              </Link>
              <span className="text-white text-xs uppercase tracking-widest font-semibold">
                Free Shipping Pan India
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6 mb-12 md:mb-16">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {[
            { icon: Sun, title: "New Range", body: "Fresh Summer ’26 edits added across categories." },
            { icon: Truck, title: "Free Shipping", body: "On every summer order across India." },
            { icon: RefreshCw, title: "Easy Returns", body: "15-day return window on the new range." },
          ].map((p) => (
            <div key={p.title} className="border border-border p-5 md:p-6">
              <p.icon className="w-5 h-5 mb-3" />
              <h3 className="text-sm uppercase tracking-widest font-semibold mb-1">{p.title}</h3>
              <p className="text-xs text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6 mb-16">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-5">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter uppercase">Shop The Edit</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {QUICK_TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              data-testid={`tile-summer-${tile.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="group relative aspect-square overflow-hidden bg-secondary"
            >
              <img
                src={tile.img}
                alt={tile.label}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span className="text-white font-display text-lg md:text-xl font-bold tracking-tighter uppercase">{tile.label}</span>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6 mb-16">
        <div className="flex items-end justify-between mb-8 border-b border-border pb-5">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter uppercase">Best Sellers</h2>
          <Link href="/" className="text-xs uppercase tracking-widest font-semibold hover:text-muted-foreground">Browse All</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : bestSellers.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      <section className="container mx-auto px-4 md:px-6">
        <div className="border border-foreground p-8 md:p-12 text-center">
          <h3 className="font-display text-2xl md:text-4xl font-bold tracking-tighter uppercase">Say hello to your summer wardrobe.</h3>
          <p className="text-sm text-muted-foreground mt-3 mb-6">Hand-picked fits across linens, cord sets, holiday dresses & breezy footwear.</p>
          <Link
            href="/"
            data-testid="link-summer-shop-cta"
            className="inline-block bg-foreground text-background py-3.5 px-10 text-xs uppercase tracking-widest font-semibold hover:opacity-90"
          >
            Start Shopping
          </Link>
        </div>
      </section>
    </div>
  );
}
