import { useRoute } from "wouter";
import { useProduct, useProductsByCategory } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/product/ProductCard";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { useState } from "react";
import { Check, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSizesForProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function ProductPage() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: product, isLoading, error } = useProduct(id);
  const { data: relatedProducts } = useProductsByCategory(product?.category || "");
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { toast } = useToast();
  
  const [isAdded, setIsAdded] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");

  usePageMeta({
    title: product ? `${product.name} — BESTA` : "BESTA - Fashion Shopping",
    description: product?.description ?? undefined,
    ogImage: product?.imageUrl ?? undefined,
  });

  const availableSizes = product
    ? (product.sizes && product.sizes.length > 0
        ? product.sizes
        : getSizesForProduct(product.category, product.subcategory))
    : [];

  const isFreeSize = availableSizes.length === 1 && availableSizes[0] === "Free Size";

  const handleAddToCart = () => {
    if (!product) return;
    if (!isFreeSize && !selectedSize) {
      toast({ title: "Please select a size", variant: "destructive" });
      return;
    }
    addItem(product, 1, isFreeSize ? "Free Size" : selectedSize);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const isFavorited = product ? isInWishlist(product.id) : false;

  if (error) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 flex items-center justify-center">
        <p className="text-destructive text-lg">Product not found.</p>
      </div>
    );
  }

  const filteredRelated = relatedProducts
    ?.filter(p => p.id !== product?.id)
    .slice(0, 4) || [];

  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 mb-24">
          
          <div className="w-full lg:w-3/5 bg-secondary relative aspect-[3/4] md:aspect-[4/5] lg:aspect-auto lg:h-[80vh]">
            {isLoading ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : (
              <img
                src={product?.imageUrl}
                alt={product?.name}
                width={800} height={1067}
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="w-full lg:w-2/5 flex flex-col justify-center">
            {isLoading ? (
              <div className="space-y-6">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-6 w-1/4" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-14 w-full mt-8" />
              </div>
            ) : product ? (
              <>
                <div className="mb-2">
                  <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
                    {product.category}
                  </span>
                </div>
                
                <h1 className="text-3xl md:text-4xl font-display font-medium tracking-tight mb-4" data-testid="text-product-name">
                  {product.name}
                </h1>
                
                <p className="text-2xl font-semibold mb-8" data-testid="text-product-price">
                  ₹{Number(product.price).toLocaleString('en-IN')}
                </p>

                <p className="text-muted-foreground leading-relaxed mb-8">
                  {product.description}
                </p>

                {!isFreeSize && availableSizes.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs uppercase tracking-widest font-semibold">Select Size</span>
                      {selectedSize && (
                        <span className="text-xs text-muted-foreground">Selected: {selectedSize}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2" data-testid="size-selector">
                      {availableSizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          data-testid={`button-size-${size.replace(/\s+/g, "-").toLowerCase()}`}
                          aria-pressed={selectedSize === size}
                          className={cn(
                            "min-w-[48px] px-3 py-2.5 text-sm font-medium border transition-colors text-center",
                            selectedSize === size
                              ? "border-foreground bg-foreground text-background"
                              : "border-border hover:border-foreground"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mb-12">
                  <Button 
                    onClick={handleAddToCart}
                    data-testid="button-add-to-bag"
                    className="flex-1 h-14 rounded-none text-sm uppercase tracking-widest font-bold relative overflow-hidden transition-all duration-300"
                    variant={isAdded ? "secondary" : "default"}
                  >
                    {isAdded ? (
                      <span className="flex items-center gap-2 text-green-800">
                        <Check className="w-5 h-5" /> Added to Bag
                      </span>
                    ) : (
                      "Add to Bag"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-14 w-14 rounded-none border-border hover:bg-secondary transition-colors"
                    onClick={() => product && toggleItem(product)}
                    data-testid="button-toggle-wishlist"
                    aria-label={isFavorited ? "Remove from wishlist" : "Add to wishlist"}
                    aria-pressed={isFavorited}
                  >
                    <Heart className={cn("w-5 h-5 transition-colors", isFavorited ? "fill-red-500 stroke-red-500" : "stroke-foreground")} />
                  </Button>
                </div>

                <Accordion type="single" collapsible className="w-full border-t border-border">
                  <AccordionItem value="details" className="border-border">
                    <AccordionTrigger className="text-sm font-medium hover:no-underline uppercase tracking-wide">
                      Details & Fit
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      Regular fit. True to size. Designed with a clean silhouette for versatile styling.
                      The model is 185cm and wearing size Medium.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="materials" className="border-border">
                    <AccordionTrigger className="text-sm font-medium hover:no-underline uppercase tracking-wide">
                      Materials & Care
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      100% Premium Cotton. Machine wash cold with like colors. Do not bleach. Tumble dry low. Warm iron if needed.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="shipping" className="border-border">
                    <AccordionTrigger className="text-sm font-medium hover:no-underline uppercase tracking-wide">
                      Shipping & Returns
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      Free standard shipping on orders over ₹1500. Free returns within 30 days of purchase.
                      Items must be unworn with tags attached.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            ) : null}
          </div>
        </div>

        {!isLoading && filteredRelated.length > 0 && (
          <div className="border-t border-border pt-16 mt-16">
            <h3 className="text-2xl font-display font-medium tracking-tight mb-8">
              You May Also Like
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6">
              {filteredRelated.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
