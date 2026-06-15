import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, Plus, X, Trash2 } from "lucide-react";

type Category = { id: number; name: string; subcategories: string[] };

export default function CategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [subInput, setSubInput] = useState("");
  const [subs, setSubs] = useState<string[]>([]);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/admin/categories"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/categories", { name: name.trim(), subcategories: subs });
      return res.json();
    },
    onSuccess: () => { invalidate(); setShowForm(false); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/categories/${id}`);
    },
    onSuccess: invalidate,
  });

  const resetForm = () => { setName(""); setSubInput(""); setSubs([]); };

  const addSub = () => {
    const trimmed = subInput.trim();
    if (trimmed && !subs.includes(trimmed)) {
      setSubs((prev) => [...prev, trimmed]);
      setSubInput("");
    }
  };

  const handleSubKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSub(); }
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage product categories and subcategories</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {showForm && (
        <div className="bg-background border border-border p-6 mb-8 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Category Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              placeholder="e.g. Footwear"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">
              Subcategories <span className="text-muted-foreground font-normal normal-case tracking-normal">(type and press Enter or comma)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={handleSubKeyDown}
                className="flex-1 border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="e.g. Heels"
              />
              <button
                type="button"
                onClick={addSub}
                className="border border-border px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
              >
                Add
              </button>
            </div>
            {subs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {subs.map((s) => (
                  <span key={s} className="flex items-center gap-1 bg-secondary border border-border px-2.5 py-1 text-xs font-medium">
                    {s}
                    <button onClick={() => setSubs((prev) => prev.filter((x) => x !== s))} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className="bg-foreground text-background px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Save Category
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="border border-border px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-500">{(createMutation.error as Error)?.message || "Failed to create category"}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="bg-background border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Subcategories</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No categories yet.</td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium">{cat.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(cat.subcategories || []).map((s) => (
                            <span key={s} className="bg-secondary border border-border px-2 py-0.5 text-[11px]">{s}</span>
                          ))}
                          {(!cat.subcategories || cat.subcategories.length === 0) && (
                            <span className="text-muted-foreground text-xs">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { if (confirm(`Delete category "${cat.name}"?`)) deleteMutation.mutate(cat.id); }}
                          disabled={deleteMutation.isPending}
                          className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
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
