import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, AlertTriangle, Plus } from "lucide-react";
import type { Inventory, Store, Product } from "@shared/schema";
import { cn } from "@/lib/utils";

type InventoryRow = Inventory & { productName?: string; storeName?: string };

export default function InventoryPage() {
  const [filterStore, setFilterStore] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ productId: "", storeId: "", quantity: "" });

  const { data: inventoryData, isLoading } = useQuery<InventoryRow[]>({
    queryKey: ["/api/admin/inventory", { storeId: filterStore }],
    queryFn: async () => {
      const params = filterStore ? `?storeId=${filterStore}` : "";
      const res = await fetch(`/api/admin/inventory${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: allStores } = useQuery<Store[]>({
    queryKey: ["/api/admin/stores"],
  });

  const { data: allProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const updateQtyMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      await apiRequest("PATCH", `/api/admin/inventory/${id}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
    },
  });

  const addInventoryMutation = useMutation({
    mutationFn: async (data: { productId: number; storeId: number; quantity: number }) => {
      await apiRequest("POST", "/api/admin/inventory", { ...data, reservedQty: 0 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inventory"] });
      setShowAddForm(false);
      setAddForm({ productId: "", storeId: "", quantity: "" });
    },
  });

  const lowStockItems = inventoryData?.filter((i) => i.quantity < 5) || [];

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-inventory-title">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-1">Omni-channel stock management across all outlets</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          data-testid="button-add-inventory"
          className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Stock
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addInventoryMutation.mutate({
              productId: Number(addForm.productId),
              storeId: Number(addForm.storeId),
              quantity: Number(addForm.quantity),
            });
          }}
          className="bg-background border border-border p-6 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Product</label>
            <select data-testid="select-add-product" value={addForm.productId} onChange={(e) => setAddForm({ ...addForm, productId: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none" required>
              <option value="">Select product</option>
              {allProducts?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Store</label>
            <select data-testid="select-add-store" value={addForm.storeId} onChange={(e) => setAddForm({ ...addForm, storeId: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none" required>
              <option value="">Select store</option>
              {allStores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Quantity</label>
            <input data-testid="input-add-quantity" type="number" min="0" value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none" required />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={addInventoryMutation.isPending} data-testid="button-save-inventory" className="bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {addInventoryMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Add
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {lowStockItems.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 mb-6 flex items-start gap-3" data-testid="alert-low-stock">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm">Low Stock Alert</p>
            <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">
              {lowStockItems.length} item(s) have fewer than 5 units in stock
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Filter by Store</label>
          <select
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            data-testid="select-filter-store"
            className="border border-border bg-background px-3 py-2 text-sm focus:outline-none min-w-[200px]"
          >
            <option value="">All Stores</option>
            {allStores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="bg-background border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Product</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Store</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Available</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Reserved</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Update</th>
                </tr>
              </thead>
              <tbody>
                {(!inventoryData || inventoryData.length === 0) ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No inventory records</td></tr>
                ) : (
                  inventoryData.map((inv) => (
                    <tr key={inv.id} className={cn("border-b border-border/50 hover:bg-secondary/30", inv.quantity < 5 && "bg-yellow-50/50 dark:bg-yellow-900/10")} data-testid={`row-inventory-${inv.id}`}>
                      <td className="px-6 py-4">{inv.productName || `#${inv.productId}`}</td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.storeName || `#${inv.storeId}`}</td>
                      <td className="px-6 py-4">
                        <span className={cn("font-semibold", inv.quantity < 5 && "text-red-600")}>
                          {inv.quantity}
                        </span>
                        {inv.quantity < 5 && <AlertTriangle className="w-3 h-3 text-red-500 inline ml-1" />}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{inv.reservedQty}</td>
                      <td className="px-6 py-4">
                        <InlineQtyEditor
                          currentQty={inv.quantity}
                          onSave={(qty) => updateQtyMutation.mutate({ id: inv.id, quantity: qty })}
                          isPending={updateQtyMutation.isPending}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function InlineQtyEditor({ currentQty, onSave, isPending }: { currentQty: number; onSave: (qty: number) => void; isPending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentQty));

  if (!editing) {
    return (
      <button onClick={() => { setValue(String(currentQty)); setEditing(true); }} className="text-xs border border-border px-3 py-1 hover:bg-secondary transition-colors" data-testid="button-edit-qty">
        Edit
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 border border-border bg-background px-2 py-1 text-xs focus:outline-none"
        autoFocus
      />
      <button
        onClick={() => { onSave(Number(value)); setEditing(false); }}
        disabled={isPending}
        className="text-xs bg-foreground text-background px-2 py-1 hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs border border-border px-2 py-1 hover:bg-secondary">
        ✕
      </button>
    </div>
  );
}
