import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, Plus, Send, Power } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@shared/schema";

type DiscountType = "percent" | "flat";

interface CampaignForm {
  slug: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  ctaLabel: string;
  ctaLink: string;
  heroImageUrl: string;
  promoCode: string;
  discountType: DiscountType;
  discountValue: string;
  minOrder: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

type CampaignFormStringKey =
  | "slug" | "title" | "subtitle" | "eyebrow" | "ctaLabel"
  | "ctaLink" | "heroImageUrl" | "promoCode";

const TEXT_FIELDS: ReadonlyArray<{ key: CampaignFormStringKey; label: string; fullWidth?: boolean }> = [
  { key: "slug", label: "Slug (unique)" },
  { key: "promoCode", label: "Promo Code" },
  { key: "title", label: "Title" },
  { key: "eyebrow", label: "Eyebrow / Badge" },
  { key: "subtitle", label: "Subtitle", fullWidth: true },
  { key: "ctaLabel", label: "CTA Label" },
  { key: "ctaLink", label: "CTA Link" },
  { key: "heroImageUrl", label: "Hero Image URL" },
];

const EMPTY_FORM: CampaignForm = {
  slug: "summer-2026",
  title: "Hello Summer",
  subtitle: "The new Summer '26 range has landed — linens, cord sets, holiday dresses & breezy footwear.",
  eyebrow: "New Range · Summer '26",
  ctaLabel: "Explore The Range",
  ctaLink: "/summer",
  heroImageUrl: "/marketing/summer/banner-1x1-01.svg",
  promoCode: "ACCENZASUMMER",
  discountType: "percent",
  discountValue: "15",
  minOrder: "999",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  isActive: true,
};

export default function CampaignsPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({ queryKey: ["/api/admin/campaigns"] });

  useEffect(() => {
    if (editing) {
      setForm({
        slug: editing.slug,
        title: editing.title,
        subtitle: editing.subtitle,
        eyebrow: editing.eyebrow,
        ctaLabel: editing.ctaLabel,
        ctaLink: editing.ctaLink,
        heroImageUrl: editing.heroImageUrl,
        promoCode: editing.promoCode,
        discountType: editing.discountType as DiscountType,
        discountValue: String(editing.discountValue),
        minOrder: String(editing.minOrder),
        startDate: new Date(editing.startDate).toISOString().slice(0, 10),
        endDate: new Date(editing.endDate).toISOString().slice(0, 10),
        isActive: editing.isActive,
      });
    }
  }, [editing]);

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        startDate: new Date(form.startDate + "T00:00:00").toISOString(),
        endDate: new Date(form.endDate + "T23:59:59").toISOString(),
      };
      if (editing) {
        await apiRequest("PATCH", `/api/admin/campaigns/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/campaigns", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/active"] });
      toast({ title: editing ? "Campaign updated" : "Campaign created" });
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Campaign) => {
      await apiRequest("PATCH", `/api/admin/campaigns/${c.id}`, { isActive: !c.isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/active"] });
    },
  });

  const blast = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/campaigns/${id}/blast`);
      return res.json();
    },
    onSuccess: (data: { recipients: number; sent: number; simulated: number }) => {
      toast({
        title: "WhatsApp blast queued",
        description: `${data.recipients} recipients · ${data.sent} sent · ${data.simulated} simulated`,
      });
    },
    onError: (e: Error) => toast({ title: "Blast failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-campaigns-title">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage app-wide promos and re-engagement blasts.</p>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(!showForm); }}
          data-testid="button-new-campaign"
          className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }}
          className="bg-background border border-border p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {TEXT_FIELDS.map(({ key, label, fullWidth }) => (
            <div key={key} className={fullWidth ? "md:col-span-2" : ""}>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">{label}</label>
              <input
                data-testid={`input-campaign-${key}`}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                required
              />
            </div>
          ))}
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Discount Type</label>
            <select
              data-testid="select-campaign-discount-type"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as DiscountType })}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="percent">Percent</option>
              <option value="flat">Flat ₹</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Discount Value</label>
            <input
              data-testid="input-campaign-discount-value"
              type="number"
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Min Order ₹</label>
            <input
              data-testid="input-campaign-min-order"
              type="number"
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Start</label>
            <input
              data-testid="input-campaign-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">End</label>
            <input
              data-testid="input-campaign-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                data-testid="checkbox-campaign-active"
              />
              Active (deactivates other campaigns)
            </label>
          </div>
          <div className="md:col-span-2 flex gap-3">
            <button
              type="submit"
              disabled={upsert.isPending}
              data-testid="button-save-campaign"
              className="bg-foreground text-background px-6 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {upsert.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              {editing ? "Update Campaign" : "Create Campaign"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); }}
              className="border border-border px-6 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns?.length === 0 && (
            <p className="text-muted-foreground text-sm">No campaigns yet. Create one to power the in-app promo strip, popup and /summer landing page.</p>
          )}
          {campaigns?.map((c) => (
            <div key={c.id} className="bg-background border border-border p-5" data-testid={`card-campaign-${c.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.slug}</span>
                  <h3 className="font-semibold mt-1">{c.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{c.subtitle}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded ${c.isActive ? "bg-green-100 text-green-800" : "bg-secondary text-muted-foreground"}`}>
                  {c.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                <div><span className="text-muted-foreground block text-[10px] uppercase">Code</span><strong>{c.promoCode}</strong></div>
                <div><span className="text-muted-foreground block text-[10px] uppercase">Discount</span>{c.discountType === "percent" ? `${c.discountValue}%` : `₹${c.discountValue}`}</div>
                <div><span className="text-muted-foreground block text-[10px] uppercase">Min Order</span>₹{c.minOrder}</div>
              </div>
              <div className="text-[11px] text-muted-foreground mb-4">
                {new Date(c.startDate).toLocaleDateString("en-IN")} → {new Date(c.endDate).toLocaleDateString("en-IN")}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setEditing(c); setShowForm(true); }}
                  data-testid={`button-edit-campaign-${c.id}`}
                  className="text-xs border border-border px-3 py-1.5 hover:bg-secondary"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive.mutate(c)}
                  data-testid={`button-toggle-campaign-${c.id}`}
                  className="text-xs border border-border px-3 py-1.5 hover:bg-secondary flex items-center gap-1"
                >
                  <Power className="w-3 h-3" /> {c.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => blast.mutate(c.id)}
                  disabled={blast.isPending}
                  data-testid={`button-blast-campaign-${c.id}`}
                  className="text-xs bg-foreground text-background px-3 py-1.5 hover:opacity-90 flex items-center gap-1 disabled:opacity-50"
                >
                  {blast.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  WhatsApp Blast
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
