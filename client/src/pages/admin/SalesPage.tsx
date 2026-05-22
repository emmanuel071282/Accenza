import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "./AdminLayout";
import { Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesData {
  report: { date: string; orders: number; revenue: number }[];
  topProducts: { productId: number; name: string; totalQuantity: number; totalRevenue: number }[];
}

export default function SalesPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<SalesData>({
    queryKey: ["/api/admin/sales", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/sales?days=${days}`, { credentials: "include" });
      return res.json();
    },
  });

  const totalRevenue = data?.report.reduce((sum, r) => sum + r.revenue, 0) || 0;
  const totalOrders = data?.report.reduce((sum, r) => sum + r.orders, 0) || 0;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const maxRevenue = Math.max(...(data?.report.map(r => r.revenue) || [1]));

  return (
    <AdminLayout>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-sales-title">Sales Report</h1>
          <p className="text-muted-foreground text-sm mt-1">Revenue and sales analytics</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              data-testid={`btn-days-${d}`}
              className={cn(
                "px-4 py-2 text-[10px] uppercase tracking-widest font-semibold border transition-colors",
                days === d
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground"
              )}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="bg-background border border-border p-6" data-testid="stat-total-revenue">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Revenue ({days}D)</span>
              <p className="text-2xl font-bold mt-2">₹{totalRevenue.toLocaleString("en-IN")}</p>
            </div>
            <div className="bg-background border border-border p-6" data-testid="stat-total-orders">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Orders ({days}D)</span>
              <p className="text-2xl font-bold mt-2">{totalOrders}</p>
            </div>
            <div className="bg-background border border-border p-6" data-testid="stat-avg-order">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Avg Order Value</span>
              <p className="text-2xl font-bold mt-2">₹{Math.round(avgOrderValue).toLocaleString("en-IN")}</p>
            </div>
          </div>

          <div className="bg-background border border-border p-6 mb-10">
            <h2 className="text-lg font-semibold mb-6">Daily Revenue</h2>
            {data?.report && data.report.length > 0 ? (
              <div className="flex items-end gap-1 h-48">
                {data.report.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      ₹{day.revenue.toLocaleString("en-IN")} · {day.orders} orders
                    </div>
                    <div
                      className="w-full bg-foreground/80 hover:bg-foreground transition-colors rounded-t min-h-[2px]"
                      style={{ height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%` }}
                    />
                    <span className="text-[8px] text-muted-foreground rotate-[-45deg] origin-top-left mt-1 hidden lg:block">
                      {new Date(day.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No sales data for this period</p>
            )}
          </div>

          <div className="bg-background border border-border">
            <div className="p-6 border-b border-border flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <h2 className="text-lg font-semibold">Top Selling Products</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">#</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Product</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Qty Sold</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(!data?.topProducts || data.topProducts.length === 0) ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No sales data yet</td></tr>
                  ) : (
                    data.topProducts.map((p, i) => (
                      <tr key={p.productId} className="border-b border-border/50" data-testid={`row-top-product-${p.productId}`}>
                        <td className="px-6 py-4 text-muted-foreground">{i + 1}</td>
                        <td className="px-6 py-4 font-medium">{p.name}</td>
                        <td className="px-6 py-4">{p.totalQuantity}</td>
                        <td className="px-6 py-4 font-semibold">₹{Number(p.totalRevenue).toLocaleString("en-IN")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
