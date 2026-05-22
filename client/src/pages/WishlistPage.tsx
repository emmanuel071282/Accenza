import { useWishlist } from "@/hooks/use-wishlist";
import { ProductCard } from "@/components/product/ProductCard";
import { Heart } from "lucide-react";
import { Link } from "wouter";

export default function WishlistPage() {
  const { items } = useWishlist();

  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center mb-12">
          <h1 data-testid="text-wishlist-title" className="text-4xl md:text-5xl font-display font-bold tracking-tighter mb-4 uppercase">
            Your Wishlist
          </h1>
          <p className="text-muted-foreground text-center max-w-md">
            Save your favorite pieces here. They'll be waiting for you whenever you're ready to make them yours.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6 opacity-60">
            <Heart className="w-16 h-16 stroke-1" />
            <div className="text-center">
              <p className="text-xl font-medium mb-2">Your wishlist is empty</p>
              <p className="text-sm text-muted-foreground mb-8">Start exploring our collection to find something you love.</p>
              <Link href="/" data-testid="link-start-shopping" className="inline-block border border-foreground px-8 py-3.5 text-xs uppercase tracking-widest font-semibold hover:bg-foreground hover:text-background transition-all">
                Start Shopping
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
