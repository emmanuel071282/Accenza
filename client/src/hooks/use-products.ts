import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useProducts() {
  return useQuery({
    queryKey: [api.products.list.path],
    queryFn: async () => {
      const res = await fetch(api.products.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();
      return parseWithLogging(api.products.list.responses[200], data, "products.list");
    },
  });
}

export function useProductsByCategory(category: string, subcategory?: string) {
  const basePath = buildUrl(api.products.getByCategory.path, { category });
  const url = subcategory ? `${basePath}?subcategory=${encodeURIComponent(subcategory)}` : basePath;
  
  return useQuery({
    queryKey: [api.products.getByCategory.path, category, subcategory || "all"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch products for category: ${category}`);
      const data = await res.json();
      return parseWithLogging(api.products.getByCategory.responses[200], data, "products.getByCategory");
    },
    enabled: !!category,
  });
}

export function useProduct(id: number) {
  const url = buildUrl(api.products.get.path, { id });
  
  return useQuery({
    queryKey: [api.products.get.path, id],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch product ${id}`);
      const data = await res.json();
      return parseWithLogging(api.products.get.responses[200], data, "products.get");
    },
    enabled: !!id,
  });
}
