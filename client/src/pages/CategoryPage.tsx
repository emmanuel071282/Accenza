import { useRoute, useLocation, useSearch } from "wouter";
import { useProductsByCategory } from "@/hooks/use-products";
import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";
import { SUBCATEGORIES, isGroupedSubcategories, getAllSubcategories } from "@shared/schema";
import type { SubcategorySection } from "@shared/schema";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export default function CategoryPage() {
  const [, params] = useRoute("/category/:category");
  const category = params?.category || "";
  const searchString = useSearch();
  const [, navigate] = useLocation();

  const urlParams = new URLSearchParams(searchString);
  const subFromUrl = urlParams.get("sub") || undefined;
  
  const [activeSubcategory, setActiveSubcategory] = useState<string | undefined>(subFromUrl);

  useEffect(() => {
    setActiveSubcategory(subFromUrl);
  }, [subFromUrl, category]);
  
  const { data: products, isLoading, error } = useProductsByCategory(category, activeSubcategory);
  const config = SUBCATEGORIES[category];
  const isGrouped = config ? isGroupedSubcategories(config) : false;

  const pageTitle = activeSubcategory
    ? `${activeSubcategory} — ${category} | ACCENZA`
    : `${category} — ACCENZA`;
  usePageMeta({
    title: pageTitle,
    description: `Shop the latest ${activeSubcategory ?? category} styles at ACCENZA. Fast fashion, Indian prices.`,
  });

  const handleSubcategoryClick = (sub?: string) => {
    setActiveSubcategory(sub);
    if (sub) {
      navigate(`/category/${category}?sub=${encodeURIComponent(sub)}`, { replace: true });
    } else {
      navigate(`/category/${category}`, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      <div className="container mx-auto px-4 md:px-6">
        
        <div className="mb-8 md:mb-12">
          <h1 data-testid="text-category-title" className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tighter mb-2">
            {category}
          </h1>
          {activeSubcategory && (
            <p data-testid="text-active-subcategory" className="text-lg font-medium text-foreground/80 mb-2">
              {activeSubcategory}
            </p>
          )}
          <p className="text-muted-foreground max-w-2xl">
            Discover the latest styles and essentials in our {category.toLowerCase()} collection.
          </p>
        </div>

        {config && activeSubcategory && (
          <div className="mb-8" data-testid="subcategory-breadcrumb">
            <div className="flex items-center gap-3">
              <button
                data-testid="button-subcategory-all"
                onClick={() => handleSubcategoryClick(undefined)}
                className="px-4 py-2.5 text-xs uppercase tracking-widest font-semibold border border-border bg-transparent text-foreground hover:border-foreground transition-colors whitespace-nowrap"
              >
                ← All {category}
              </button>
              <span className="px-4 py-2.5 text-xs uppercase tracking-widest font-semibold border bg-foreground text-background border-foreground whitespace-nowrap">
                {activeSubcategory}
              </span>
            </div>
          </div>
        )}

        {config && !activeSubcategory && isGrouped && (
          <div className="mb-8" data-testid="subcategory-filters">
            <div className="space-y-6">
              {(config as SubcategorySection[]).map((group) => (
                <div key={group.section}>
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-3">{group.section}</h3>
                  <div className="flex flex-wrap gap-2 overflow-x-auto">
                    {group.items.map((sub) => (
                      <button
                        key={sub}
                        data-testid={`button-subcategory-${sub.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => handleSubcategoryClick(sub)}
                        className="px-4 py-2 text-xs uppercase tracking-widest font-semibold border border-border bg-transparent text-foreground hover:border-foreground transition-colors whitespace-nowrap"
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {config && !activeSubcategory && !isGrouped && (
          <div className="mb-8 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-2 md:gap-3 min-w-max md:flex-wrap" data-testid="subcategory-filters">
              {(config as string[]).map((sub) => (
                <button
                  key={sub}
                  data-testid={`button-subcategory-${sub.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => handleSubcategoryClick(sub)}
                  className="px-4 py-2.5 text-xs uppercase tracking-widest font-semibold border border-border bg-transparent text-foreground hover:border-foreground transition-colors whitespace-nowrap"
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between py-4 border-y border-border mb-8">
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
              Filter
            </button>
            <span data-testid="text-product-count" className="text-sm text-muted-foreground hidden sm:inline">
              {products?.length || 0} items
            </span>
          </div>
          
          <button className="flex items-center gap-2 text-sm font-medium hover:text-muted-foreground transition-colors">
            Sort by: Featured
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {error ? (
          <div className="py-20 text-center text-destructive">
            <p>Failed to load products. Please try again later.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
            {isLoading 
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : products?.length === 0 
                ? (
                  <div className="col-span-full py-24 text-center">
                    <p className="text-lg text-muted-foreground">No products found in this category.</p>
                  </div>
                )
                : products?.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
