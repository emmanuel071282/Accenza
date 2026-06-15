import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@shared/schema";

const STORIES = [
  { label: "Jewellery", href: "/category/Jewellery", emoji: "💎", bg: "bg-amber-50" },
  { label: "Cosmetics", href: "/category/Cosmetics", emoji: "💄", bg: "bg-rose-50" },
  { label: "Handbags", href: "/category/Handbags", emoji: "👜", bg: "bg-stone-100" },
  { label: "Accessories", href: "/category/Accessories", emoji: "✨", bg: "bg-amber-100" },
  { label: "New In", href: "/category/Jewellery", emoji: "🆕", bg: "bg-green-50" },
  { label: "Offers", href: "/campaign", emoji: "🎁", bg: "bg-purple-50" },
];

const HERO_CATEGORIES = [
  {
    name: "Jewellery",
    tagline: "Timeless Pieces",
    description: "Earrings, necklaces, bangles & sets for every occasion",
    href: "/category/Jewellery",
    bg: "bg-amber-50",
  },
  {
    name: "Cosmetics",
    tagline: "Glow Beautifully",
    description: "Makeup, skincare & fragrances curated for you",
    href: "/category/Cosmetics",
    bg: "bg-rose-50",
  },
  {
    name: "Handbags",
    tagline: "Carry in Style",
    description: "Totes, clutches, sling bags & potli bags",
    href: "/category/Handbags",
    bg: "bg-stone-100",
  },
  {
    name: "Accessories",
    tagline: "Complete the Look",
    description: "Scarves, sunglasses, watches & more",
    href: "/category/Accessories",
    bg: "bg-amber-100",
  },
];

export default function Home() {
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const featured = products.slice(0, 8);

  return (
    <div className="pt-24">

      {/* Story highlights */}
      <section className="container mx-auto px-4 md:px-6 pt-6 pb-4">
        <div className="flex items-center gap-5 overflow-x-auto pb-2 scrollbar-none">
          {STORIES.map((s) => (
            <Link key={s.label} href={s.href} className="flex flex-col items-center gap-2 shrink-0 group">
              <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full ${s.bg} flex items-center justify-center text-2xl md:text-3xl border-2 border-transparent group-hover:border-primary transition-all`}>
                {s.emoji}
              </div>
              <span className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                {s.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Hero */}
      <section className="container mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">New Collection</p>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-light tracking-wide text-foreground mb-6">
          Curated for<br />Her
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-10 text-lg">
          Jewellery, cosmetics, handbags & accessories — handpicked for the modern Indian woman.
        </p>
        <Link
          href="/category/Jewellery"
          className="inline-block bg-primary text-primary-foreground px-10 py-3.5 text-xs uppercase tracking-widest font-semibold hover:bg-primary/90 transition-colors"
        >
          Explore Collection
        </Link>
      </section>

      {/* Category grid */}
      <section className="container mx-auto px-4 md:px-6 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {HERO_CATEGORIES.map((cat) => (
            <Link key={cat.name} href={cat.href}>
              <div className={`${cat.bg} p-8 md:p-10 text-center hover:opacity-90 transition-opacity cursor-pointer h-48 md:h-64 flex flex-col justify-center`}>
                <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">{cat.tagline}</p>
                <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground mb-2">{cat.name}</h2>
                <p className="text-xs text-muted-foreground hidden md:block">{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      {featured.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 pb-24">
          <div className="flex items-center justify-between mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-light tracking-wide">New Arrivals</h2>
            <Link href="/category/Jewellery" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              View All
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Our Story */}
      <section className="container mx-auto px-4 md:px-6 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Our Story</p>
          <h2 className="font-display text-3xl md:text-5xl font-light tracking-wide">
            Born from a love of<br className="hidden md:block" /> Indian craftsmanship
          </h2>
          <p className="text-muted-foreground leading-relaxed text-lg max-w-xl mx-auto">
            Accenza was founded with a simple belief — every Indian woman deserves access to beautifully crafted jewellery, cosmetics and accessories without compromise. We work directly with artisans and curators to bring you pieces that celebrate tradition and modern style in equal measure.
          </p>
          <div className="grid grid-cols-3 gap-8 pt-8 max-w-sm mx-auto">
            <div className="text-center">
              <p className="font-display text-3xl font-light">500+</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Products</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="font-display text-3xl font-light">10k+</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Customers</p>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl font-light">All India</p>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Delivery</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brand promise */}
      <section className="bg-primary/5 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-2xl mb-4">💎</div>
              <h3 className="font-display text-xl mb-2">Curated Quality</h3>
              <p className="text-sm text-muted-foreground">Every piece handpicked for style, quality and value</p>
            </div>
            <div>
              <div className="text-2xl mb-4">🚚</div>
              <h3 className="font-display text-xl mb-2">Pan-India Delivery</h3>
              <p className="text-sm text-muted-foreground">Fast, tracked shipping to your doorstep</p>
            </div>
            <div>
              <div className="text-2xl mb-4">✨</div>
              <h3 className="font-display text-xl mb-2">Easy Returns</h3>
              <p className="text-sm text-muted-foreground">Hassle-free 7-day return & exchange policy</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
