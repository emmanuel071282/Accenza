import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, Plus, X, Printer, Barcode } from "lucide-react";
import type { Product } from "@shared/schema";
import { SUBCATEGORIES, getAllSubcategories, getSizesForProduct } from "@shared/schema";
import JsBarcode from "jsbarcode";

const CATEGORIES = ["Mens", "Ladies", "Kids", "Accessories", "Footwear", "Cosmetics"];

function BarcodeModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (product.barcode && svgRef.current) {
      JsBarcode(svgRef.current, product.barcode, {
        format: "EAN13",
        width: 2,
        height: 80,
        displayValue: true,
        font: "monospace",
        fontSize: 14,
        textMargin: 6,
      });
    }
  }, [product.barcode]);

  const handlePrint = () => {
    if (!svgRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Barcode - ${product.name}</title>
        <style>
          body { display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:100vh; margin:0; font-family:sans-serif; }
          .name { font-size:14px; font-weight:bold; margin-bottom:8px; text-transform:uppercase; letter-spacing:2px; }
          .price { font-size:12px; color:#666; margin-top:4px; }
        </style></head>
        <body>
          <div class="name">${product.name}</div>
          ${svgRef.current.outerHTML}
          <div class="price">MRP: Rs. ${product.price}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-widest">Barcode</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider">{product.name}</p>
          <div className="flex justify-center">
            <svg ref={svgRef} />
          </div>
          <p className="text-xs text-muted-foreground">MRP: Rs. {product.price}</p>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handlePrint}
            className="flex-1 bg-foreground text-background py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print Barcode
          </button>
          <button
            onClick={onClose}
            className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ArticlesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    costPrice: "",
    imageUrl: "",
    category: "",
    subcategory: "",
  });
  const [autoSizes, setAutoSizes] = useState<string[]>([]);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form & { sizes: string[] }) => {
      const res = await apiRequest("POST", "/api/admin/products", data);
      return res.json();
    },
    onSuccess: (newProduct: Product) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setBarcodeProduct(newProduct);
      setShowAddForm(false);
      setForm({ name: "", description: "", price: "", costPrice: "", imageUrl: "", category: "", subcategory: "" });
      setAutoSizes([]);
    },
  });

  const handleCategoryChange = (category: string) => {
    setForm((prev) => ({ ...prev, category, subcategory: "" }));
    setAutoSizes([]);
  };

  const handleSubcategoryChange = (subcategory: string) => {
    setForm((prev) => ({ ...prev, subcategory }));
    const sizes = getSizesForProduct(form.category, subcategory);
    setAutoSizes(sizes);
  };

  const subcategoryList = form.category && SUBCATEGORIES[form.category]
    ? getAllSubcategories(SUBCATEGORIES[form.category])
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, sizes: autoSizes });
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
          <p className="text-muted-foreground text-sm mt-1">Product catalogue with EAN-13 barcodes</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Article
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-background border border-border p-6 mb-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Article Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="e.g. Cotton Linen Shirt"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground min-h-[80px]"
                placeholder="Product description..."
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Selling Price (Rs.)</label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, "") })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="999"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Cost Price (Rs.)</label>
              <input
                type="text"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Image URL</label>
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="https://images.unsplash.com/..."
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Category</label>
              <select
                value={form.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Subcategory</label>
              <select
                value={form.subcategory}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                required
                disabled={!form.category}
              >
                <option value="">Select subcategory</option>
                {subcategoryList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {autoSizes.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Sizes (Auto-assigned)</label>
              <div className="flex flex-wrap gap-1.5">
                {autoSizes.map((size) => (
                  <span key={size} className="px-2.5 py-1 bg-secondary text-xs font-medium border border-border">
                    {size}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-foreground text-background px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Add Article
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAutoSizes([]); }}
              className="border border-border px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="bg-background border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Barcode</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Selling Price</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Cost Price</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!products || products.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No articles yet. Click "Add Article" to create one.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 text-muted-foreground">#{p.id}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.barcode || "—"}</td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category} / {p.subcategory}</td>
                      <td className="px-4 py-3">Rs. {p.price}</td>
                      <td className="px-4 py-3 text-muted-foreground">Rs. {p.costPrice || "0"}</td>
                      <td className="px-4 py-3">
                        {p.barcode ? (
                          <button
                            onClick={() => setBarcodeProduct(p)}
                            className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 hover:bg-secondary transition-colors"
                          >
                            <Barcode className="w-3.5 h-3.5" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {barcodeProduct && (
        <BarcodeModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
    </AdminLayout>
  );
}
