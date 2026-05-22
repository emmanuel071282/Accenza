import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order, OrderItem } from "@shared/schema";
import { ORDER_STATUSES } from "@shared/schema";

const STATUS_TABS = ["all", ...ORDER_STATUSES] as const;

const statusColors: Record<string, string> = {
  placed: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-cyan-100 text-cyan-800",
  ready_to_ship: "bg-teal-100 text-teal-800",
  shipped: "bg-indigo-100 text-indigo-800",
  in_transit: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  rto: "bg-orange-100 text-orange-800",
};

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const { data: allOrders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/admin/orders/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
    },
  });

  const filteredOrders = activeTab === "all"
    ? allOrders
    : allOrders?.filter((o) => o.status === activeTab);

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-orders-title">Orders</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage and track all orders</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            className={cn(
              "px-4 py-2 text-[10px] uppercase tracking-widest font-semibold border transition-colors",
              activeTab === tab
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground"
            )}
          >
            {tab} {tab !== "all" && allOrders ? `(${allOrders.filter(o => o.status === tab).length})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="bg-background border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground w-8"></th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Order #</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Customer</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Amount</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Payment</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Date</th>
                  <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!filteredOrders || filteredOrders.length === 0) ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No orders found</td></tr>
                ) : (
                  filteredOrders.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      isExpanded={expandedOrder === order.id}
                      onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                      onUpdateStatus={(status) => updateStatusMutation.mutate({ id: order.id, status })}
                      statusColors={statusColors}
                    />
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

function OrderRow({ order, isExpanded, onToggle, onUpdateStatus, statusColors }: {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (status: string) => void;
  statusColors: Record<string, string>;
}) {
  const { data: items } = useQuery<(OrderItem & { productName?: string; productImage?: string })[]>({
    queryKey: ["/api/admin/orders", order.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/orders/${order.id}/items`, { credentials: "include" });
      return res.json();
    },
    enabled: isExpanded,
  });

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-secondary/30" data-testid={`row-order-${order.id}`}>
        <td className="px-6 py-4">
          <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-6 py-4 font-mono text-xs">{order.orderNumber}</td>
        <td className="px-6 py-4">{order.shippingName}</td>
        <td className="px-6 py-4 font-semibold">₹{Number(order.totalAmount).toLocaleString("en-IN")}</td>
        <td className="px-6 py-4 text-xs uppercase">{order.paymentMethod}</td>
        <td className="px-6 py-4">
          <span className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded ${statusColors[order.status] || "bg-gray-100"}`}>
            {order.status.replace(/_/g, " ")}
          </span>
        </td>
        <td className="px-6 py-4 text-muted-foreground text-xs">{new Date(order.createdAt).toLocaleDateString("en-IN")}</td>
        <td className="px-6 py-4">
          <select
            value={order.status}
            onChange={(e) => onUpdateStatus(e.target.value)}
            className="text-xs border border-border bg-background px-2 py-1 focus:outline-none"
            data-testid={`select-status-${order.id}`}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-secondary/20">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">Shipping Address</span>
                <p>{order.shippingName}</p>
                <p>{order.shippingAddress}</p>
                <p>{order.shippingCity}, {order.shippingState} - {order.shippingPincode}</p>
                <p>Phone: {order.shippingPhone}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">Shipping Info</span>
                {order.shiprocketOrderId && <p>Shiprocket: #{order.shiprocketOrderId}</p>}
                {order.awbNumber && <p>AWB: <span className="font-mono">{order.awbNumber}</span></p>}
                {order.courierName && <p>Courier: {order.courierName}</p>}
                {order.invoiceNumber && <p>Invoice: {order.invoiceNumber}</p>}
                {order.paymentStatus && <p>Payment: <span className="uppercase">{order.paymentStatus}</span></p>}
                {!order.shiprocketOrderId && !order.awbNumber && <p className="text-muted-foreground italic">Not shipped yet</p>}
              </div>
            </div>
            {items && items.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">Items</span>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 text-xs">
                      {item.productImage && (
                        <img src={item.productImage} alt="" className="w-10 h-10 object-cover" />
                      )}
                      <span className="flex-1">
                        {item.productName || `Product #${item.productId}`}
                        {item.size && item.size !== "Free Size" && <span className="text-muted-foreground ml-1">({item.size})</span>}
                      </span>
                      <span className="text-muted-foreground">x{item.quantity}</span>
                      <span className="font-semibold">₹{Number(item.price).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
