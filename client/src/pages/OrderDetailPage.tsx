import { useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2, ArrowLeft, Check, Truck, Package, Clock, XCircle, RotateCcw,
  MapPin, ExternalLink, Navigation, PackageCheck, CircleDot, Warehouse
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Order, OrderItem } from "@shared/schema";

type OrderDetail = Order & {
  items: (OrderItem & { productName?: string; productImage?: string })[];
};

interface TrackingData {
  status: string;
  currentStatus?: string;
  awbNumber?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: string | null;
  activities?: { date: string; status: string; location: string; comment: string }[];
  message?: string;
}

interface FulfillmentData {
  fulfilledFromStore: { name: string; city: string; state: string } | null;
  shiprocketOrderId?: string | null;
  awbNumber?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
}

// Display-friendly statuses (only show the major milestones in progress bar)
const PROGRESS_STEPS = ["confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered"] as const;

const statusIcons: Record<string, any> = {
  placed: Clock,
  confirmed: Check,
  processing: PackageCheck,
  ready_to_ship: PackageCheck,
  shipped: Truck,
  in_transit: Navigation,
  out_for_delivery: CircleDot,
  delivered: Package,
  cancelled: XCircle,
  returned: RotateCcw,
  rto: RotateCcw,
};

const statusLabels: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  processing: "Processing",
  ready_to_ship: "Ready",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  rto: "Return to Origin",
};

export default function OrderDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/orders/:id");
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate("/login");
  }, [authLoading, isLoggedIn, navigate]);

  const orderId = match ? Number(params!.id) : 0;

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: orderId > 0 && isLoggedIn,
  });

  // Fetch tracking data
  const { data: tracking } = useQuery<TrackingData>({
    queryKey: ["/api/orders", orderId, "tracking"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/tracking`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: orderId > 0 && isLoggedIn && !!order,
    refetchInterval: 60000, // Refresh tracking every 60 seconds
  });

  // Fetch fulfillment info
  const { data: fulfillment } = useQuery<FulfillmentData>({
    queryKey: ["/api/orders", orderId, "fulfillment"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/fulfillment`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: orderId > 0 && isLoggedIn && !!order,
  });

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 px-4 text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Link href="/orders" className="text-sm underline mt-4 inline-block">Back to orders</Link>
      </div>
    );
  }

  const currentStatus = tracking?.status || order.status;
  const isCancelledOrReturned = ["cancelled", "returned", "rto"].includes(currentStatus);
  const activeStepIndex = PROGRESS_STEPS.indexOf(currentStatus as any);

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </Link>

        {/* Order header */}
        <div className="border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold" data-testid="text-order-number">{order.orderNumber}</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-semibold px-3 py-1 rounded",
              currentStatus === "delivered" ? "bg-green-100 text-green-800" :
              isCancelledOrReturned ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
            )}>
              {statusLabels[currentStatus] || currentStatus}
            </span>
          </div>

          {/* Progress bar */}
          {!isCancelledOrReturned && (
            <>
              <div className="flex items-center gap-1 mt-6 mb-2">
                {PROGRESS_STEPS.map((step, i) => {
                  const isCompleted = i <= activeStepIndex;
                  const isCurrent = i === activeStepIndex;
                  const Icon = statusIcons[step] || Clock;
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0 transition-colors",
                        isCompleted ? "bg-foreground border-foreground text-background" :
                        isCurrent ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                      )}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {i < PROGRESS_STEPS.length - 1 && (
                        <div className={cn("flex-1 h-0.5 mx-1", isCompleted && i < activeStepIndex ? "bg-foreground" : "bg-border")} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1">
                {PROGRESS_STEPS.map((step) => (
                  <div key={step} className="flex-1 text-center">
                    <span className="text-[7px] uppercase tracking-widest text-muted-foreground">
                      {statusLabels[step]}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Estimated delivery */}
          {tracking?.estimatedDelivery && !isCancelledOrReturned && currentStatus !== "delivered" && (
            <p className="text-xs text-muted-foreground mt-4">
              Estimated delivery: <span className="font-medium text-foreground">{tracking.estimatedDelivery}</span>
            </p>
          )}
        </div>

        {/* Shipping & courier info */}
        {(tracking?.awbNumber || fulfillment?.courierName || fulfillment?.fulfilledFromStore) && (
          <div className="border border-border p-5 mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-3">Shipping Details</h2>

            {fulfillment?.fulfilledFromStore && (
              <div className="flex items-start gap-2 mb-3">
                <Warehouse className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm">Shipping from <span className="font-medium">{fulfillment.fulfilledFromStore.name}</span></p>
                  <p className="text-xs text-muted-foreground">{fulfillment.fulfilledFromStore.city}, {fulfillment.fulfilledFromStore.state}</p>
                </div>
              </div>
            )}

            {(tracking?.courierName || fulfillment?.courierName) && (
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  Courier: <span className="font-medium">{tracking?.courierName || fulfillment?.courierName}</span>
                </p>
              </div>
            )}

            {(tracking?.awbNumber || fulfillment?.awbNumber) && (
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  AWB: <span className="font-mono font-medium">{tracking?.awbNumber || fulfillment?.awbNumber}</span>
                </p>
              </div>
            )}

            {(tracking?.trackingUrl || fulfillment?.trackingUrl) && (
              <a
                href={tracking?.trackingUrl || fulfillment?.trackingUrl || ""}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Track on courier website
              </a>
            )}
          </div>
        )}

        {/* Tracking activities timeline */}
        {tracking?.activities && tracking.activities.length > 0 && (
          <div className="border border-border p-5 mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-4">Tracking Updates</h2>
            <div className="space-y-0">
              {tracking.activities.slice(0, 10).map((activity, i) => (
                <div key={i} className="flex gap-3 relative">
                  {/* Vertical line */}
                  {i < tracking.activities!.length - 1 && i < 9 && (
                    <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
                  )}
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 z-10",
                    i === 0 ? "bg-foreground border-foreground" : "bg-background border-border"
                  )} />
                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-medium">{activity.status}</p>
                    {activity.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {activity.location}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(activity.date).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="border border-border mb-6">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold uppercase tracking-widest">Items</h2>
          </div>
          <div className="divide-y divide-border/50">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4" data-testid={`order-item-${item.id}`}>
                {item.productImage && (
                  <img src={item.productImage} alt="" className="w-16 h-16 object-cover" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.productName || `Product #${item.productId}`}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.size && item.size !== "Free Size" && `Size: ${item.size} · `}Qty: {item.quantity}
                  </p>
                </div>
                <p className="font-semibold text-sm">₹{Number(item.price).toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border">
            {Number(order.discountAmount) > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-green-700">Discount{order.promoCode ? ` (${order.promoCode})` : ""}</span>
                <span className="text-sm text-green-700">−₹{Number(order.discountAmount).toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold uppercase tracking-widest">Total</span>
              <span className="text-lg font-bold">₹{Number(order.totalAmount).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Delivery address */}
        <div className="border border-border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3">Delivery Address</h2>
          <p className="text-sm">{order.shippingName}</p>
          <p className="text-sm text-muted-foreground">{order.shippingAddress}</p>
          <p className="text-sm text-muted-foreground">{order.shippingCity}, {order.shippingState} - {order.shippingPincode}</p>
          <p className="text-sm text-muted-foreground mt-1">Phone: {order.shippingPhone}</p>
        </div>
      </div>
    </div>
  );
}
