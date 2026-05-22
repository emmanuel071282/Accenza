import { Link, useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "@/hooks/use-search";
import { ShoppingBag, Search, Menu, X, Heart, ChevronDown, User, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SUBCATEGORIES, isGroupedSubcategories } from "@shared/schema";
import type { SubcategorySection } from "@shared/schema";

const CATEGORIES = ["Jewellery", "Cosmetics", "Handbags", "Accessories"];

export function Navbar() {
  const [location, navigate] = useLocation();
  const { itemCount: cartCount, setIsOpen: setCartOpen } = useCart();
  const { items: wishlistItems } = useWishlist();
  const { isLoggedIn } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMobileCategory, setExpandedMobileCategory] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { query, setQuery, results, isFetching, hasQuery } = useSearch();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setExpandedMobileCategory(null);
    setSearchOpen(false);
    setQuery("");
  }, [location]);

  // Auto-focus the search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setActiveResult(-1);
    }
  }, [searchOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setSearchOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveResult(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveResult(i => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeResult >= 0 && results[activeResult]) {
      navigate(`/product/${results[activeResult].id}`);
      setSearchOpen(false);
    }
  };

  const renderDesktopDropdown = (cat: string) => {
    const config = SUBCATEGORIES[cat];
    if (!config) return null;

    if (isGroupedSubcategories(config)) {
      return (
        <div className="absolute top-full left-0 pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200 z-50">
          <div className="bg-background border border-border shadow-lg py-4 px-6 flex gap-8 min-w-[480px]">
            {(config as SubcategorySection[]).map((group) => (
              <div key={group.section} className="min-w-[120px]">
                <span className="block text-[10px] uppercase tracking-widest font-bold text-foreground mb-3">
                  {group.section}
                </span>
                {group.items.map((sub) => (
                  <button
                    key={sub}
                    data-testid={`nav-subcategory-${cat.toLowerCase()}-${sub.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => navigate(`/category/${cat}?sub=${encodeURIComponent(sub)}`)}
                    className="block w-full text-left py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {sub}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="absolute top-full left-0 pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200 z-50">
        <div className="bg-background border border-border shadow-lg min-w-[200px] py-3">
          <Link
            href={`/category/${cat}`}
            className="block px-5 py-2.5 text-xs uppercase tracking-widest font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            View All {cat}
          </Link>
          <div className="h-px bg-border mx-4 my-2" />
          {(config as string[]).map((sub) => (
            <button
              key={sub}
              data-testid={`nav-subcategory-${cat.toLowerCase()}-${sub.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => navigate(`/category/${cat}?sub=${encodeURIComponent(sub)}`)}
              className="block w-full text-left px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {sub}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMobileSubmenu = (cat: string) => {
    const config = SUBCATEGORIES[cat];
    if (!config || expandedMobileCategory !== cat) return null;

    if (isGroupedSubcategories(config)) {
      return (
        <div className="pb-4 pl-4 space-y-4">
          {(config as SubcategorySection[]).map((group) => (
            <div key={group.section}>
              <span className="block text-[10px] uppercase tracking-widest font-bold text-foreground mb-2">
                {group.section}
              </span>
              <div className="space-y-1 pl-2">
                {group.items.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => { navigate(`/category/${cat}?sub=${encodeURIComponent(sub)}`); setMobileMenuOpen(false); }}
                    className="block w-full text-left py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="pb-4 pl-4 space-y-1">
        {(config as string[]).map((sub) => (
          <button
            key={sub}
            onClick={() => { navigate(`/category/${cat}?sub=${encodeURIComponent(sub)}`); setMobileMenuOpen(false); }}
            className="block w-full text-left py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {sub}
          </button>
        ))}
      </div>
    );
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 z-50 transition-all duration-300 border-b",
        isScrolled
          ? "bg-background/90 backdrop-blur-md border-border py-4 shadow-sm"
          : "bg-background border-transparent py-6"
      )}

    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <button
          data-testid="button-mobile-menu"
          aria-label="Open navigation menu"
          className="md:hidden p-2 -ml-2"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="hidden md:flex items-center gap-6 lg:gap-8 flex-1">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="relative group">
              <Link
                href={`/category/${cat}`}
                className={cn(
                  "text-xs uppercase tracking-widest font-medium transition-colors hover:text-foreground py-2",
                  location.startsWith(`/category/${cat}`) ? "text-foreground border-b border-foreground" : "text-muted-foreground"
                )}
              >
                {cat}
              </Link>
              {renderDesktopDropdown(cat)}
            </div>
          ))}
        </nav>

        <Link
          href="/"
          className="font-display text-2xl md:text-3xl font-bold tracking-tighter text-center flex-1 md:flex-none"
        >
          ACCENZA
        </Link>

        <div className="flex items-center justify-end gap-2 sm:gap-4 lg:gap-6 flex-1">
          <button
            aria-label={searchOpen ? "Close search" : "Open search"}
            aria-expanded={searchOpen}
            className="hidden sm:block p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          <Link
            href={isLoggedIn ? "/account" : "/login"}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-account"
          >
            <User className={cn("w-5 h-5", isLoggedIn && "fill-foreground text-foreground")} />
          </Link>

          <Link href="/wishlist" className="p-2 relative text-foreground hover:opacity-70 transition-opacity">
            <Heart className={cn("w-5 h-5", wishlistItems.length > 0 && "fill-foreground")} />
            {wishlistItems.length > 0 && (
              <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center translate-x-1 -translate-y-1">
                {wishlistItems.length}
              </span>
            )}
          </Link>

          <button
            data-testid="button-cart"
            className="p-2 relative text-foreground hover:opacity-70 transition-opacity"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center translate-x-1 -translate-y-1">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search bar — slides in below the nav row */}
      {searchOpen && (
        <div className="border-t border-border bg-background">
          <div className="container mx-auto px-4 md:px-6 py-3 relative">
            <div className="flex items-center gap-3">
              {isFetching
                ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                : <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              }
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveResult(-1); }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search for products…"
                aria-label="Search products"
                aria-autocomplete="list"
                aria-expanded={hasQuery && results.length > 0}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            {/* Results dropdown */}
            {hasQuery && (
              <ul
                role="listbox"
                aria-label="Search results"
                className="absolute left-0 right-0 top-full bg-background border border-border shadow-lg z-50 max-h-80 overflow-y-auto"
              >
                {results.length === 0 && !isFetching && (
                  <li className="px-5 py-4 text-sm text-muted-foreground">No results for "{query}"</li>
                )}
                {results.slice(0, 6).map((product, i) => (
                  <li key={product.id} role="option" aria-selected={activeResult === i}>
                    <button
                      onClick={() => { navigate(`/product/${product.id}`); setSearchOpen(false); }}
                      className={cn(
                        "flex items-center gap-4 w-full px-5 py-3 text-left hover:bg-secondary transition-colors",
                        activeResult === i && "bg-secondary"
                      )}
                    >
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        width={40} height={53}
                        className="w-10 h-14 object-cover bg-secondary shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.category} · ₹{Number(product.price).toLocaleString("en-IN")}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <span className="font-display text-xl font-bold tracking-tighter">ACCENZA</span>
            <button onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu" className="p-2" data-testid="button-close-mobile-menu">
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 px-6">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/category/${cat}`}
                    className="flex-1 text-xl font-display font-light tracking-tight py-4"
                  >
                    {cat}
                  </Link>
                  {SUBCATEGORIES[cat] && (
                    <button
                      aria-label={`${expandedMobileCategory === cat ? "Collapse" : "Expand"} ${cat} subcategories`}
                      onClick={() => setExpandedMobileCategory(expandedMobileCategory === cat ? null : cat)}
                      className="p-3"
                    >
                      <ChevronDown className={cn("w-4 h-4 transition-transform", expandedMobileCategory === cat && "rotate-180")} />
                    </button>
                  )}
                </div>
                {renderMobileSubmenu(cat)}
              </div>
            ))}
            <div className="mt-6 space-y-4">
              <Link href="/" className="block text-sm uppercase tracking-widest text-muted-foreground py-2">Home</Link>
              <Link href="/wishlist" className="block text-sm uppercase tracking-widest text-muted-foreground py-2">Wishlist</Link>
              {isLoggedIn && (
                <Link href="/orders" className="block text-sm uppercase tracking-widest text-muted-foreground py-2" data-testid="link-mobile-orders">My Orders</Link>
              )}
              <Link href={isLoggedIn ? "/account" : "/login"} className="block text-sm uppercase tracking-widest text-muted-foreground py-2" data-testid="link-mobile-account">
                {isLoggedIn ? "My Account" : "Sign In"}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
