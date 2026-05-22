import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@shared/schema";

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
