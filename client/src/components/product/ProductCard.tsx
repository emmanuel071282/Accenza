import { useLocation } from "wouter";
import type { Product } from "@shared/schema";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { Button } from "@/components/ui/button";
import { Plus, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const [, navigate] = useLocation();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();

  const active = isInWishlist(product.id);

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  return (
    <div
      data-testid={`card-product-${product.id}`}
      className="group block w-full cursor-pointer outline-none"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary mb-4">
        <img
          src={product.imageUrl}
          alt={product.name}
          width={400} height={533}
          className="object-cover w-full h-full img-hover-zoom"
          loading="lazy"
        />
        
        <button
          data-testid={`button-wishlist-${product.id}`}
          onClick={(e) => { e.stopPropagation(); toggleItem(product); }}
          aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={active}
          className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 hover:bg-white"
        >
          <Heart className={cn("w-4 h-4 transition-colors", active ? "fill-red-500 stroke-red-500" : "stroke-foreground")} />
        </button>

        <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300">
          <Button
            data-testid={`button-quickadd-${product.id}`}
            onClick={(e) => { e.stopPropagation(); addItem(product); }}
            className="w-full bg-white/90 hover:bg-white text-black border border-transparent shadow-lg backdrop-blur-sm transition-colors rounded-none font-medium text-xs tracking-wider"
          >
            <Plus className="w-4 h-4 mr-2" />
            Quick Add
          </Button>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between items-start gap-4">
          <h3 className="font-medium text-sm text-foreground leading-snug">{product.name}</h3>
          <span data-testid={`text-price-${product.id}`} className="font-semibold text-sm whitespace-nowrap">₹{Number(product.price).toLocaleString('en-IN')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{product.category}</p>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="w-full animate-pulse">
      <div className="aspect-[3/4] bg-secondary mb-4" />
      <div className="space-y-2">
        <div className="h-4 bg-secondary w-3/4" />
        <div className="h-3 bg-secondary w-1/4" />
      </div>
    </div>
  );
}
