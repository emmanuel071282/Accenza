import { useQuery } from "@tanstack/react-query";
import AdminLayout from "./AdminLayout";
import { Loader2 } from "lucide-react";
import type { Order } from "@shared/schema";

type PeriodMetrics = {
  orders: number;
  sale: number;
  marginPercent: number;
  valuePerOrder: number;
  delivered: number;
  pending: number;
};

type DashboardMetrics = {
  ld: PeriodMetrics;
  wtd: PeriodMetrics;
  mtd: PeriodMetrics;
  ytd: PeriodMetrics;
};

const ROWS: { key: keyof PeriodMetrics; label: string; prefix?: string; suffix?: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "sale", label: "Sale", prefix: "₹", suffix: "K" },
  { key: "marginPercent", label: "Margin %", suffix: "%" },
  { key: "valuePerOrder", label: "Value Per Order", prefix: "₹" },
  { key: "delivered", label: "Delivered Orders" },
  { key: "pending", label: "Pending" },
];

const PERIODS = ["ld", "wtd", "mtd", "ytd"] as const;
const PERIOD_LABELS: Record<string, string> = {
  ld: "LD",
  wtd: "WTD",
  mtd: "MTD",
  ytd: "YTD",
};
const PERIOD_FULL: Record<string, string> = {
  ld: "Last Day",
  wtd: "Week to Date",
  mtd: "Month to Date",
  ytd: "Year to Date",
};

function formatValue(val: number, prefix?: string, suffix?: string): string {
  const formatted = val.toLocaleString("en-IN");
  return `${prefix ?? ""}${formatted}${suffix ?? ""}`;
}

export default function DashboardPage() {
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/admin/dashboard/metrics"],
  });

  const { data: recentOrders } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const statusColors: Record<string, string> = {
    placed: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    shipped: "bg-indigo-100 text-indigo-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    returned: "bg-gray-100 text-gray-800",
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Business performance overview</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* Metrics Table */}
          <div className="bg-background border border-border mb-10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-4 text-left text-[10px] uppercase tracking-widest font-semibold text-muted-foreground w-[200px]">
                      Metric
                    </th>
                    {PERIODS.map((p) => (
                      <th
                        key={p}
                        className="px-6 py-4 text-right text-[10px] uppercase tracking-widest font-semibold text-muted-foreground"
                        title={PERIOD_FULL[p]}
                      >
                        {PERIOD_LABELS[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, idx) => {
                    const isHighlight = row.key === "sale" || row.key === "marginPercent";
                    return (
                      <tr
                        key={row.key}
                        className={`border-b border-border/50 hover:bg-secondary/30 ${row.key === "sale" ? "bg-green-50/50 dark:bg-green-900/10" : ""} ${row.key === "marginPercent" ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                      >
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {row.label}
                          {row.key === "sale" && (
                            <span className="ml-2 text-[10px] text-muted-foreground font-normal">(in ₹ thousands)</span>
                          )}
                        </td>
                        {PERIODS.map((p) => {
                          const val = metrics ? metrics[p][row.key] : 0;
                          return (
                            <td key={p} className="px-6 py-4 text-right tabular-nums font-medium">
                              {metrics ? formatValue(val, row.prefix, row.suffix) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Summary Cards */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
              <div className="bg-background border border-border p-5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Today's Orders</p>
                <p className="text-2xl font-bold">{metrics.ld.orders.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-background border border-border p-5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">MTD Revenue</p>
                <p className="text-2xl font-bold">₹{metrics.mtd.sale.toLocaleString("en-IN")}K</p>
              </div>
              <div className="bg-background border border-border p-5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">YTD Orders</p>
                <p className="text-2xl font-bold">{metrics.ytd.orders.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-background border border-border p-5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.wtd.pending}</p>
              </div>
            </div>
          )}

          {/* Recent Orders */}
          <div className="bg-background border border-border">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold">Recent Orders</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Order #</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Amount</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Status</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(!recentOrders || recentOrders.length === 0) ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No orders yet</td></tr>
                  ) : (
                    recentOrders.slice(0, 10).map((order) => (
                      <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/30" data-testid={`row-order-${order.id}`}>
                        <td className="px-6 py-4 font-mono text-xs">{order.orderNumber}</td>
                        <td className="px-6 py-4">₹{Number(order.totalAmount).toLocaleString("en-IN")}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded ${statusColors[order.status] || "bg-gray-100"}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("en-IN")}</td>
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
