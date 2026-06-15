import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@shared/schema";

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  _hydrated: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addItem: (product: Product, quantity?: number, size?: string) => void;
  removeItem: (productId: number, size?: string) => void;
  updateQuantity: (productId: number, quantity: number, size?: string) => void;
  clearCart: () => void;
  get cartTotal(): number;
  get itemCount(): number;
}

function cartKey(productId: number, size?: string) {
  return `${productId}__${size || ""}`;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      _hydrated: false,

      setIsOpen: (isOpen) => set({ isOpen }),

      addItem: (product, quantity = 1, size = "") => {
        set((state) => {
          const existingItem = state.items.find(
            (item) => item.product.id === product.id && item.selectedSize === size
          );

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id && item.selectedSize === size
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
              isOpen: true,
            };
          }

          return {
            items: [...state.items, { product, quantity, selectedSize: size }],
            isOpen: true,
          };
        });
      },

      removeItem: (productId, size) => {
        set((state) => ({
          items: state.items.filter(
            (item) => !(item.product.id === productId && (size === undefined || item.selectedSize === size))
          ),
        }));
      },

      updateQuantity: (productId, quantity, size) => {
        set((state) => ({
          items: quantity > 0
            ? state.items.map((item) =>
                item.product.id === productId && (size === undefined || item.selectedSize === size)
                  ? { ...item, quantity }
                  : item
              )
            : state.items.filter(
                (item) => !(item.product.id === productId && (size === undefined || item.selectedSize === size))
              ),
        }));
      },

      clearCart: () => set({ items: [] }),

      get cartTotal() {
        return get().items.reduce(
          (total, item) => total + Number(item.product.price) * item.quantity,
          0
        );
      },

      get itemCount() {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: "fashion-cart-storage",
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Use setTimeout so useCart is defined before we call setState
          setTimeout(() => useCart.setState({ _hydrated: true }), 0);
        }
      },
    }
  )
);
