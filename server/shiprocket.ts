/**
 * Shiprocket REST API integration
 *
 * Shiprocket is India's #1 shipping aggregator — connects 25+ courier partners
 * (Delhivery, BlueDart, DTDC, Ecom Express, etc.) and auto-selects the cheapest
 * or fastest courier based on origin/destination pincode.
 *
 * API base: https://apiv2.shiprocket.in/v1/external
 * Auth: Bearer token (email + password → token, valid 10 days)
 *
 * Flow:
 *   1. Authenticate → get token
 *   2. Create order → Shiprocket assigns order_id + shipment_id
 *   3. Generate AWB → courier allocated, AWB number assigned
 *   4. Request pickup → courier picks up from store
 *   5. Track → real-time tracking via shipment_id or AWB
 *
 * Required env vars:
 *   SHIPROCKET_EMAIL    — Shiprocket account email
 *   SHIPROCKET_PASSWORD — Shiprocket account password
 *
 * The app works in demo mode without these (orders created, shipping skipped).
 */

const SHIPROCKET_API = "https://apiv2.shiprocket.in/v1/external";

// ---------------------------------------------------------------------------
// Auth — token cached in memory, refreshed when expired
// ---------------------------------------------------------------------------
let _token: string | null = null;
let _tokenExpiresAt = 0;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

