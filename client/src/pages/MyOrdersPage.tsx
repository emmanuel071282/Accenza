import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Package, ChevronRight } from "lucide-react";
import type { Order } from "@shared/schema";

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

export default function MyOrdersPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate("/login");
  }, [authLoading, isLoggedIn, navigate]);

  const { data: myOrders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isLoggedIn,
  });

  if (authLoading) {
    return <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tighter text-center mb-2 uppercase" data-testid="text-my-orders-title">My Orders</h1>
        <p className="text-center text-muted-foreground text-sm mb-10">Track and manage your orders</p>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (!myOrders || myOrders.length === 0) ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No orders yet</p>
            <Link href="/category/Ladies" className="inline-block mt-4 border border-foreground px-8 py-3.5 text-xs uppercase tracking-widest font-semibold hover:bg-foreground hover:text-background transition-colors">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {myOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block border border-border p-5 hover:bg-secondary/30 transition-colors"
                data-testid={`card-order-${order.id}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${statusColors[order.status] || "bg-gray-100"}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">₹{Number(order.totalAmount).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                    {order.courierName && order.awbNumber && (
                      <p className="text-[10px] text-muted-foreground mt-1">{order.courierName} · AWB: {order.awbNumber}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
