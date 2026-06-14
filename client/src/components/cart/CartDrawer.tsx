import { useCart } from "@/hooks/use-cart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useLocation } from "wouter";

export function CartDrawer() {
  const { isOpen, setIsOpen, items, removeItem, updateQuantity, cartTotal } = useCart();
  const [, navigate] = useLocation();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 border-l border-border bg-background/95 backdrop-blur-xl">
        <SheetHeader className="p-6 border-b border-border/50 text-left">
          <SheetTitle className="font-display text-2xl font-light tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Your Bag ({items.length})
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <ShoppingBag className="w-16 h-16 stroke-1" />
              <div>
                <p className="text-lg font-medium">Your bag is empty</p>
                <p className="text-sm">Items remain in your bag for 60 minutes, and then they're moved to your Saved items.</p>
              </div>
              <Button 
                variant="outline" 
                className="mt-4 rounded-none border-primary"
                onClick={() => setIsOpen(false)}
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            <ul className="space-y-6">
              {items.map((item, idx) => (
                <li key={`${item.product.id}-${item.selectedSize}-${idx}`} className="flex gap-4 group">
                  <div className="w-24 h-32 bg-secondary shrink-0 overflow-hidden relative">
                    <img 
                      src={item.product.imageUrl} 
                      alt={item.product.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 pr-4">
                        <h4 className="font-medium text-sm leading-tight line-clamp-2">{item.product.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {item.product.category}
                          {item.selectedSize && <span> · Size: {item.selectedSize}</span>}
                        </p>
                      </div>
                      <p className="font-semibold text-sm shrink-0">₹{Number(item.product.price).toLocaleString('en-IN')}</p>
                    </div>
                    
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="flex items-center border border-border/60">
                        <button 
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.selectedSize)}
                          className="p-2 hover:bg-secondary transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-medium">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.selectedSize)}
                          className="p-2 hover:bg-secondary transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => removeItem(item.product.id, item.selectedSize)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-border/50 bg-background space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order value</span>
                <span>₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className="text-green-800 font-medium">Free</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t border-border/50">
                <span>Total</span>
                <span>₹{cartTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            
              <Button
                data-testid="button-checkout"
                className="w-full rounded-none py-6 text-sm uppercase tracking-widest font-semibold"
                onClick={() => { setIsOpen(false); navigate("/checkout"); }}
              >
                Continue to Checkout
              </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              We accept Visa, Mastercard, RuPay, UPI, and Net Banking.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