async function getToken(): Promise<string | null> {
  if (!isShiprocketConfigured()) return null;

  const now = Date.now();
  if (_token && now < _tokenExpiresAt) return _token;

  try {
    const res = await fetch(`${SHIPROCKET_API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Shiprocket] Auth failed:", err);
      return null;
    }

    const data = await res.json();
    _token = data.token;
    // Token valid for 10 days — refresh after 9 days to be safe
    _tokenExpiresAt = now + 9 * 24 * 3600 * 1000;
    return _token;
  } catch (err) {
    console.error("[Shiprocket] Auth error:", err);
    return null;
  }
}

async function shiprocketFetch(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: any
): Promise<any> {
  const token = await getToken();
  if (!token) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${SHIPROCKET_API}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Shiprocket] ${method} ${endpoint} failed (${res.status}):`, errText);
    throw new Error(`Shiprocket API error: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Pincode serviceability — check which couriers can deliver
// ---------------------------------------------------------------------------
export interface CourierEstimate {
  courierId: number;
  courierName: string;
  rate: number;
  estimatedDays: number;
  cod: boolean;
}

export async function checkServiceability(
  pickupPincode: string,
  deliveryPincode: string,
  weight: number = 0.5, // default 500g
  cod: boolean = false
): Promise<CourierEstimate[]> {
  try {
    const data = await shiprocketFetch(
      `/courier/serviceability?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${cod ? 1 : 0}`
    );

    if (!data?.data?.available_courier_companies) return [];

    return data.data.available_courier_companies.map((c: any) => ({
      courierId: c.courier_company_id,
      courierName: c.courier_name,
      rate: c.rate,
      estimatedDays: c.estimated_delivery_days,
      cod: c.cod === 1,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Create Shiprocket order
// ---------------------------------------------------------------------------
export interface ShiprocketOrderInput {
  orderNumber: string;
  orderDate: string; // ISO date
  pickupLocation: string; // store name (must match Shiprocket pickup location)
  billingName: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  billingPhone: string;
  billingEmail: string;
  shippingIsBilling: boolean;
  items: {
    name: string;
    sku: string;
    units: number;
    sellingPrice: number;
    hsn: string;
  }[];
  subTotal: number;
  paymentMethod: "Prepaid" | "COD";
  weight: number; // kg
  length: number; // cm
  breadth: number; // cm
  height: number; // cm
}

export interface ShiprocketOrderResult {
  orderId: number;
  shipmentId: number;
  status: string;
  awbNumber?: string;
  courierName?: string;
}

export async function createShiprocketOrder(
  input: ShiprocketOrderInput
): Promise<ShiprocketOrderResult | null> {
  if (!isShiprocketConfigured()) {
    // Demo mode — return fake Shiprocket IDs
    console.log(`[Shiprocket DEMO] Order ${input.orderNumber} → simulated`);
    return {
      orderId: Math.floor(100000 + Math.random() * 900000),
      shipmentId: Math.floor(100000 + Math.random() * 900000),
      status: "NEW",
    };
  }

  try {
    const payload = {
      order_id: input.orderNumber,
      order_date: input.orderDate,
      pickup_location: input.pickupLocation,
      channel_id: "",
      comment: "ACCENZA order",
      billing_customer_name: input.billingName.split(" ")[0],
      billing_last_name: input.billingName.split(" ").slice(1).join(" ") || "",
      billing_address: input.billingAddress,
      billing_city: input.billingCity,
      billing_pincode: input.billingPincode,
      billing_state: input.billingState,
      billing_country: "India",
      billing_email: input.billingEmail,
      billing_phone: input.billingPhone,
      shipping_is_billing: input.shippingIsBilling,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.sellingPrice,
        discount: 0,
        tax: "",
        hsn: item.hsn,
      })),
      payment_method: input.paymentMethod,
      sub_total: input.subTotal,
      length: input.length,
      breadth: input.breadth,
      height: input.height,
      weight: input.weight,
    };

    const data = await shiprocketFetch("/orders/create/adhoc", "POST", payload);

    return {
      orderId: data.order_id,
      shipmentId: data.shipment_id,
      status: data.status || "NEW",
      awbNumber: data.awb_number || undefined,
      courierName: data.courier_name || undefined,
    };
  } catch (err) {
    console.error("[Shiprocket] Create order failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generate AWB (auto-assigns cheapest courier)
// ---------------------------------------------------------------------------
export async function generateAWB(
  shipmentId: number,
  courierId?: number
): Promise<{ awbNumber: string; courierName: string; freightCharge: number } | null> {
  if (!isShiprocketConfigured()) {
    return {
      awbNumber: `DEMO${Date.now()}`,
      courierName: "Demo Courier",
      freightCharge: 65,
    };
  }

  try {
    const payload: any = { shipment_id: [shipmentId] };
    if (courierId) payload.courier_id = courierId;

    const data = await shiprocketFetch("/courier/assign/awb", "POST", payload);

    const awbData = data?.response?.data;
    if (!awbData) return null;

    return {
      awbNumber: awbData.awb_code || awbData.awb_number || "",
      courierName: awbData.courier_name || "",
      freightCharge: Number(awbData.freight_charge ?? awbData.rate ?? 0),
    };
  } catch (err) {
    console.error("[Shiprocket] Generate AWB failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request pickup from store
// ---------------------------------------------------------------------------
export async function requestPickup(
  shipmentId: number
): Promise<boolean> {
  if (!isShiprocketConfigured()) return true;

  try {
    await shiprocketFetch("/courier/generate/pickup", "POST", {
      shipment_id: [shipmentId],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Track shipment
// ---------------------------------------------------------------------------
export interface ShipmentTracking {
  currentStatus: string;
  shipmentStatus: string;
  activities: { date: string; status: string; location: string; comment: string }[];
  trackingUrl: string;
  estimatedDelivery?: string;
  awbNumber: string;
  courierName: string;
}

export async function trackShipment(
  shipmentId: string
): Promise<ShipmentTracking | null> {
  if (!isShiprocketConfigured()) {
    return {
      currentStatus: "In Transit (Demo)",
      shipmentStatus: "6",
      activities: [
        { date: new Date().toISOString(), status: "Order Placed", location: "Warehouse", comment: "Demo tracking" },
      ],
      trackingUrl: "",
      awbNumber: "DEMO",
      courierName: "Demo Courier",
    };
  }

  try {
    const data = await shiprocketFetch(`/courier/track/shipment/${shipmentId}`);
    const tracking = data?.tracking_data;
    if (!tracking) return null;

    // Shiprocket returns scans/activities in different formats depending on endpoint
    const scans = tracking.shipment_track_activities || tracking.scans || [];

    return {
      currentStatus: tracking.track_status_string || tracking.shipment_status || tracking.current_status || "",
      shipmentStatus: String(tracking.shipment_status_id || tracking.shipment_status || ""),
      activities: scans.map((a: any) => ({
        date: a.date,
        status: a["sr-status-label"] || a.activity || a["sr-status"] || "",
        location: a.location || "",
        comment: a.activity || a["sr-status-label"] || "",
      })),
      trackingUrl: tracking.track_url || "",
      estimatedDelivery: tracking.etd || undefined,
      awbNumber: tracking.awb_code || tracking.awb || "",
      courierName: tracking.courier_name || "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cancel Shiprocket order
// ---------------------------------------------------------------------------
export async function cancelShiprocketOrder(
  shiprocketOrderId: number
): Promise<boolean> {
  if (!isShiprocketConfigured()) return true;

  try {
    await shiprocketFetch("/orders/cancel", "POST", {
      ids: [shiprocketOrderId],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Map Shiprocket status to our order statuses
// Accepts both numeric IDs (from webhook shipment_status_id / current_status_id)
// and text strings (from webhook current_status like "IN TRANSIT")
// ---------------------------------------------------------------------------
export function mapShiprocketStatus(shiprocketStatus: string | number): string {
  const key = String(shiprocketStatus).trim();

  // Numeric status ID mapping (shipment_status_id / current_status_id)
  const idMap: Record<string, string> = {
    "1": "confirmed",           // AWB assigned
    "2": "ready_to_ship",       // Pickup scheduled
    "3": "shipped",             // Picked up
    "4": "shipped",             // Shipped
    "5": "in_transit",          // Manifest generated
    "6": "in_transit",          // Shipped / in transit
    "7": "delivered",           // Delivered
    "8": "cancelled",           // Cancelled
    "9": "rto",                 // RTO initiated
    "10": "rto",                // RTO delivered
    "12": "cancelled",          // Lost
    "13": "cancelled",          // Disposed off
    "14": "out_for_delivery",   // Out for delivery
    "15": "in_transit",         // In transit
    "16": "in_transit",         // Reached destination hub
    "17": "out_for_delivery",   // Out for delivery
    "18": "in_transit",         // In transit
    "19": "in_transit",         // Misrouted
    "20": "in_transit",         // In transit (can also be RTO acknowledged)
    "21": "rto",                // Undelivered
    "22": "in_transit",         // Delayed
    "38": "in_transit",         // Reached at destination hub
    "39": "in_transit",         // In transit (further)
    "40": "shipped",            // Pickup exception
    "41": "rto",                // Undelivered
    "42": "shipped",            // Picked up
    "43": "in_transit",         // Self fulfilled
    "44": "cancelled",          // Disposed off
    "45": "cancelled",          // Destroyed
    "46": "rto",                // RTO in transit
    "47": "rto",                // RTO OFD
    "48": "rto",                // RTO NDR
  };

  if (idMap[key]) return idMap[key];

  // Text status mapping (current_status string from webhook)
  const textMap: Record<string, string> = {
    "NEW": "confirmed",
    "AWB ASSIGNED": "confirmed",
    "PICKUP SCHEDULED": "ready_to_ship",
    "PICKUP GENERATED": "ready_to_ship",
    "PICKUP QUEUED": "ready_to_ship",
    "MANIFEST GENERATED": "ready_to_ship",
    "PICKED UP": "shipped",
    "SHIPPED": "shipped",
    "IN TRANSIT": "in_transit",
    "REACHED AT DESTINATION HUB": "in_transit",
    "MISROUTED": "in_transit",
    "OUT FOR DELIVERY": "out_for_delivery",
    "DELIVERED": "delivered",
    "CANCELLED": "cancelled",
    "RTO INITIATED": "rto",
    "RTO IN TRANSIT": "rto",
    "RTO DELIVERED": "rto",
    "RTO ACKNOWLEDGED": "rto",
    "UNDELIVERED": "rto",
    "LOST": "cancelled",
    "DISPOSED OFF": "cancelled",
    "DESTROYED": "cancelled",
  };

  const upperKey = key.toUpperCase();
  if (textMap[upperKey]) return textMap[upperKey];

  // Partial match for variations
  if (upperKey.includes("TRANSIT")) return "in_transit";
  if (upperKey.includes("DELIVER")) return "out_for_delivery";
  if (upperKey.includes("PICKED") || upperKey.includes("SHIPPED")) return "shipped";
  if (upperKey.includes("RTO")) return "rto";
  if (upperKey.includes("CANCEL")) return "cancelled";

  return "processing";
}

// ---------------------------------------------------------------------------
// Estimate package dimensions from item count
// ---------------------------------------------------------------------------
export function estimatePackageDimensions(totalItems: number): {
  weight: number;
  length: number;
  breadth: number;
  height: number;
} {
  // Typical fashion item: ~300g, 30x25 cm folded
  // Stack height increases with item count
  const weight = Math.max(0.3, totalItems * 0.3);     // 300g per item, min 300g
  const length = 32;                                    // cm
  const breadth = 26;                                   // cm
  const height = Math.min(30, 5 + totalItems * 3);     // 3cm per item, max 30cm
  return { weight: Math.round(weight * 10) / 10, length, breadth, height };
}
