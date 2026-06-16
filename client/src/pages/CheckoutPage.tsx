import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tag, Check } from "lucide-react";
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { SiVisa, SiMastercard, SiGooglepay, SiPaytm } from "react-icons/si";
import { FaAmazonPay } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";

// Extend window for Razorpay
declare global {
  interface Window {
    Razorpay: any;
  }
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export default function CheckoutPage() {
  const { items, cartTotal, clearCart } = useCart();
  const { isLoggedIn, user } = useAuth();
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"shipping" | "payment">("shipping");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [pincodeStatus, setPincodeStatus] = useState<{ serviceable: boolean; message: string; estimatedDays?: string } | null>(null);
  const [pincodeChecking, setPincodeChecking] = useState(false);

  const [shipping, setShipping] = useState({
    name: user?.name || "",
    phone: user?.mobile || "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  // Auto-check pincode serviceability when 6 digits entered
  const checkPincode = useCallback(async (pin: string) => {
    if (!/^\d{6}$/.test(pin)) { setPincodeStatus(null); return; }
    setPincodeChecking(true);
    try {
      const res = await fetch(`/api/pincode/check?pincode=${pin}`, { credentials: "include" });
      const data = await res.json();
      setPincodeStatus(data);
    } catch {
      setPincodeStatus(null);
    } finally {
      setPincodeChecking(false);
    }
  }, []);

  const readPromoFromUrl = () => {
    if (typeof window === "undefined") return "";
    const fromQuery = new URLSearchParams(window.location.search).get("promo");
    if (fromQuery) return fromQuery.toUpperCase();
    const fromStorage = sessionStorage.getItem("accenza-promo-code");
    return fromStorage ? fromStorage.toUpperCase() : "";
  };
  const [promoInput, setPromoInput] = useState(readPromoFromUrl);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [autoTriedPromo, setAutoTriedPromo] = useState(false);

  const validatePromo = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/campaigns/validate?code=${encodeURIComponent(code)}&subtotal=${cartTotal}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.valid) throw new Error(data.message || "Invalid code");
      return data;
    },
    onSuccess: (data) => {
      setAppliedPromo({ code: data.promoCode, discount: data.discountAmount });
      setPromoError(null);
      toast({ title: "Promo applied", description: `Saved ₹${data.discountAmount.toLocaleString("en-IN")} with ${data.promoCode}` });
    },
    onError: (e: Error) => {
      setAppliedPromo(null);
      setPromoError(e.message || "Promo code not valid");
    },
  });

  const discountAmount = appliedPromo?.discount || 0;
  const finalTotal = Math.max(0, cartTotal - discountAmount);

  useEffect(() => {
    if (autoTriedPromo) return;
    if (!promoInput) return;
    if (appliedPromo) return;
    if (cartTotal <= 0) return;
    if (validatePromo.isPending) return;
    setAutoTriedPromo(true);
    validatePromo.mutate(promoInput.trim().toUpperCase());
  }, [autoTriedPromo, promoInput, appliedPromo, cartTotal, validatePromo]);

  // Load Razorpay checkout.js dynamically
  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  // After Razorpay succeeds: verify signature server-side + create DB order
  const verifyAndConfirm = useCallback(async (
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    totalAmount: number,
    discountAmt: number,
    appliedPromoCode: string | null,
  ) => {
    try {
      const res = await apiRequest("POST", "/api/payment/verify", {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        totalAmount,
        discountAmount: discountAmt,
        appliedPromo: appliedPromoCode,
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          size: item.selectedSize || undefined,
        })),
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPincode: shipping.pincode,
        shippingPhone: shipping.phone,
        paymentMethod: "razorpay",
      });
      const data = await res.json();
      setPlacedOrderNumber(data.orderNumber);
      clearCart();
      setOrderPlaced(true);
    } catch (err: any) {
      toast({ title: "Payment verification failed", description: err.message || "Please contact support.", variant: "destructive" });
    } finally {
      setIsProcessingPayment(false);
    }
  }, [items, shipping, clearCart, toast]);

  const handlePlaceOrder = useCallback(async () => {
    setIsProcessingPayment(true);
    try {
      // Step 1: Create Razorpay order server-side
      const createRes = await apiRequest("POST", "/api/payment/create-order", {
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
          size: item.selectedSize || undefined,
        })),
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPincode: shipping.pincode,
        shippingPhone: shipping.phone,
        paymentMethod: "razorpay",
        promoCode: appliedPromo?.code,
      });
      const orderInfo = await createRes.json();
      const { razorpayOrderId, amount, currency, keyId, totalAmount, discountAmount: discountAmt, appliedPromo: appliedPromoCode } = orderInfo;

      // Demo mode: no Razorpay keys configured — skip popup, go straight to verify
      if (!keyId) {
        await verifyAndConfirm(
          razorpayOrderId,
          `demo_pay_${Date.now()}`,
          "demo_signature",
          totalAmount,
          discountAmt,
          appliedPromoCode,
        );
        return;
      }

      // Step 2: Load Razorpay checkout.js and open the popup
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error("Failed to load payment gateway. Please check your connection and try again.");
      }

      const options = {
        key: keyId,
        amount,
        currency,
        order_id: razorpayOrderId,
        name: "ACCENZA Fashion",
        description: `Order — ${items.length} item${items.length !== 1 ? "s" : ""}`,
        image: "/favicon.ico",
        prefill: {
          name: user?.name || shipping.name,
          email: user?.email || "",
          contact: shipping.phone,
        },
        theme: { color: "#111111" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          await verifyAndConfirm(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
            totalAmount,
            discountAmt,
            appliedPromoCode,
          );
        },
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false);
            toast({ title: "Payment cancelled", description: "You can try again when ready." });
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        setIsProcessingPayment(false);
        toast({
          title: "Payment failed",
          description: response?.error?.description || "Please try a different payment method.",
          variant: "destructive",
        });
      });
      rzp.open();
    } catch (err: any) {
      setIsProcessingPayment(false);
      toast({ title: "Could not initiate payment", description: err.message || "Please try again.", variant: "destructive" });
    }
  }, [items, shipping, appliedPromo, user, loadRazorpayScript, verifyAndConfirm, toast]);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background pt-28 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0 && !orderPlaced) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-2xl text-center py-20">
          <p className="text-xl font-medium mb-4">Your bag is empty</p>
          <p className="text-muted-foreground mb-8">Add some items before checking out.</p>
          <Link href="/" data-testid="link-continue-shopping" className="inline-block border border-foreground px-8 py-3.5 text-xs uppercase tracking-widest font-semibold">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-lg text-center py-20">
          <CheckCircle2 className="w-20 h-20 mx-auto text-green-800 mb-6" />
          <h1 className="text-3xl font-display font-bold tracking-tighter mb-4">Order Confirmed!</h1>
          <p className="text-muted-foreground mb-2">
            Thank you for shopping with ACCENZA. Your order has been placed successfully.
          </p>
          {placedOrderNumber && (
            <p className="text-sm font-mono text-muted-foreground mb-2" data-testid="text-order-number">
              Order: {placedOrderNumber}
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-8">
            You will receive an order confirmation on your registered email/phone shortly.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/orders" data-testid="link-view-orders" className="inline-block border border-foreground px-8 py-3.5 text-xs uppercase tracking-widest font-semibold hover:bg-foreground hover:text-background transition-colors">
              View My Orders
            </Link>
            <Link href="/" data-testid="link-back-home" className="inline-block bg-foreground text-background px-8 py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20">
        <div className="container mx-auto px-4 md:px-6 max-w-lg text-center py-20">
          <h1 className="text-2xl font-display font-bold tracking-tighter mb-4">Sign in to continue</h1>
          <p className="text-muted-foreground mb-8">You need to be signed in to place an order.</p>
          <Link href="/login" className="inline-block bg-foreground text-background px-8 py-3.5 text-xs uppercase tracking-widest font-semibold">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const validateShipping = () => {
    if (!shipping.name || !shipping.phone || !shipping.address || !shipping.city || !shipping.state || !shipping.pincode) {
      toast({ title: "Please fill in all shipping details", variant: "destructive" });
      return false;
    }
    if (!/^[6-9]\d{9}$/.test(shipping.phone)) {
      toast({ title: "Please enter a valid 10-digit mobile number", variant: "destructive" });
      return false;
    }
    if (!/^\d{6}$/.test(shipping.pincode)) {
      toast({ title: "Please enter a valid 6-digit pincode", variant: "destructive" });
      return false;
    }
    if (pincodeStatus && !pincodeStatus.serviceable) {
      toast({ title: "We don't deliver to this pincode yet", description: "Please try a different delivery address.", variant: "destructive" });
      return false;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to shopping
        </Link>

        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tighter mb-6 uppercase">Checkout</h1>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setStep("shipping")}
            className={cn(
              "flex items-center gap-2 text-xs uppercase tracking-widest font-semibold pb-2 border-b-2 transition-colors",
              step === "shipping" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
            )}
            data-testid="tab-shipping"
          >
            <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-[10px]">1</span>
            Shipping
          </button>
          <button
            onClick={() => { if (validateShipping()) setStep("payment"); }}
            className={cn(
              "flex items-center gap-2 text-xs uppercase tracking-widest font-semibold pb-2 border-b-2 transition-colors",
              step === "payment" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
            )}
            data-testid="tab-payment"
          >
            <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-[10px]">2</span>
            Payment
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">

          <div className="flex-1">
            {step === "shipping" && (
              <div className="space-y-5" data-testid="section-shipping-form">
                <h2 className="text-sm uppercase tracking-widest font-semibold mb-6">Delivery Address</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="shippingName" className="text-xs uppercase tracking-widest text-muted-foreground">Full Name</Label>
                    <Input data-testid="input-shipping-name" id="shippingName" value={shipping.name} onChange={(e) => setShipping({ ...shipping, name: e.target.value })} className="mt-2 rounded-none h-12" />
                  </div>
                  <div>
                    <Label htmlFor="shippingPhone" className="text-xs uppercase tracking-widest text-muted-foreground">Mobile Number</Label>
                    <Input data-testid="input-shipping-phone" id="shippingPhone" value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="mt-2 rounded-none h-12" placeholder="10-digit mobile" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="shippingAddress" className="text-xs uppercase tracking-widest text-muted-foreground">Address</Label>
                  <Input data-testid="input-shipping-address" id="shippingAddress" value={shipping.address} onChange={(e) => setShipping({ ...shipping, address: e.target.value })} className="mt-2 rounded-none h-12" placeholder="House/Flat No., Street, Locality" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="shippingCity" className="text-xs uppercase tracking-widest text-muted-foreground">City</Label>
                    <Input data-testid="input-shipping-city" id="shippingCity" value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} className="mt-2 rounded-none h-12" />
                  </div>
                  <div>
                    <Label htmlFor="shippingState" className="text-xs uppercase tracking-widest text-muted-foreground">State</Label>
                    <select data-testid="select-shipping-state" id="shippingState" value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} className="mt-2 w-full border border-input bg-background px-3 h-12 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Select State</option>
                      {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="shippingPincode" className="text-xs uppercase tracking-widest text-muted-foreground">Pincode</Label>
                    <Input
                      data-testid="input-shipping-pincode"
                      id="shippingPincode"
                      value={shipping.pincode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setShipping({ ...shipping, pincode: val });
                        checkPincode(val);
                      }}
                      className="mt-2 rounded-none h-12"
                      placeholder="6-digit pincode"
                    />
                    {pincodeChecking && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking delivery...
                      </p>
                    )}
                    {pincodeStatus && !pincodeChecking && (
                      <p className={cn("text-xs mt-1 flex items-center gap-1", pincodeStatus.serviceable ? "text-green-700" : "text-red-700")} data-testid="text-pincode-status">
                        {pincodeStatus.serviceable ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {pincodeStatus.message}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => { if (validateShipping()) setStep("payment"); }}
                  data-testid="button-continue-to-payment"
                  className="w-full bg-foreground text-background py-4 text-sm uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity mt-4"
                >
                  Continue to Payment
                </button>
              </div>
            )}

            {step === "payment" && (
              <div data-testid="section-payment">
                <h2 className="text-sm uppercase tracking-widest font-semibold mb-6">Secure Payment</h2>

                <div className="border border-border p-6 mb-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Accepted Payment Methods</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <SiVisa className="w-12 h-8 text-blue-700" />
                    <SiMastercard className="w-10 h-8 text-orange-600" />
                    <span className="text-sm font-bold bg-blue-600 text-white px-2 py-1 rounded">RuPay</span>
                    <SiGooglepay className="w-12 h-8" />
                    <SiPaytm className="w-12 h-8 text-blue-600" />
                    <FaAmazonPay className="w-12 h-8 text-orange-500" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                    Cards (Visa, Mastercard, RuPay) · UPI (GPay, PhonePe, Paytm, BHIM) · Net Banking · Wallets
                  </p>
                </div>

                <div className="flex items-start gap-3 p-4 bg-secondary/40 border border-border">
                  <ShieldCheck className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-1">256-bit SSL Encrypted</p>
                    <p className="text-xs text-muted-foreground">Your payment information is processed securely by Razorpay. ACCENZA never stores your card details.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-96 shrink-0">
            <div className="border border-border p-6 sticky top-32">
              <h2 className="text-sm uppercase tracking-widest font-semibold mb-6">Order Summary</h2>
              
              <ul className="space-y-4 mb-6">
                {items.map((item) => (
                  <li key={item.product.id} className="flex gap-3">
                    <div className="w-14 h-18 bg-secondary shrink-0 overflow-hidden">
                      <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.selectedSize && item.selectedSize !== "Free Size" && `Size: ${item.selectedSize} · `}Qty: {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">
                      ₹{(Number(item.product.price) * item.quantity).toLocaleString('en-IN')}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="border-t border-border pt-4 mb-4" data-testid="section-promo">
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Promo Code</label>
                {appliedPromo ? (
                  <div className="flex items-center justify-between gap-2 border border-foreground/40 px-3 py-2 bg-secondary/40">
                    <span className="text-xs font-semibold flex items-center gap-2" data-testid="text-applied-promo">
                      <Check className="w-3.5 h-3.5 text-green-800" />
                      {appliedPromo.code} applied
                    </span>
                    <button
                      type="button"
                      data-testid="button-remove-promo"
                      onClick={() => { setAppliedPromo(null); setPromoInput(""); setPromoError(null); }}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        data-testid="input-promo-code"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        placeholder="Enter code"
                        className="rounded-none h-10 text-sm"
                      />
                      <button
                        type="button"
                        data-testid="button-apply-promo"
                        disabled={!promoInput.trim() || validatePromo.isPending}
                        onClick={() => validatePromo.mutate(promoInput.trim().toUpperCase())}
                        className="bg-foreground text-background px-4 text-[11px] uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-1"
                      >
                        {validatePromo.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
                        Apply
                      </button>
                    </div>
                    {promoError && (
                      <p className="text-[11px] text-red-600 mt-1" data-testid="text-promo-error">{promoError}</p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2 text-sm border-t border-border pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{cartTotal.toLocaleString('en-IN')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount ({appliedPromo?.code})</span>
                    <span data-testid="text-discount-amount">- ₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-green-800 font-medium">Free</span>
                </div>
                <div className="flex justify-between font-semibold text-lg pt-3 border-t border-border">
                  <span>Total</span>
                  <span data-testid="text-final-total">₹{finalTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {step === "payment" && (
                <Button
                  data-testid="button-place-order"
                  className="w-full rounded-none py-6 text-sm uppercase tracking-widest font-semibold mt-6"
                  onClick={handlePlaceOrder}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  Pay ₹{finalTotal.toLocaleString('en-IN')}
                </Button>
              )}

              <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-muted-foreground">
                <ShieldCheck className="w-4 h-4" />
                <span>100% Secure Payment</span>
              </div>

              <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-border/50">
                <SiVisa className="w-8 h-5 text-blue-700 opacity-60" />
                <SiMastercard className="w-6 h-5 text-orange-600 opacity-60" />
                <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded opacity-60">RuPay</span>
                <SiGooglepay className="w-8 h-5 opacity-60" />
                <SiPaytm className="w-8 h-5 text-blue-600 opacity-60" />
                <FaAmazonPay className="w-8 h-5 text-orange-500 opacity-60" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
