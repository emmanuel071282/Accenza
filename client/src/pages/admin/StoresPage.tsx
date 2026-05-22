import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, Plus, MapPin, Phone } from "lucide-react";
import type { Store } from "@shared/schema";

export default function StoresPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [form, setForm] = useState({ name: "", city: "", state: "", pincode: "", address: "", phone: "", isActive: true });

  const { data: allStores, isLoading } = useQuery<Store[]>({
    queryKey: ["/api/admin/stores"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      await apiRequest("POST", "/api/admin/stores", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof form> }) => {
      await apiRequest("PATCH", `/api/admin/stores/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      resetForm();
    },
  });

  const resetForm = () => {
    setForm({ name: "", city: "", state: "", pincode: "", address: "", phone: "", isActive: true });
    setShowForm(false);
    setEditingStore(null);
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setForm({ name: store.name, city: store.city, state: store.state, pincode: store.pincode, address: store.address, phone: store.phone, isActive: store.isActive });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStore) {
      updateMutation.mutate({ id: editingStore.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-stores-title">Stores</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage retail outlets across India</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          data-testid="button-add-store"
          className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Store
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-background border border-border p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Store Name</label>
            <input data-testid="input-store-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">City</label>
            <input data-testid="input-store-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">State</label>
            <input data-testid="input-store-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Pincode</label>
            <input data-testid="input-store-pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Address</label>
            <input data-testid="input-store-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Phone</label>
            <input data-testid="input-store-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" required />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
              Active
            </label>
          </div>
          <div className="md:col-span-2 flex gap-3">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-store" className="bg-foreground text-background px-6 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingStore ? "Update Store" : "Create Store"}
            </button>
            <button type="button" onClick={resetForm} className="border border-border px-6 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allStores?.map((store) => (
            <div key={store.id} className="bg-background border border-border p-5" data-testid={`card-store-${store.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{store.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" />
                    {store.city}, {store.state} - {store.pincode}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded ${store.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {store.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{store.address}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <Phone className="w-3 h-3" /> {store.phone}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(store)}
                  data-testid={`button-edit-store-${store.id}`}
                  className="text-xs border border-border px-3 py-1.5 hover:bg-secondary transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => updateMutation.mutate({ id: store.id, data: { isActive: !store.isActive } })}
                  data-testid={`button-toggle-store-${store.id}`}
                  className="text-xs border border-border px-3 py-1.5 hover:bg-secondary transition-colors"
                >
                  {store.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
