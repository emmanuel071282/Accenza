import crypto from "crypto";

const RAZORPAY_KEY_ID = process.env.ACCENZA_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.ACCENZA_RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_API = "https://api.razorpay.com/v1";

function authHeader() {
  return "Basic " + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createRazorpayOrder(
  amountInRupees: number,
  receipt: string
): Promise<RazorpayOrder> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return {
      id: `demo_order_${Date.now()}`,
      amount: Math.round(amountInRupees * 100),
      currency: "INR",
      receipt,
      status: "created",
    };
  }

  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(amountInRupees * 100),
      currency: "INR",
      receipt,
      payment_capture: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.description || "Failed to create Razorpay order");
  }

  return res.json() as Promise<RazorpayOrder>;
}

// Creates a Razorpay Customer so returning users can save cards (RBI tokenization)
// and reuse them on future checkouts via the customer_id passed to Checkout.js.
export async function createRazorpayCustomer(
  name: string,
  email: string,
  contact: string
): Promise<string | null> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;

  try {
    const res = await fetch(`${RAZORPAY_API}/customers`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      // fail_existing: "0" returns the existing customer instead of erroring
      // if one already exists with this email/contact.
      body: JSON.stringify({ name, email, contact, fail_existing: "0" }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Razorpay] customer creation failed:", data);
      return null;
    }
    return (data as any).id || null;
  } catch (err) {
    console.error("[Razorpay] customer creation error:", err);
    return null;
  }
}

export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string
): boolean {
  if (!RAZORPAY_KEY_SECRET) return true;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string {
  return RAZORPAY_KEY_ID;
}
