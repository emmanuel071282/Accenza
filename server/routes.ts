import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerSchema, loginSchema, ORDER_STATUSES, getSizesForProduct, otpVerifications, insertCampaignSchema, insertProductSchema, generateEAN13Barcode, type InsertCampaign } from "@shared/schema";
import bcrypt from "bcryptjs";
import { sendSms, sendWhatsApp } from "./sms";
import { processStylistMessage, getDemoResponse, isAIStylistConfigured } from "./ai-stylist";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { createRazorpayOrder, verifyPaymentSignature, getRazorpayKeyId, isRazorpayConfigured } from "./payment";
import { buildInvoiceData, generateInvoiceHTML, generateInvoiceNumber, calculateGST, sendInvoiceWhatsApp, sendInvoiceEmail } from "./invoice";
import {
  isShiprocketConfigured,
  createShiprocketOrder,
  generateAWB,
  requestPickup,
  trackShipment,
  cancelShiprocketOrder,
  mapShiprocketStatus,
  estimatePackageDimensions,
  checkServiceability,
} from "./shiprocket";

// ---------------------------------------------------------------------------
// Lightweight in-memory rate limiter
// ---------------------------------------------------------------------------
interface RateLimitEntry { count: number; resetAt: number }
const rateLimitStore = new Map<string, RateLimitEntry>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }
    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ message: `Too many requests. Please try again in ${retryAfter} seconds.` });
    }
    next();
  };
}

// 5 OTP send requests per IP per 15 minutes
const otpSendLimiter = createRateLimiter(5, 15 * 60 * 1000);
// 10 OTP verify attempts per IP per 15 minutes
const otpVerifyLimiter = createRateLimiter(10, 15 * 60 * 1000);

// Clean up expired entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 30 * 60 * 1000);
// ---------------------------------------------------------------------------

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function saveOtp(mobile: string, otp: string, type: string) {
  await db.delete(otpVerifications).where(and(eq(otpVerifications.mobile, mobile), eq(otpVerifications.type, type)));
  await db.insert(otpVerifications).values({
    mobile,
    otp,
    type,
    verified: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
}

async function getOtp(mobile: string, type: string) {
  const rows = await db.select().from(otpVerifications)
    .where(and(eq(otpVerifications.mobile, mobile), eq(otpVerifications.type, type)));
  return rows[0] ?? null;
}

async function markOtpVerified(mobile: string, type: string) {
  await db.update(otpVerifications).set({ verified: true })
    .where(and(eq(otpVerifications.mobile, mobile), eq(otpVerifications.type, type)));
}

async function deleteOtp(mobile: string, type: string) {
  await db.delete(otpVerifications).where(and(eq(otpVerifications.mobile, mobile), eq(otpVerifications.type, type)));
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/send-registration-otp", otpSendLimiter, async (req, res) => {
    try {
      const schema = z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { mobile } = parsed.data;

      const existing = await storage.getUserByMobile(mobile);
      if (existing) {
        return res.status(409).json({ message: "An account with this mobile number already exists" });
      }

      const otp = generateOtp();
      await saveOtp(mobile, otp, "registration");

      const { simulated } = await sendSms(mobile, `Your ACCENZA registration OTP is ${otp}. Valid for 5 minutes. Do not share this code.`);

      res.json({ message: "OTP sent successfully", ...(simulated ? { otp, simulated: true } : {}) });
    } catch (error) {
      console.error("Send registration OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP. Please try again." });
    }
  });

  app.post("/api/auth/verify-registration-otp", otpVerifyLimiter, async (req, res) => {
    try {
      const schema = z.object({
        mobile: z.string().regex(/^[6-9]\d{9}$/),
        otp: z.string().regex(/^\d{4}$/),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { mobile, otp } = parsed.data;

      const stored = await getOtp(mobile, "registration");
      if (!stored) {
        return res.status(400).json({ message: "OTP expired or not requested. Please request a new one." });
      }
      if (stored.expiresAt < new Date()) {
        await deleteOtp(mobile, "registration");
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }
      if (stored.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP. Please try again." });
      }

      await markOtpVerified(mobile, "registration");
      res.json({ message: "Mobile number verified successfully" });
    } catch (error) {
      console.error("Verify registration OTP error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { name, mobile, email, pin, birthday } = parsed.data;

      const storedOtp = await getOtp(mobile, "registration");
      if (!storedOtp || !storedOtp.verified) {
        return res.status(400).json({ message: "Mobile number not verified. Please verify with OTP first." });
      }
      if (storedOtp.expiresAt < new Date()) {
        await deleteOtp(mobile, "registration");
        return res.status(400).json({ message: "Verification expired. Please start the registration again." });
      }
      await deleteOtp(mobile, "registration");

      const existing = await storage.getUserByMobile(mobile);
      if (existing) {
        return res.status(409).json({ message: "An account with this mobile number already exists" });
      }

      const hashedPin = await bcrypt.hash(pin, 10);
      const user = await storage.createUser({ name, mobile, email, pin: hashedPin, birthday });

      req.session.userId = user.id;
      res.json({ id: user.id, name: user.name, mobile: user.mobile, email: user.email, birthday: user.birthday, role: user.role });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { mobile, pin } = parsed.data;

      const user = await storage.getUserByMobile(mobile);
      if (!user) {
        return res.status(401).json({ message: "Invalid mobile number or PIN" });
      }

      const valid = await bcrypt.compare(pin, user.pin);
      if (!valid) {
        return res.status(401).json({ message: "Invalid mobile number or PIN" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, name: user.name, mobile: user.mobile, email: user.email, birthday: user.birthday, role: user.role });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/send-otp", otpSendLimiter, async (req, res) => {
    try {
      const schema = z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { mobile } = parsed.data;

      const user = await storage.getUserByMobile(mobile);
      if (!user) {
        return res.status(404).json({ message: "No account found with this mobile number" });
      }

      const otp = generateOtp();
      await saveOtp(mobile, otp, "login");

      const { simulated } = await sendSms(mobile, `Your ACCENZA login OTP is ${otp}. Valid for 5 minutes. Do not share this code.`);

      res.json({ message: "OTP sent successfully", ...(simulated ? { otp, simulated: true } : {}) });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP. Please try again." });
    }
  });

  app.post("/api/auth/verify-otp", otpVerifyLimiter, async (req, res) => {
    try {
      const schema = z.object({
        mobile: z.string().regex(/^[6-9]\d{9}$/),
        otp: z.string().regex(/^\d{4}$/),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { mobile, otp } = parsed.data;

      const stored = await getOtp(mobile, "login");
      if (!stored) {
        return res.status(400).json({ message: "OTP expired or not requested. Please request a new one." });
      }
      if (stored.expiresAt < new Date()) {
        await deleteOtp(mobile, "login");
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }
      if (stored.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP. Please try again." });
      }

      await deleteOtp(mobile, "login");

      const user = await storage.getUserByMobile(mobile);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, name: user.name, mobile: user.mobile, email: user.email, birthday: user.birthday, role: user.role });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not logged in" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, name: user.name, mobile: user.mobile, email: user.email, birthday: user.birthday, role: user.role });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
    const user = await storage.getUserById(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    (req as any).user = user;
    next();
  };

  const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
    const user = await storage.getUserById(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    (req as any).user = user;
    next();
  };

  app.post("/api/support/request", async (req, res) => {
    try {
      const schema = z.object({
        mobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number"),
        type: z.enum(["return", "exchange"]),
        orderNumber: z.string().min(1, "Order number required"),
        itemDescription: z.string().min(1, "Item description required"),
        reason: z.string().min(1, "Reason required"),
        extraDetails: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { mobile, type, orderNumber, itemDescription, reason, extraDetails } = parsed.data;
      const ticketNumber = `ACC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const request = await storage.createSupportRequest({ ticketNumber, mobile, type, orderNumber, itemDescription, reason, extraDetails });
      res.json(request);
    } catch (error) {
      console.error("Support request error:", error);
      res.status(500).json({ message: "Failed to submit request. Please try again." });
    }
  });

  app.get("/api/admin/support-requests", requireAdmin, async (_req, res) => {
    const requests = await storage.getSupportRequests();
    res.json(requests);
  });

  app.patch("/api/admin/support-requests/:id/status", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["pending", "processing", "resolved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const updated = await storage.updateSupportRequestStatus(id, status);
    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json(updated);
  });

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  app.get("/api/admin/dashboard/metrics", requireAdmin, async (_req, res) => {
    const metrics = await storage.getDashboardMetrics();
    res.json(metrics);
  });

  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const allOrders = await storage.getOrders({ status: status || undefined, startDate, endDate });
    res.json(allOrders);
  });

  app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const order = await storage.updateOrderStatus(id, status);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  });

  app.get("/api/admin/orders/:id/items", requireAdmin, async (req, res) => {
    const items = await storage.getOrderItems(Number(req.params.id));
    res.json(items);
  });

  app.get("/api/admin/sales", requireAdmin, async (req, res) => {
    const days = Number(req.query.days) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const report = await storage.getSalesReport(startDate, endDate);
    const topProducts = await storage.getTopSellingProducts(10);
    res.json({ report, topProducts });
  });

  app.get("/api/admin/stores", requireAdmin, async (_req, res) => {
    const allStores = await storage.getStores();
    res.json(allStores);
  });

  app.post("/api/admin/stores", requireAdmin, async (req, res) => {
    try {
      const store = await storage.createStore(req.body);
      res.json(store);
    } catch (error) {
      res.status(500).json({ message: "Failed to create store" });
    }
  });

  app.patch("/api/admin/stores/:id", requireAdmin, async (req, res) => {
    const store = await storage.updateStore(Number(req.params.id), req.body);
    if (!store) return res.status(404).json({ message: "Store not found" });
    res.json(store);
  });

  app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const inv = await storage.getInventory({ productId, storeId });
    res.json(inv);
  });

  app.patch("/api/admin/inventory/:id", requireAdmin, async (req, res) => {
    const { quantity } = req.body;
    const updated = await storage.updateInventoryQuantity(Number(req.params.id), quantity);
    if (!updated) return res.status(404).json({ message: "Inventory record not found" });
    res.json(updated);
  });

  app.post("/api/admin/inventory", requireAdmin, async (req, res) => {
    try {
      const inv = await storage.upsertInventory(req.body);
      res.json(inv);
    } catch (error) {
      res.status(500).json({ message: "Failed to update inventory" });
    }
  });

  // ---- Admin Article/Product management ----
  app.get("/api/admin/products", requireAdmin, async (_req, res) => {
    const productsList = await storage.getProducts();
    res.json(productsList);
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const parsed = insertProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const product = await storage.createProduct(parsed.data);
      const barcode = generateEAN13Barcode(product.id);
      const updated = await storage.updateProductBarcode(product.id, barcode);
      res.json(updated ?? product);
    } catch (error: any) {
      if (error?.code === "23505" && error?.constraint?.includes("barcode")) {
        return res.status(409).json({ message: "Barcode conflict. Please try again." });
      }
      console.error("Failed to create product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  const orderBodySchema = z.object({
    items: z.array(z.object({
      productId: z.number(),
      quantity: z.number().min(1),
      price: z.string(),
      size: z.string().optional(),
    })).min(1),
    shippingName: z.string().min(1, "Name is required"),
    shippingAddress: z.string().min(1, "Address is required"),
    shippingCity: z.string().min(1, "City is required"),
    shippingState: z.string().min(1, "State is required"),
    shippingPincode: z.string().regex(/^\d{6}$/, "Invalid pincode"),
    shippingPhone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone"),
    paymentMethod: z.string().min(1, "Payment method required"),
    promoCode: z.string().optional(),
  });

  function computeDiscount(campaign: { discountType: string; discountValue: string; minOrder: string }, subtotal: number): number {
    const min = Number(campaign.minOrder ?? 0);
    if (subtotal < min) return 0;
    const value = Number(campaign.discountValue);
    if (campaign.discountType === "percent") {
      return Math.round((subtotal * value) / 100);
    }
    if (campaign.discountType === "flat") {
      return Math.min(Math.round(value), subtotal);
    }
    return 0;
  }

  app.get("/api/campaigns/active", async (_req, res) => {
    const campaign = await storage.getActiveCampaign();
    if (!campaign) return res.json(null);
    res.json(campaign);
  });

  app.get("/api/campaigns/validate", async (req, res) => {
    const code = String(req.query.code || "").trim();
    const subtotal = Number(req.query.subtotal || 0);
    if (!code) return res.status(400).json({ valid: false, message: "Promo code required" });
    const campaign = await storage.getCampaignByPromoCode(code);
    const now = new Date();
    if (!campaign || !campaign.isActive || campaign.startDate > now || campaign.endDate < now) {
      return res.status(404).json({ valid: false, message: "Promo code not valid" });
    }
    if (Number(campaign.minOrder) > subtotal) {
      return res.status(400).json({ valid: false, message: `Minimum order ₹${campaign.minOrder} required` });
    }
    const discount = computeDiscount(campaign, subtotal);
    res.json({
      valid: true,
      promoCode: campaign.promoCode,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      discountAmount: discount,
      title: campaign.title,
    });
  });

  app.get("/api/admin/campaigns", requireAdmin, async (_req, res) => {
    const list = await storage.getCampaigns();
    res.json(list);
  });

  app.post("/api/admin/campaigns", requireAdmin, async (req, res) => {
    try {
      const parsed = insertCampaignSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      if (parsed.data.isActive) await storage.deactivateAllCampaigns();
      const created = await storage.createCampaign(parsed.data);
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to create campaign" });
    }
  });

  app.patch("/api/admin/campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const partial = insertCampaignSchema.partial().safeParse(req.body);
      if (!partial.success) return res.status(400).json({ message: partial.error.errors[0].message });
      if (partial.data.isActive) await storage.deactivateAllCampaigns();
      const updated = await storage.updateCampaign(id, partial.data);
      if (!updated) return res.status(404).json({ message: "Campaign not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to update campaign" });
    }
  });

  app.post("/api/admin/campaigns/:id/blast", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const campaign = (await storage.getCampaigns()).find(c => c.id === id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    const mobiles = await storage.getMarketingOptInMobiles();
    const body = `ACCENZA ${campaign.title}\n\n${campaign.subtitle}\nUse code ${campaign.promoCode} — ${campaign.discountType === "percent" ? campaign.discountValue + "% OFF" : "₹" + campaign.discountValue + " OFF"}.\n\nShop: https://accenza.in${campaign.ctaLink}`;
    let sent = 0, simulated = 0, failed = 0;
    for (const mobile of mobiles) {
      try {
        const r = await sendSms(mobile, body);
        if (r.simulated) simulated++; else sent++;
      } catch { failed++; }
    }
    res.json({ recipients: mobiles.length, sent, simulated, failed });
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const parsed = orderBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const user = (req as any).user;
      const { items, shippingName, shippingAddress, shippingCity, shippingState, shippingPincode, shippingPhone, paymentMethod, promoCode } = parsed.data;

      let subtotal = 0;
      for (const item of items) {
        subtotal += Number(item.price) * item.quantity;
      }

      let discountAmount = 0;
      let appliedPromo: string | null = null;
      if (promoCode) {
        const campaign = await storage.getCampaignByPromoCode(promoCode);
        const now = new Date();
        if (campaign && campaign.isActive && campaign.startDate <= now && campaign.endDate >= now && subtotal >= Number(campaign.minOrder)) {
          discountAmount = computeDiscount(campaign, subtotal);
          appliedPromo = campaign.promoCode;
        }
      }

      const totalAmount = Math.max(0, subtotal - discountAmount);

      const orderNumber = `ACCENZA-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const order = await storage.createOrder({
        userId: user.id,
        orderNumber,
        status: "placed",
        totalAmount: totalAmount.toString(),
        shippingName,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPincode,
        shippingPhone,
        paymentMethod,
        promoCode: appliedPromo,
        discountAmount: discountAmount.toString(),
      });

      // Nearest-store fulfillment for legacy order flow
      const legacyCartItems = items.map(i => ({ productId: i.productId, quantity: i.quantity }));
      const legacyNearestStore = await storage.findNearestStoreWithStock(legacyCartItems, shippingPincode);
      const legacyStoreId = legacyNearestStore?.id || null;

      // Fetch all products once to look up costPrice
      const allProducts = await storage.getProducts();

      for (const item of items) {
        let assignedStoreId = legacyStoreId;
        if (legacyStoreId) {
          const inv = await storage.getInventoryByProductAndStore(item.productId, legacyStoreId);
          if (!inv || (inv.quantity - inv.reservedQty) < item.quantity) {
            const allInv = await storage.getInventory({ productId: item.productId });
            const fb = allInv.find(i => (i.quantity - i.reservedQty) >= item.quantity);
            assignedStoreId = fb?.storeId || null;
          }
        } else {
          const allInv = await storage.getInventory({ productId: item.productId });
          const fb = allInv.find(i => (i.quantity - i.reservedQty) >= item.quantity);
          assignedStoreId = fb?.storeId || null;
        }

        const product = allProducts.find(p => p.id === item.productId);
        await storage.createOrderItem({
          orderId: order.id,
          productId: item.productId,
          storeId: assignedStoreId,
          quantity: item.quantity,
          price: item.price,
          costPrice: product?.costPrice ?? "0",
          size: item.size || null,
        });

        if (assignedStoreId) {
          const inv = await storage.getInventoryByProductAndStore(item.productId, assignedStoreId);
          if (inv) {
            await storage.updateInventoryQuantity(inv.id, inv.quantity - item.quantity);
          }
        }
      }

      if (legacyStoreId) {
        await storage.updateOrderShipping(order.id, { fulfilledFromStoreId: legacyStoreId });
      }

      res.json(order);
    } catch (error) {
      console.error("Order error:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const userOrders = await storage.getOrdersByUser(user.id);
    res.json(userOrders);
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const order = await storage.getOrder(Number(req.params.id));
    if (!order || order.userId !== user.id) {
      return res.status(404).json({ message: "Order not found" });
    }
    const items = await storage.getOrderItems(order.id);
    res.json({ ...order, items });
  });

  app.get(api.products.list.path, async (req, res) => {
    const productsList = await storage.getProducts();
    res.json(productsList);
  });

  app.get(api.products.getByCategory.path, async (req, res) => {
    const category = req.params.category;
    const subcategory = req.query.subcategory as string | undefined;
    
    if (subcategory) {
      const productsList = await storage.getProductsByCategoryAndSubcategory(category, subcategory);
      res.json(productsList);
    } else {
      const productsList = await storage.getProductsByCategory(category);
      res.json(productsList);
    }
  });

  // Search endpoint — must be registered before /api/products/:id to avoid conflict
  app.get("/api/products/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.status(400).json({ message: "Query must be at least 2 characters" });
    if (q.length > 100) return res.status(400).json({ message: "Query too long" });
    const results = await storage.searchProducts(q);
    res.json(results);
  });

  app.get(api.products.get.path, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    
    const product = await storage.getProduct(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  });

  // ---------------------------------------------------------------------------
  // Razorpay payment routes
  // ---------------------------------------------------------------------------

  // Expose Razorpay config status + key ID to the client
  app.get("/api/payment/config", (_req, res) => {
    res.json({ configured: isRazorpayConfigured(), keyId: getRazorpayKeyId() });
  });

  const paymentOrderSchema = z.object({
    items: z.array(z.object({
      productId: z.number(),
      quantity: z.number().min(1),
      price: z.string(),
      size: z.string().optional(),
    })).min(1),
    shippingName: z.string().min(1),
    shippingAddress: z.string().min(1),
    shippingCity: z.string().min(1),
    shippingState: z.string().min(1),
    shippingPincode: z.string().regex(/^\d{6}$/),
    shippingPhone: z.string().regex(/^[6-9]\d{9}$/),
    paymentMethod: z.string().min(1),
    promoCode: z.string().optional(),
  });

  // Step 1: Create a Razorpay order — server computes the authoritative total
  app.post("/api/payment/create-order", requireAuth, async (req, res) => {
    try {
      const parsed = paymentOrderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const { items, promoCode } = parsed.data;

      let subtotal = 0;
      for (const item of items) {
        subtotal += Number(item.price) * item.quantity;
      }

      let discountAmount = 0;
      let appliedPromo: string | null = null;
      if (promoCode) {
        const campaign = await storage.getCampaignByPromoCode(promoCode);
        const now = new Date();
        if (campaign && campaign.isActive && campaign.startDate <= now && campaign.endDate >= now && subtotal >= Number(campaign.minOrder)) {
          discountAmount = computeDiscount(campaign, subtotal);
          appliedPromo = campaign.promoCode;
        }
      }

      const totalAmount = Math.max(0, subtotal - discountAmount);
      const receipt = `ACCENZA-${Date.now()}`;

      const rzpOrder = await createRazorpayOrder(totalAmount, receipt);

      res.json({
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: getRazorpayKeyId(),
        totalAmount,
        discountAmount,
        appliedPromo,
        receipt,
      });
    } catch (error) {
      console.error("Create payment order error:", error);
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  // Step 2: Verify payment + create DB order + issue GST invoice
  app.post("/api/payment/verify", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
        totalAmount: z.number(),
        discountAmount: z.number(),
        appliedPromo: z.string().nullable(),
        items: z.array(z.object({
          productId: z.number(),
          quantity: z.number().min(1),
          price: z.string(),
          size: z.string().optional(),
        })).min(1),
        shippingName: z.string().min(1),
        shippingAddress: z.string().min(1),
        shippingCity: z.string().min(1),
        shippingState: z.string().min(1),
        shippingPincode: z.string().regex(/^\d{6}$/),
        shippingPhone: z.string().regex(/^[6-9]\d{9}$/),
        paymentMethod: z.string().min(1),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const {
        razorpayOrderId, razorpayPaymentId, razorpaySignature,
        totalAmount, discountAmount, appliedPromo,
        items, shippingName, shippingAddress, shippingCity, shippingState,
        shippingPincode, shippingPhone, paymentMethod,
      } = parsed.data;

      // Verify HMAC signature
      const signatureValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!signatureValid) {
        return res.status(400).json({ message: "Payment verification failed. Please contact support." });
      }

      const user = (req as any).user;

      // Compute GST breakdown for invoice
      const products = await storage.getProducts();
      let totalGST = 0;
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const category = product?.category || "Apparel";
        const gst = calculateGST(category, Number(item.price), item.quantity, shippingState);
        totalGST += gst.totalGST;
      }

      const invoiceNumber = generateInvoiceNumber();
      const orderNumber = `ACCENZA-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Create order in DB
      const order = await storage.createOrder({
        userId: user.id,
        orderNumber,
        status: "confirmed",  // payment already completed
        totalAmount: totalAmount.toString(),
        shippingName,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPincode,
        shippingPhone,
        paymentMethod,
        promoCode: appliedPromo,
        discountAmount: discountAmount.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        paymentStatus: "paid",
        invoiceNumber,
        gstAmount: (Math.round(totalGST * 100) / 100).toString(),
      });

      // ---------------------------------------------------------------
      // Nearest-store fulfillment — pick the closest store with stock
      // ---------------------------------------------------------------
      const cartItems = items.map(i => ({ productId: i.productId, quantity: i.quantity }));
      const nearestStore = await storage.findNearestStoreWithStock(cartItems, shippingPincode);

      let fulfilledStoreId: number | null = null;
      if (nearestStore) {
        fulfilledStoreId = nearestStore.id;
        console.log(`[Fulfillment] Order ${orderNumber} → ${nearestStore.name} (${nearestStore.city}, ~${Math.round(nearestStore.distance ?? 0)}km)`);
      }

      // Create order items + deduct inventory from the fulfilling store
      for (const item of items) {
        let assignedStoreId: number | null = fulfilledStoreId;

        // If nearest store doesn't have this specific item, fall back to any store
        if (fulfilledStoreId) {
          const inv = await storage.getInventoryByProductAndStore(item.productId, fulfilledStoreId);
          if (!inv || (inv.quantity - inv.reservedQty) < item.quantity) {
            // Fallback: find any store that has this item
            const allInv = await storage.getInventory({ productId: item.productId });
            const fallbackStore = allInv.find(i => (i.quantity - i.reservedQty) >= item.quantity);
            assignedStoreId = fallbackStore?.storeId || null;
          }
        } else {
          const allInv = await storage.getInventory({ productId: item.productId });
          const fallbackStore = allInv.find(i => (i.quantity - i.reservedQty) >= item.quantity);
          assignedStoreId = fallbackStore?.storeId || null;
        }

        const prod = products.find(p => p.id === item.productId);
        await storage.createOrderItem({
          orderId: order.id,
          productId: item.productId,
          storeId: assignedStoreId,
          quantity: item.quantity,
          price: item.price,
          costPrice: prod?.costPrice ?? "0",
          size: item.size || null,
        });

        // Deduct inventory
        if (assignedStoreId) {
          const inv = await storage.getInventoryByProductAndStore(item.productId, assignedStoreId);
          if (inv) {
            await storage.updateInventoryQuantity(inv.id, inv.quantity - item.quantity);
          }
        }
      }

      // Update order with fulfillment store
      if (fulfilledStoreId) {
        await storage.updateOrderShipping(order.id, { fulfilledFromStoreId: fulfilledStoreId });
      }

      // ---------------------------------------------------------------
      // Shiprocket — create shipping order from the fulfilling store
      // ---------------------------------------------------------------
      try {
        const fulfillStore = fulfilledStoreId
          ? await storage.getStore(fulfilledStoreId)
          : null;

        const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
        const dims = estimatePackageDimensions(totalItems);

        const shiprocketItems = items.map(item => {
          const product = products.find(p => p.id === item.productId);
          const category = product?.category || "Apparel";
          const gst = calculateGST(category, Number(item.price), 1, shippingState);
          return {
            name: product?.name || "Product",
            sku: `ACCENZA-${item.productId}`,
            units: item.quantity,
            sellingPrice: Number(item.price),
            hsn: gst.hsnCode,
          };
        });

        const srResult = await createShiprocketOrder({
          orderNumber,
          orderDate: new Date().toISOString().split("T")[0],
          pickupLocation: fulfillStore?.name || "ACCENZA Ahmedabad SG Highway",
          billingName: shippingName,
          billingAddress: shippingAddress,
          billingCity: shippingCity,
          billingState: shippingState,
          billingPincode: shippingPincode,
          billingPhone: shippingPhone,
          billingEmail: user.email || "",
          shippingIsBilling: true,
          items: shiprocketItems,
          subTotal: totalAmount,
          paymentMethod: "Prepaid",
          weight: dims.weight,
          length: dims.length,
          breadth: dims.breadth,
          height: dims.height,
        });

        if (srResult) {
          // Auto-assign AWB (cheapest courier)
          let awbInfo: { awbNumber: string; courierName: string; freightCharge: number } | null = null;
          if (srResult.shipmentId) {
            awbInfo = await generateAWB(srResult.shipmentId);
            if (awbInfo) {
              await requestPickup(srResult.shipmentId);
            }
          }

          await storage.updateOrderShipping(order.id, {
            shiprocketOrderId: String(srResult.orderId),
            shiprocketShipmentId: String(srResult.shipmentId),
            awbNumber: awbInfo?.awbNumber || srResult.awbNumber || undefined,
            courierName: awbInfo?.courierName || srResult.courierName || undefined,
            logisticsCost: awbInfo?.freightCharge ? String(awbInfo.freightCharge) : "0",
            status: "processing",
          });

          console.log(`[Shiprocket] Order ${orderNumber} → SR#${srResult.orderId} / Shipment#${srResult.shipmentId}${awbInfo ? ` / AWB: ${awbInfo.awbNumber} (${awbInfo.courierName})` : ""}`);
        }
      } catch (srErr) {
        console.error("[Shiprocket] Order creation failed (non-fatal):", srErr);
        // Order is still created — shipping can be assigned manually later
      }

      // Build and send GST invoice
      try {
        const orderItemsResult = await storage.getOrderItems(order.id);
        const invoiceData = buildInvoiceData(order, orderItemsResult, user, products);
        const invoiceHtml = generateInvoiceHTML(invoiceData);

        await sendInvoiceWhatsApp(shippingPhone, invoiceNumber, orderNumber, totalAmount, invoiceHtml);
        if (user.email) await sendInvoiceEmail(user.email, invoiceNumber, orderNumber, invoiceHtml);
      } catch (invoiceErr) {
        console.error("Invoice delivery error (non-fatal):", invoiceErr);
      }

      // Return full order with items and fulfillment info
      const finalOrder = await storage.getOrder(order.id);
      res.json({ ...finalOrder, items: await storage.getOrderItems(order.id) });
    } catch (error) {
      console.error("Payment verify error:", error);
      res.status(500).json({ message: "Failed to process payment. Please contact support." });
    }
  });

  // ---------------------------------------------------------------------------
  // Pincode serviceability check
  // ---------------------------------------------------------------------------
  // Serviceable pin-ranges are derived from the store cities seeded in the DB.
  // The app also supports a static allow-list of metro-area prefixes for fast
  // client-side feedback before the full store-level stock check.
  // ---------------------------------------------------------------------------

  const SERVICEABLE_PIN_PREFIXES = [
    // Gujarat (home state — always serviceable)
    "36", "37", "38", "39",
    // Mumbai / Maharashtra
    "40", "41",
    // Delhi NCR
    "11",
    // Bangalore / Karnataka
    "56",
    // Chennai / Tamil Nadu
    "60",
    // Kolkata / West Bengal
    "70",
    // Hyderabad / Telangana
    "50",
    // Pune
    "41",
    // Jaipur / Rajasthan
    "30", "31", "32", "33", "34",
    // Lucknow / Uttar Pradesh
    "20", "21", "22", "23", "24", "25", "26", "27", "28",
  ];

  // De-duplicate for fast Set lookup
  const serviceablePrefixes = new Set(SERVICEABLE_PIN_PREFIXES);

  app.get("/api/pincode/check", async (req, res) => {
    const pincode = String(req.query.pincode ?? "").trim();
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ serviceable: false, message: "Enter a valid 6-digit pincode" });
    }

    // If Shiprocket is configured, check real courier serviceability
    if (isShiprocketConfigured()) {
      try {
        // Use Ahmedabad warehouse as default pickup for serviceability check
        const couriers = await checkServiceability("380054", pincode);
        if (couriers.length > 0) {
          const fastest = couriers.reduce((a, b) => a.estimatedDays < b.estimatedDays ? a : b);
          const cheapest = couriers.reduce((a, b) => a.rate < b.rate ? a : b);
          return res.json({
            serviceable: true,
            estimatedDays: `${fastest.estimatedDays}-${fastest.estimatedDays + 2}`,
            message: `Delivery available via ${fastest.courierName} — estimated ${fastest.estimatedDays}-${fastest.estimatedDays + 2} business days`,
            courierOptions: couriers.length,
          });
        }
        return res.json({
          serviceable: false,
          message: "Sorry, we don't deliver to this pincode yet. We're expanding soon!",
        });
      } catch {
        // Fall through to static check
      }
    }

    // Fallback: static prefix-based check
    const prefix = pincode.substring(0, 2);
    const serviceable = serviceablePrefixes.has(prefix);
    if (serviceable) {
      return res.json({
        serviceable: true,
        estimatedDays: prefix.startsWith("3") ? "2-4" : "4-7",
        message: prefix.startsWith("3")
          ? "Delivery available — estimated 2-4 business days"
          : "Delivery available — estimated 4-7 business days",
      });
    }
    return res.json({
      serviceable: false,
      message: "Sorry, we don't deliver to this pincode yet. We're expanding soon!",
    });
  });

  // ---------------------------------------------------------------------------
  // Shiprocket shipping routes
  // ---------------------------------------------------------------------------

  // Expose Shiprocket config status
  app.get("/api/shipping/config", (_req, res) => {
    res.json({ configured: isShiprocketConfigured() });
  });

  // Track order shipment — customer-facing
  app.get("/api/orders/:id/tracking", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const order = await storage.getOrder(Number(req.params.id));
    if (!order || order.userId !== user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!order.shiprocketShipmentId) {
      return res.json({
        status: order.status,
        message: "Your order is being processed. Tracking will be available once shipped.",
        awbNumber: null,
        courierName: null,
        trackingUrl: null,
        activities: [],
      });
    }

    const tracking = await trackShipment(order.shiprocketShipmentId);
    if (!tracking) {
      return res.json({
        status: order.status,
        message: "Tracking information is being updated. Please check back later.",
        awbNumber: order.awbNumber,
        courierName: order.courierName,
        trackingUrl: order.trackingUrl,
        activities: [],
      });
    }

    // Update order status from Shiprocket tracking
    const mappedStatus = mapShiprocketStatus(tracking.shipmentStatus);
    if (mappedStatus !== order.status) {
      await storage.updateOrderShipping(order.id, {
        status: mappedStatus,
        trackingUrl: tracking.trackingUrl || undefined,
      });
    }

    res.json({
      status: mappedStatus,
      currentStatus: tracking.currentStatus,
      awbNumber: tracking.awbNumber || order.awbNumber,
      courierName: tracking.courierName || order.courierName,
      trackingUrl: tracking.trackingUrl || order.trackingUrl,
      estimatedDelivery: tracking.estimatedDelivery,
      activities: tracking.activities,
    });
  });

  // Get fulfillment info for an order (which store is shipping)
  app.get("/api/orders/:id/fulfillment", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const order = await storage.getOrder(Number(req.params.id));
    if (!order || order.userId !== user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    let store = null;
    if (order.fulfilledFromStoreId) {
      store = await storage.getStore(order.fulfilledFromStoreId);
    }

    res.json({
      fulfilledFromStore: store ? { name: store.name, city: store.city, state: store.state } : null,
      shiprocketOrderId: order.shiprocketOrderId,
      awbNumber: order.awbNumber,
      courierName: order.courierName,
      trackingUrl: order.trackingUrl,
    });
  });

  // Shiprocket webhook — receives real-time status updates
  // Configure this URL in Shiprocket dashboard → Settings → Webhooks
  //
  // Real payload shape (from Shiprocket docs + live testing):
  //   order_id: "ACCENZA-xxx"          ← our orderNumber (what we passed during create)
  //   sr_order_id: 348456385         ← Shiprocket's internal order ID
  //   current_status: "IN TRANSIT"   ← text status
  //   current_status_id: 20          ← numeric status code
  //   shipment_status_id: 18         ← numeric shipment status
  //   awb: "19041424751540"
  //   courier_name: "Delhivery Surface"
  //   etd: "2023-05-23 15:40:19"
  //   scans: [{ date, status, activity, location, "sr-status", "sr-status-label" }]
  //   is_return: 0|1
  // ---------------------------------------------------------------------------
  app.post("/api/webhooks/shiprocket", async (req, res) => {
    try {
      const {
        order_id,          // Our orderNumber (e.g. "ACCENZA-1716000000-ABCD")
        sr_order_id,       // Shiprocket's internal order ID
        current_status,    // Text: "IN TRANSIT", "DELIVERED", etc.
        current_status_id, // Numeric ID
        shipment_status_id,
        awb,
        courier_name,
        etd,
        scans,
        is_return,
      } = req.body;

      if (!order_id && !sr_order_id) {
        return res.status(200).json({ received: true, skipped: true });
      }

      // Find our order — first try by orderNumber (order_id), then by shiprocketOrderId
      let order: any = null;
      if (order_id) {
        order = await storage.getOrderByNumber(String(order_id));
      }
      if (!order && sr_order_id) {
        const allOrders = await storage.getOrders({});
        order = allOrders.find(o => o.shiprocketOrderId === String(sr_order_id));
      }

      if (!order) {
        console.warn(`[Shiprocket Webhook] Unknown order — order_id: ${order_id}, sr_order_id: ${sr_order_id}`);
        return res.status(200).json({ received: true });
      }

      // Map status using text first, fall back to numeric ID
      const mappedStatus = mapShiprocketStatus(
        current_status || String(shipment_status_id || current_status_id || "")
      );

      // Handle RTO (return to origin) — mark as returned if is_return=1
      const finalStatus = is_return === 1 && mappedStatus !== "rto" ? "rto" : mappedStatus;

      await storage.updateOrderShipping(order.id, {
        status: finalStatus,
        awbNumber: awb || order.awbNumber || undefined,
        courierName: courier_name || order.courierName || undefined,
        shiprocketOrderId: sr_order_id ? String(sr_order_id) : order.shiprocketOrderId || undefined,
      });

      console.log(
        `[Shiprocket Webhook] Order ${order.orderNumber} → ${finalStatus}` +
        ` (SR: "${current_status}" / status_id: ${shipment_status_id || current_status_id})` +
        `${awb ? ` AWB: ${awb}` : ""}${courier_name ? ` via ${courier_name}` : ""}` +
        `${etd ? ` ETA: ${etd}` : ""}`
      );

      // WhatsApp notifications on key milestones
      const notifyStatuses: Record<string, string> = {
        shipped: [
          `📦 Your ACCENZA order *${order.orderNumber}* has been shipped!`,
          awb ? `\nAWB: ${awb}` : "",
          courier_name ? `\nCourier: ${courier_name}` : "",
          etd ? `\nEstimated delivery: ${etd.split(" ")[0]}` : "",
          `\n\nTrack your order in the ACCENZA app.`,
        ].join(""),
        out_for_delivery: `🚚 Your ACCENZA order *${order.orderNumber}* is out for delivery today!\n\nPlease keep your phone handy. The delivery agent may call you.`,
        delivered: `✅ Your ACCENZA order *${order.orderNumber}* has been delivered!\n\nThank you for shopping with ACCENZA. We'd love to hear your feedback! 🙏`,
        rto: `⚠️ Your ACCENZA order *${order.orderNumber}* could not be delivered and is being returned.\n\nPlease contact us at customercare@accenzafashion.in for assistance.`,
      };

      const msg = notifyStatuses[finalStatus];
      if (msg) {
        try { await sendSms(order.shippingPhone, msg); } catch { /* non-fatal */ }
      }

      res.status(200).json({ received: true, status: finalStatus });
    } catch (err) {
      console.error("[Shiprocket Webhook] Error:", err);
      res.status(200).json({ received: true }); // Always 200 to prevent retries
    }
  });

  // Admin: Check courier serviceability between two pincodes
  app.get("/api/admin/shipping/serviceability", requireAdmin, async (req, res) => {
    const pickup = String(req.query.pickup || "");
    const delivery = String(req.query.delivery || "");
    if (!pickup || !delivery) return res.status(400).json({ message: "pickup and delivery pincodes required" });

    const couriers = await checkServiceability(pickup, delivery);
    res.json({ couriers });
  });

  // Admin: Cancel Shiprocket order
  app.post("/api/admin/orders/:id/cancel-shipment", requireAdmin, async (req, res) => {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.shiprocketOrderId) {
      return res.status(400).json({ message: "No Shiprocket order linked" });
    }

    const cancelled = await cancelShiprocketOrder(Number(order.shiprocketOrderId));
    if (cancelled) {
      await storage.updateOrderStatus(order.id, "cancelled");
      res.json({ message: "Shipment cancelled", orderId: order.id });
    } else {
      res.status(500).json({ message: "Failed to cancel Shiprocket shipment" });
    }
  });

  // ---------------------------------------------------------------------------

  // Sitemap — helps search engines discover all pages
  app.get("/sitemap.xml", async (_req, res) => {
    const base = process.env.SITE_URL || "https://accenza.fashion";
    const staticPaths = ["/", "/summer", "/exchange-policy",
      "/category/Mens", "/category/Ladies", "/category/Kids",
      "/category/Accessories", "/category/Footwear", "/category/Cosmetics"];

    let urls = staticPaths.map((p) =>
      `  <url><loc>${base}${p}</loc><changefreq>weekly</changefreq><priority>${p === "/" ? "1.0" : "0.8"}</priority></url>`
    );

    try {
      const products = await storage.getProducts();
      const productUrls = products.map((p) =>
        `  <url><loc>${base}/product/${p.id}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
      );
      urls = urls.concat(productUrls);
    } catch {
      // If DB is unavailable, return static-only sitemap
    }

    res.set("Content-Type", "application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
  });

  // ---------------------------------------------------------------------------
  // WhatsApp AI Stylist Webhook
  // Twilio sends incoming WhatsApp messages here
  // ---------------------------------------------------------------------------
  app.post("/api/webhooks/whatsapp", async (req, res) => {
    // Always respond 200 to Twilio immediately
    res.set("Content-Type", "text/xml");

    try {
      const { Body: messageBody, From: from, To: to } = req.body;

      if (!messageBody || !from) {
        return res.send("<Response></Response>");
      }

      // Extract 10-digit Indian mobile from "whatsapp:+91XXXXXXXXXX"
      const mobile = from.replace("whatsapp:+91", "").replace("whatsapp:+", "");
      const userMessage = messageBody.trim();

      console.log(`[AI Stylist] Message from +91${mobile}: ${userMessage.substring(0, 100)}`);

      // Save user message
      await storage.addStylistMessage({
        mobile,
        role: "user",
        message: userMessage,
        productIds: null,
      });

      let reply: string;
      let productIds: number[] = [];

      if (isAIStylistConfigured()) {
        // Get conversation history
        const history = await storage.getStylistConversation(mobile);
        // Get product catalog
        const products = await storage.getProducts();

        const result = await processStylistMessage(mobile, userMessage, history, products);
        reply = result.reply;
        productIds = result.productIds;
      } else {
        // Demo mode — no OpenAI key
        reply = getDemoResponse(userMessage);
      }

      // Save assistant response
      await storage.addStylistMessage({
        mobile,
        role: "assistant",
        message: reply,
        productIds: productIds.length > 0 ? productIds.join(",") : null,
      });

      // Send reply via WhatsApp
      await sendWhatsApp(mobile, reply);

      console.log(`[AI Stylist] Replied to +91${mobile} (${productIds.length} products recommended)`);

      // Respond with empty TwiML (we send the reply via REST API instead)
      res.send("<Response></Response>");
    } catch (error) {
      console.error("[AI Stylist] Webhook error:", error);
      res.send("<Response></Response>");
    }
  });

  // Admin endpoint — AI Stylist stats
  app.get("/api/admin/stylist/stats", requireAdmin, async (_req, res) => {
    const stats = await storage.getStylistStats();
    res.json(stats);
  });

  // Admin endpoint — recent stylist conversations
  app.get("/api/admin/stylist/conversations", requireAdmin, async (_req, res) => {
    // Get unique mobiles with their latest message
    const allMessages = await storage.getStylistConversation("", 200);
    res.json(allMessages);
  });

  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  try {
    const existingProducts = await storage.getProducts();
    if (existingProducts.length > 0) {
      const hasV3Subcats = existingProducts.some(p => p.subcategory === "Joggers" || p.subcategory === "Rompers") && !existingProducts.some(p => p.name === "Boys Sherwani Set");
      const hasMuscleTees = existingProducts.some(p => p.subcategory === "Muscle Tees");
      const hasIndianCordSets = existingProducts.some(p => p.subcategory === "Cord Sets" && p.category === "Ladies" && p.name.startsWith("Prisha"));
      const hasGoldEarrings = existingProducts.some(p => p.name === "Hammered Gold Square Stud Earrings");
      const hasCosmetics = existingProducts.some(p => p.category === "Cosmetics");
      if (hasV3Subcats && hasMuscleTees && hasIndianCordSets && hasGoldEarrings && hasCosmetics) {
        await seedStoresAndInventory();
        await seedAdminUser();
        await seedSummerCampaign();
        return;
      }

      await storage.deleteAllProducts();
    }

    const seedData = [
      // ===== MENS - Casual Wear =====
      { name: "Classic Crew Neck T-Shirt", description: "Soft cotton crew neck tee with a relaxed fit, perfect for everyday styling.", price: "799", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "T-Shirts" },
      { name: "Striped Polo T-Shirt", description: "Piqué cotton polo with contrast stripes and ribbed collar.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1625910513413-5fc421e0e6f5?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "T-Shirts" },
      { name: "Premium Linen Shirt", description: "Breathable, high-quality linen shirt for a sophisticated summer look.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Shirts" },
      { name: "Oxford Button-Down Shirt", description: "Crisp oxford cotton shirt with button-down collar, a wardrobe essential.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Shirts" },
      { name: "Tailored Chino Trousers", description: "Slim-fit chinos crafted from stretch-cotton twill for all-day comfort.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1624371414361-e67094c24944?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Trousers" },
      { name: "Formal Pleated Trousers", description: "Tailored pleated trousers in fine wool blend, ideal for the office.", price: "3499", imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Trousers" },
      { name: "Slim Fit Dark Wash Jeans", description: "Classic 5-pocket jeans in premium dark indigo denim with stretch.", price: "2799", imageUrl: "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Jeans" },
      { name: "Relaxed Fit Light Jeans", description: "Comfortable relaxed-fit jeans in faded light wash denim.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1582552938357-32b906df40cb?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Jeans" },
      { name: "Leather Biker Jacket", description: "Genuine leather biker jacket with zip detailing and quilted shoulders.", price: "8999", imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Jackets" },
      { name: "Puffer Winter Jacket", description: "Warm padded puffer jacket with water-resistant shell and hood.", price: "4999", imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Jackets" },
      // ===== MENS - Muscle Tees =====
      { name: "Ribbed Black Muscle Tee", description: "Slim-fit ribbed cotton muscle tee in jet black. Cropped armholes, drop shoulders — built for the gym, made for the streets.", price: "899", imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Olive Drop-Cut Muscle Tee", description: "Heavyweight olive muscle tee with raw-cut armholes and elongated hem. Streetwear staple for layering.", price: "999", imageUrl: "https://images.unsplash.com/photo-1571945153237-4929e783af4a?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Stone Wash Vintage Muscle Tee", description: "Sun-faded stone-wash cotton muscle tee with a worn-in feel. Boxy fit, deep arm openings.", price: "1099", imageUrl: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "White Performance Muscle Tee", description: "Quick-dry performance muscle tee in clean white. Mesh-back panel for ventilation during heavy lifts.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1622445275576-721325763afe?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Graphic Print Muscle Tee", description: "Bold graphic-print muscle tee in charcoal. Soft-hand cotton, oversized cut, gym-to-street ready.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Burgundy Ribbed Muscle Tee", description: "Deep burgundy ribbed muscle tee with a stretchy fit that hugs the chest and shoulders.", price: "949", imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Acid Wash Muscle Tank", description: "Statement acid-wash muscle tee with extra-deep arm cuts. Made for max gun-show.", price: "1099", imageUrl: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      { name: "Heavyweight Cropped Muscle Tee", description: "Boxy heavyweight muscle tee with a cropped hem. Pairs perfectly with joggers or cargos.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1617952236317-0bd127407984?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Muscle Tees" },
      // ===== MENS - Ethnic Wear =====
      { name: "Cotton Kurta Set", description: "Traditional cotton kurta with embroidered neckline, paired with churidar.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Kurtas" },
      { name: "Silk Blend Kurta", description: "Festive silk blend kurta with intricate threadwork and mandarin collar.", price: "4499", imageUrl: "https://images.unsplash.com/photo-1598522325074-042db73aa4e6?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Kurtas" },
      { name: "Classic Nehru Jacket", description: "Mandarin collar Nehru jacket in textured cotton, versatile layering piece.", price: "3499", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Nehru Jackets" },
      { name: "Brocade Nehru Jacket", description: "Festive brocade Nehru jacket with silk lining, ideal for celebrations.", price: "4999", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Nehru Jackets" },
      // ===== MENS - Athleisure =====
      { name: "Slim Fit Joggers", description: "Tapered slim-fit joggers in French terry with zip pockets.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1624371414361-e67094c24944?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Joggers" },
      { name: "Cotton Blend Joggers", description: "Relaxed cotton-blend joggers with elastic cuffs and drawstring waist.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Joggers" },
      { name: "Striped Track Pants", description: "Classic track pants with side stripe and elasticated waistband.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1624371414361-e67094c24944?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Track Pants" },
      { name: "Quick-Dry Track Pants", description: "Lightweight quick-dry track pants with mesh-lined pockets for workouts.", price: "1599", imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Track Pants" },
      { name: "Dri-Fit Sports T-Shirt", description: "Moisture-wicking sports tee with flatlock seams for gym and running.", price: "999", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sports T-Shirts" },
      { name: "Compression Sports Tee", description: "Performance compression tee with breathable mesh panels.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sports T-Shirts" },
      { name: "Fleece Pullover Hoodie", description: "Warm fleece hoodie with kangaroo pocket and adjustable drawstring hood.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Hoodies" },
      { name: "Zip-Up Training Hoodie", description: "Full-zip training hoodie in lightweight tech fabric with thumb holes.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Hoodies" },
      // ===== MENS - Accessories =====
      { name: "Mens Chronograph Watch", description: "Sleek stainless steel chronograph watch with leather strap.", price: "7999", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Watches" },
      { name: "Reversible Leather Belt", description: "Premium reversible leather belt with polished buckle, black to brown.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Belts" },
      { name: "Genuine Leather Wallet", description: "Slim bifold wallet in genuine leather with RFID protection.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Wallets" },
      { name: "Aviator Sunglasses", description: "Classic aviator sunglasses with UV400 protection and metal frame.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sunglasses" },
      // ===== MENS - Footwear =====
      { name: "Mens White Sneakers", description: "Clean white leather sneakers with cushioned insole for everyday wear.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sneakers" },
      { name: "Retro Running Sneakers", description: "Retro-inspired running sneakers with suede panels and mesh upper.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sneakers" },
      { name: "Derby Formal Shoes", description: "Classic derby shoes in polished leather for formal occasions.", price: "5999", imageUrl: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Formal Shoes" },
      { name: "Cap-Toe Oxford Shoes", description: "Elegant cap-toe oxford shoes handcrafted from premium calfskin.", price: "7499", imageUrl: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Formal Shoes" },
      { name: "Leather Slide Sandals", description: "Minimalist leather slide sandals with contoured cork footbed.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1603487742131-4160ec999306?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Sandals" },
      { name: "Handcrafted Leather Loafers", description: "Classic loafers in premium Italian leather with polished finish.", price: "5499", imageUrl: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?q=80&w=800&auto=format&fit=crop", category: "Mens", subcategory: "Loafers" },

      // ===== LADIES - Western Wear =====
      { name: "Relaxed Fit Women's T-Shirt", description: "Soft cotton tee with a relaxed drop-shoulder fit, everyday essential.", price: "799", imageUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "T-Shirts" },
      { name: "Printed V-Neck T-Shirt", description: "Trendy V-neck tee with abstract print in breathable cotton jersey.", price: "999", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "T-Shirts" },
      { name: "Ruffle Blouse Top", description: "Feminine ruffle blouse in lightweight chiffon with tie-neck detail.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Tops" },
      { name: "Cropped Knit Top", description: "Cropped ribbed knit top with short sleeves and fitted silhouette.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Tops" },
      { name: "Satin Wrap Dress", description: "Elegant satin wrap dress with a graceful drape, perfect for evening.", price: "4599", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Dresses" },
      { name: "Floral Midi Dress", description: "Romantic floral print midi dress with puff sleeves and tiered skirt.", price: "3299", imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Dresses" },
      { name: "High-Rise Skinny Jeans", description: "Sculpting high-rise skinny jeans in power-stretch denim.", price: "2799", imageUrl: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Jeans" },
      { name: "Wide Leg Palazzo Jeans", description: "Trendy wide-leg palazzo jeans in light blue wash.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1475178626620-a4d074967571?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Jeans" },
      { name: "Pleated Midi Skirt", description: "Elegant pleated midi skirt in satin finish with elastic waistband.", price: "2199", imageUrl: "https://images.unsplash.com/photo-1592301933927-35b597393c0a?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Skirts" },
      { name: "Denim Mini Skirt", description: "Classic denim mini skirt with raw hem and button-front closure.", price: "1599", imageUrl: "https://images.unsplash.com/photo-1592301933927-35b597393c0a?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Skirts" },
      { name: "Cropped Denim Jacket", description: "Classic cropped denim jacket with vintage wash and brass buttons.", price: "2999", imageUrl: "https://images.unsplash.com/photo-1551537482-f2075a1d41f2?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Jackets" },
      { name: "Ribbed Cord Set", description: "Matching ribbed crop top and wide-leg trousers in soft jersey knit.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Linen Co-ord Set", description: "Breezy linen shirt and shorts co-ord set, perfect for summer outings.", price: "2799", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Women's Jogger & Crop Top Set", description: "Matching jogger and crop top athleisure set in soft cotton blend.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Athleisure" },
      { name: "High-Waist Leggings", description: "Sculpting high-waist leggings with breathable fabric for yoga and gym.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Athleisure" },
      // ===== LADIES - Indian Wear =====
      { name: "Embroidered Anarkali Kurta", description: "Gorgeous Anarkali kurta with intricate embroidery and flared silhouette.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Kurtas" },
      { name: "Cotton Printed Kurta", description: "Breezy cotton kurta with block print and notched neckline.", price: "1899", imageUrl: "https://images.unsplash.com/photo-1598522325074-042db73aa4e6?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Kurtas" },
      { name: "Mirror Work Kurta Set", description: "Festive kurta with mirror work paired with palazzo pants and dupatta.", price: "4499", imageUrl: "https://images.unsplash.com/photo-1598522325074-042db73aa4e6?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Kurta Sets" },
      { name: "Cotton Kurta Pyjama Set", description: "Comfortable cotton kurta and pyjama set with contrast piping.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Kurta Sets" },
      { name: "Bridal Lehenga Choli", description: "Stunning bridal lehenga with heavy embroidery, sequins and dupatta.", price: "14999", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Lehengas" },
      { name: "Flared Party Lehenga", description: "Vibrant flared lehenga with foil print and contrast choli.", price: "6999", imageUrl: "https://images.unsplash.com/photo-1598522325074-042db73aa4e6?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Lehengas" },
      // ===== LADIES - Indian Cord Sets =====
      { name: "Crimson Embroidered Cord Set", description: "Vibrant crimson kurta with delicate floral embroidery, paired with matching palazzo. Perfect for festive occasions.", price: "899", imageUrl: "/products/cordset-01-red-embroidered.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Olive Collared Cord Set", description: "Olive green collared kurta with traditional cream motif border, paired with straight-fit palazzo. Effortless ethnic charm.", price: "899", imageUrl: "/products/cordset-02-olive-collared.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Coral Pink Collared Cord Set", description: "Bright coral pink kurta with collared neckline and intricate cream motif hem, paired with straight palazzo.", price: "899", imageUrl: "/products/cordset-03-coral-collared.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Sage Green Collared Cord Set", description: "Soothing sage green collared kurta with elegant cream embroidery, paired with matching palazzo. A graceful daywear pick.", price: "899", imageUrl: "/products/cordset-04-sage-collared.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Off-White Tassel Kurta Set", description: "Pristine off-white kurta with tassel detailing and contrast border, paired with palazzo and printed dupatta.", price: "899", imageUrl: "/products/cordset-05-offwhite-tassel.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Prisha Pink Floral Kurta Set", description: "Soft pink kurta with delicate floral embroidery, paired with palazzo and matching dupatta. Light, breezy and graceful.", price: "899", imageUrl: "/products/cordset-06-pink-floral.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Mustard Anarkali Cord Set", description: "Statement mustard yellow Anarkali kurta with intricate floral yoke embroidery, paired with palazzo and embroidered dupatta.", price: "899", imageUrl: "/products/cordset-07-mustard-anarkali.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Rust Red Anarkali Cord Set", description: "Rich rust red Anarkali with floral thread work, paired with cigarette pants and embroidered dupatta. Festive and feminine.", price: "899", imageUrl: "/products/cordset-08-rust-anarkali.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Prisha White Floral Shirt Set", description: "Crisp white shirt-style kurta with hand-painted floral motif, paired with breezy palazzo. Modern fusion ethnic wear.", price: "899", imageUrl: "/products/cordset-09-white-floral-shirt.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Prisha Sage Floral Shirt Set", description: "Sage green shirt-style kurta with floral thread embroidery, paired with palazzo. Effortless contemporary ethnic style.", price: "899", imageUrl: "/products/cordset-10-sage-floral-shirt.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      { name: "Prisha Mustard Motif Cord Set", description: "Mustard yellow A-line kurta with traditional ajrakh-inspired motifs, paired with pants and printed dupatta. Heritage meets everyday.", price: "899", imageUrl: "/products/cordset-11-mustard-motif.jpeg", category: "Ladies", subcategory: "Cord Sets" },
      // ===== LADIES - Sleepwear =====
      { name: "Satin Nightdress", description: "Luxurious satin nightdress with lace trim and adjustable straps.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Nightdresses" },
      { name: "Cotton Maxi Nightdress", description: "Breathable cotton maxi nightdress with delicate floral print.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Nightdresses" },
      { name: "Printed Pyjama Set", description: "Cute printed button-down shirt and pyjama set in soft cotton.", price: "1599", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Pyjama Sets" },
      { name: "Satin Pyjama Set", description: "Elegant satin pyjama set with piping detail, smooth and comfortable.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Pyjama Sets" },
      // ===== LADIES - Intimate Wear =====
      { name: "T-Shirt Bra", description: "Seamless padded T-shirt bra with smooth cups for everyday wear.", price: "899", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Bras" },
      { name: "Lace Underwire Bra", description: "Delicate lace underwire bra with adjustable straps and hook closure.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Bras" },
      { name: "Lace Bralette & Brief Set", description: "Matching lace bralette and brief set in soft stretch fabric.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Lingerie Sets" },
      { name: "Satin Cami & Shorts Set", description: "Luxurious satin cami and shorts lingerie set with lace edging.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1564257631407-4deb1f99d992?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Lingerie Sets" },
      // ===== LADIES - Footwear =====
      { name: "Block Heel Pumps", description: "Comfortable block heel pumps in suede with pointed toe.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Heels" },
      { name: "Stiletto Heels", description: "Sleek stiletto heels in patent leather for evening glamour.", price: "4499", imageUrl: "https://images.unsplash.com/photo-1515347619252-60a4bf4fff4f?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Heels" },
      { name: "Embellished Ballet Flats", description: "Elegant ballet flats with jewel embellishment and cushioned insole.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Flats" },
      { name: "Pointed Toe Flats", description: "Chic pointed-toe flats in soft leather, perfect for office to evening.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Flats" },
      { name: "Women's Canvas Sneakers", description: "Clean white canvas sneakers with platform sole for casual styling.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Sneakers" },
      { name: "Strappy Flat Sandals", description: "Elegant strappy sandals in soft leather with cushioned sole.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Sandals" },
      { name: "Wedge Heel Sandals", description: "Comfortable wedge sandals with jute-wrapped heel and ankle strap.", price: "2799", imageUrl: "https://images.unsplash.com/photo-1603487742131-4160ec999306?q=80&w=800&auto=format&fit=crop", category: "Ladies", subcategory: "Sandals" },

      // ===== KIDS - Boys =====
      { name: "Boys Dinosaur Print Tee", description: "Fun dinosaur graphic tee in soft cotton jersey for little explorers.", price: "599", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "T-Shirts" },
      { name: "Boys Striped Polo", description: "Smart striped polo t-shirt in breathable piqué cotton for boys.", price: "799", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "T-Shirts" },
      { name: "Boys Check Shirt", description: "Classic check shirt in soft cotton with button-down collar for boys.", price: "999", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Shirts" },
      { name: "Boys Denim Shirt", description: "Casual denim shirt with snap buttons, cool and comfortable.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Shirts" },
      { name: "Boys Slim Fit Jeans", description: "Stretchy slim-fit jeans for boys with adjustable inner waist.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Jeans" },
      { name: "Cargo Shorts", description: "Durable cotton cargo shorts with adjustable waist and side pockets.", price: "899", imageUrl: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Shorts" },
      { name: "Denim Shorts", description: "Comfortable stretch denim shorts with elastic waistband.", price: "799", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Shorts" },
      { name: "Boys Quilted Jacket", description: "Lightweight quilted jacket with water-repellent finish for boys.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Jackets" },
      { name: "Boys Kurta Pyjama Set", description: "Festive cotton kurta pyjama set with embroidered motifs for boys.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Ethnic Wear" },
      // ===== KIDS - Girls =====
      { name: "Girls Floral Frock", description: "Adorable floral print frock with ruffled hem and bow detail.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Dresses" },
      { name: "Party Tulle Dress", description: "Sparkly tulle party dress with sequin bodice for special occasions.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Dresses" },
      { name: "Girls Peplum Top", description: "Cute peplum top with butterfly print and flutter sleeves for girls.", price: "699", imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Tops" },
      { name: "Girls Embroidered Top", description: "Pretty embroidered cotton top with lace trim and back buttons.", price: "899", imageUrl: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Tops" },
      { name: "Girls Pleated Skirt", description: "Playful pleated skirt with elastic waist in fun polka dot print.", price: "799", imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Skirts" },
      { name: "Girls Denim Skirt", description: "Stretchy denim skirt with heart-shaped pockets for little girls.", price: "899", imageUrl: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Skirts" },
      { name: "Girls Cotton Leggings", description: "Soft stretch cotton leggings with fun printed patterns.", price: "499", imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Leggings" },
      { name: "Girls Windbreaker Jacket", description: "Colourful hooded windbreaker with reflective strips for girls.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Jackets" },
      { name: "Girls Lehenga Choli", description: "Adorable lehenga choli set with mirror work and dupatta.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1598522325074-042db73aa4e6?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Ethnic Wear" },
      // ===== KIDS - Infants =====
      { name: "Cotton Romper", description: "Soft cotton romper with snap buttons for easy changing, gentle on skin.", price: "599", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Rompers" },
      { name: "Printed Dungaree Romper", description: "Adorable printed dungaree romper in organic cotton for babies.", price: "799", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Rompers" },
      { name: "Striped Onesie", description: "Cosy striped onesie with envelope neck and snap leg closure.", price: "499", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Onesies" },
      { name: "Animal Print Onesie", description: "Cute animal print onesie in ultra-soft muslin cotton for newborns.", price: "599", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Onesies" },
      { name: "Infant Gift Set", description: "5-piece infant gift set with onesie, bib, cap, mittens and booties.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sets" },
      { name: "Organic Cotton Baby Set", description: "Three-piece organic cotton set with bodysuit, pants and hat.", price: "999", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sets" },
      { name: "Fleece Sleepsuit", description: "Warm fleece sleepsuit with zip front and non-slip feet for babies.", price: "899", imageUrl: "https://images.unsplash.com/photo-1621454523226-eb4045de3a05?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sleepsuits" },
      { name: "Cotton Sleepsuit Pack", description: "Pack of 2 cotton sleepsuits with fun animal prints and snap buttons.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1519238263530-99abe11d5163?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sleepsuits" },
      // ===== KIDS - Footwear =====
      { name: "Kids Velcro Sneakers", description: "Easy velcro-strap sneakers with cushioned sole for active kids.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sneakers" },
      { name: "Kids Light-Up Sneakers", description: "Fun light-up sole sneakers that flash with every step.", price: "1599", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sneakers" },
      { name: "Kids Sports Sandals", description: "Durable sports sandals with adjustable straps and grippy sole.", price: "899", imageUrl: "https://images.unsplash.com/photo-1603487742131-4160ec999306?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sandals" },
      { name: "Kids Velcro Sandals", description: "Comfortable velcro sandals with soft footbed for everyday wear.", price: "699", imageUrl: "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Sandals" },
      { name: "Boys Black School Shoes", description: "Smart black school shoes in durable synthetic leather.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "School Shoes" },
      { name: "Girls School Shoes", description: "Polished black school shoes with buckle strap for girls.", price: "1399", imageUrl: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "School Shoes" },
      { name: "Soft Sole Baby Booties", description: "Ultra-soft booties with non-slip sole for first walkers.", price: "599", imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Booties" },
      { name: "Knitted Baby Booties", description: "Hand-knitted cotton booties with elastic ankle for snug fit.", price: "499", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop", category: "Kids", subcategory: "Booties" },

      // ===== ACCESSORIES =====
      { name: "Minimalist Chronograph Watch", description: "Sleek stainless steel watch with minimalist dial and leather strap.", price: "7999", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Watches" },
      { name: "Rose Gold Digital Watch", description: "Modern rose gold digital watch with mesh band and date display.", price: "4999", imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Watches" },
      { name: "Leather Tote Bag", description: "Spacious genuine leather tote bag with inner zip pocket.", price: "5499", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Bags" },
      { name: "Canvas Crossbody Bag", description: "Casual canvas crossbody bag with adjustable strap and brass hardware.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Bags" },
      { name: "Braided Canvas Belt", description: "Casual braided canvas belt with leather trim and metal buckle.", price: "799", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Belts" },
      { name: "Cat Eye Sunglasses", description: "Retro cat-eye sunglasses with gradient lenses and acetate frame.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Sunglasses" },
      { name: "Gold Layered Necklace", description: "Delicate gold-plated layered necklace with dainty pendants.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1515562141589-67f0d569b6c6?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Jewellery" },
      { name: "Silver Hoop Earrings", description: "Sterling silver hoop earrings with brushed finish, everyday elegance.", price: "899", imageUrl: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Jewellery" },
      { name: "Hammered Gold Square Stud Earrings", description: "Statement hammered gold-tone square stud earrings with a luxe textured finish. Lightweight and effortlessly elegant.", price: "299", imageUrl: "/products/jewel-01-square-stud.png", category: "Accessories", subcategory: "Jewellery" },
      { name: "Gold Square Stud Earrings (On Model)", description: "Hammered gold-tone square studs styled for everyday luxe. Pairs with both ethnic and western looks.", price: "299", imageUrl: "/products/jewel-02-square-stud-model.png", category: "Accessories", subcategory: "Jewellery" },
      { name: "Twisted Gold Doorknocker Earrings", description: "Bold twisted-rope doorknocker hoops in polished gold tone. A modern take on a classic silhouette.", price: "299", imageUrl: "/products/jewel-03-twisted-hoop.png", category: "Accessories", subcategory: "Jewellery" },
      { name: "Hammered Gold Teardrop Earrings", description: "Sculptural teardrop earrings with intricate hammered detailing. A statement-making everyday piece.", price: "299", imageUrl: "/products/jewel-04-teardrop.png", category: "Accessories", subcategory: "Jewellery" },
      { name: "Gold Teardrop Earrings (On Model)", description: "Hammered gold-tone teardrop earrings styled for an editorial look. Lightweight, polished, versatile.", price: "299", imageUrl: "/products/jewel-05-teardrop-model.png", category: "Accessories", subcategory: "Jewellery" },
      { name: "Cashmere Wool Scarf", description: "Ultra-soft cashmere wool scarf in classic plaid pattern.", price: "3499", imageUrl: "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Scarves" },
      { name: "Silk Print Scarf", description: "Luxurious silk scarf with artistic floral print, versatile styling.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1601924921557-45e8e0e78e68?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Scarves" },

      // ===== FOOTWEAR (standalone category) =====
      { name: "White Canvas Sneakers", description: "Clean white canvas sneakers with cushioned insole and rubber outsole.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Sneakers" },
      { name: "High-Top Sneakers", description: "Bold high-top sneakers in premium leather with contrast stitching.", price: "4499", imageUrl: "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Sneakers" },
      { name: "Oxford Formal Shoes", description: "Classic Oxford shoes in polished leather for formal occasions.", price: "5999", imageUrl: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Formal Shoes" },
      { name: "Leather Slide Sandals", description: "Minimalist leather slide sandals with contoured cork footbed.", price: "1999", imageUrl: "https://images.unsplash.com/photo-1603487742131-4160ec999306?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Sandals" },
      { name: "Strappy Flat Sandals", description: "Elegant strappy sandals in soft leather with cushioned sole.", price: "2299", imageUrl: "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Sandals" },
      { name: "Block Heel Pumps", description: "Comfortable block heel pumps in suede with pointed toe.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Heels" },
      { name: "Chelsea Ankle Boots", description: "Classic Chelsea boots in premium leather with elastic side panel.", price: "5999", imageUrl: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Boots" },
      { name: "Combat Lace-Up Boots", description: "Rugged combat boots with thick sole and sturdy lace-up closure.", price: "4999", imageUrl: "https://images.unsplash.com/photo-1605733160314-4fc7dac4bb16?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Boots" },
      { name: "Suede Tassel Loafers", description: "Refined suede loafers with tassel detail and flexible rubber sole.", price: "4299", imageUrl: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?q=80&w=800&auto=format&fit=crop", category: "Footwear", subcategory: "Loafers" },

      // ===== COSMETICS - Makeup =====
      { name: "Velvet Matte Lipstick — Classic Red", description: "Long-lasting velvet matte finish in bold classic red. Enriched with vitamin E for all-day comfort.", price: "499", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Nude Crème Lipstick", description: "Creamy nude lipstick with satin finish. Hydrating formula perfect for everyday wear.", price: "449", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Berry Lip Gloss", description: "High-shine berry lip gloss with plumping effect. Non-sticky, mirror-like finish.", price: "349", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Liquid Foundation — Natural Beige", description: "Lightweight liquid foundation with medium coverage. Blends seamlessly for a natural, dewy look.", price: "799", imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Foundation" },
      { name: "Full Coverage Foundation — Ivory", description: "Buildable full-coverage foundation with SPF 15. Controls shine for up to 12 hours.", price: "999", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Foundation" },
      { name: "Rose Petal Blush", description: "Silky powder blush in soft rose with micro-shimmer. Buildable colour for a natural flush.", price: "499", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Blush" },
      { name: "Peach Glow Cream Blush", description: "Cream blush stick in warm peach. Blends effortlessly with fingertips or a beauty blender.", price: "549", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Blush" },
      { name: "Smokey Eyeshadow Palette — 12 Shades", description: "Professional 12-shade eyeshadow palette with mattes, shimmers, and metallics for smokey eye looks.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1583241800698-e8ab01b0b08e?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Eyeshadow" },
      { name: "Nude Eyeshadow Palette — 8 Shades", description: "Everyday nude palette with 8 curated shades. Buttery soft texture with high pigmentation.", price: "899", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Eyeshadow" },
      { name: "Intense Black Kajal", description: "24-hour smudge-proof kajal pencil in intense black. Ophthalmologist-tested, safe for sensitive eyes.", price: "249", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Kajal" },
      { name: "Waterproof Kajal Stick", description: "Twist-up waterproof kajal with creamy glide. Lasts through sweat, humidity, and tears.", price: "299", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Kajal" },
      { name: "Volumising Mascara", description: "Dramatic volumising mascara with curved brush for lifted, separated lashes. Clump-free formula.", price: "599", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Mascara" },
      { name: "Gel Nail Polish — Ruby", description: "Chip-resistant gel nail polish in deep ruby. Salon-quality shine, no UV lamp needed.", price: "199", imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Nail Polish" },
      { name: "Pastel Nail Polish Set — 4 Pack", description: "Set of 4 pastel gel polishes in lavender, mint, blush, and baby blue. Quick-dry formula.", price: "599", imageUrl: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Nail Polish" },
      { name: "Complete Makeup Kit — Bridal", description: "All-in-one bridal makeup kit with foundation, blush, lipstick set, eyeshadow palette, mascara, and brushes.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Makeup Kit" },
      // ===== COSMETICS - Care =====
      { name: "Vitamin C Brightening Serum", description: "Powerful 20% vitamin C serum with hyaluronic acid. Brightens, hydrates, and reduces dark spots.", price: "899", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Skin Care" },
      { name: "SPF 50 Sunscreen — Matte Finish", description: "Lightweight SPF 50 sunscreen with matte finish. No white cast, ideal under makeup.", price: "549", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Skin Care" },
      { name: "Keratin Hair Serum", description: "Anti-frizz keratin hair serum for smooth, shiny, manageable hair. Heat-protectant up to 230°C.", price: "649", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Hair Care" },
      { name: "Argan Oil Hair Mask", description: "Deep-conditioning argan oil hair mask for dry, damaged hair. Restores moisture and shine in 10 minutes.", price: "499", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Hair Care" },
      { name: "Floral Eau de Parfum — 50ml", description: "Elegant floral perfume with top notes of jasmine and rose, base of sandalwood. Long-lasting 8-hour wear.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Fragrance" },
      { name: "Oud & Musk Perfume — 30ml", description: "Rich unisex fragrance blending warm oud with white musk. Travel-size 30ml spray.", price: "999", imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Fragrance" },
    ];

    for (const p of seedData) {
      const sizes = getSizesForProduct(p.category, p.subcategory);
      await storage.createProduct({ ...p, sizes });
    }
    console.log(`Database seeded with ${seedData.length} products`);

    await seedStoresAndInventory();
    await seedAdminUser();
    await seedSummerCampaign();
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

async function seedSummerCampaign() {
  try {
    const existing = await storage.getCampaignBySlug("summer-2026");
    if (existing) return;
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
    const payload: InsertCampaign = {
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
      startDate: now,
      endDate: end,
      isActive: true,
    };
    await storage.createCampaign(payload);
    console.log("Seeded default Summer '26 campaign");
  } catch (e) {
    console.error("Failed to seed summer campaign:", e);
  }
}

async function seedAdminUser() {
  const adminMobile = process.env.ADMIN_MOBILE;
  const adminPin = process.env.ADMIN_PIN;

  if (!adminMobile || !adminPin) {
    console.warn("⚠️  ADMIN_MOBILE / ADMIN_PIN env vars not set — skipping admin seed. Set them in your .env to create the admin account.");
    return;
  }

  const existing = await storage.getUserByMobile(adminMobile);
  if (existing) return;

  const hashedPin = await bcrypt.hash(adminPin, 10);
  await storage.createUser({
    name: "Admin",
    mobile: adminMobile,
    email: process.env.ADMIN_EMAIL || "admin@accenza.in",
    pin: hashedPin,
    birthday: "1990-01-01",
    role: "admin",
  });
  console.log(`Admin user seeded (mobile: ${adminMobile})`);
}

async function seedStoresAndInventory() {
  const existingStores = await storage.getStores();
  if (existingStores.length > 0) return;

  const storeData = [
    { name: "ACCENZA Mumbai Central", city: "Mumbai", state: "Maharashtra", pincode: "400008", address: "Ground Floor, Phoenix Mills, Lower Parel", phone: "022-24001234", isActive: true, latitude: "19.0073", longitude: "72.8311" },
    { name: "ACCENZA Delhi CP", city: "New Delhi", state: "Delhi", pincode: "110001", address: "N Block, Connaught Place", phone: "011-23451234", isActive: true, latitude: "28.6315", longitude: "77.2167" },
    { name: "ACCENZA Bangalore Indiranagar", city: "Bangalore", state: "Karnataka", pincode: "560038", address: "100 Feet Road, Indiranagar", phone: "080-25671234", isActive: true, latitude: "12.9784", longitude: "77.6408" },
    { name: "ACCENZA Chennai T Nagar", city: "Chennai", state: "Tamil Nadu", pincode: "600017", address: "Usman Road, T Nagar", phone: "044-24341234", isActive: true, latitude: "13.0418", longitude: "80.2341" },
    { name: "ACCENZA Kolkata Park Street", city: "Kolkata", state: "West Bengal", pincode: "700016", address: "22 Park Street", phone: "033-22291234", isActive: true, latitude: "22.5526", longitude: "88.3520" },
    { name: "ACCENZA Hyderabad Banjara Hills", city: "Hyderabad", state: "Telangana", pincode: "500034", address: "Road No. 2, Banjara Hills", phone: "040-23551234", isActive: true, latitude: "17.4156", longitude: "78.4347" },
    { name: "ACCENZA Pune FC Road", city: "Pune", state: "Maharashtra", pincode: "411004", address: "Fergusson College Road", phone: "020-25671234", isActive: true, latitude: "18.5247", longitude: "73.8409" },
    { name: "ACCENZA Ahmedabad SG Highway", city: "Ahmedabad", state: "Gujarat", pincode: "380054", address: "SG Highway, Bodakdev", phone: "079-26851234", isActive: true, latitude: "23.0395", longitude: "72.5112" },
    { name: "ACCENZA Jaipur MI Road", city: "Jaipur", state: "Rajasthan", pincode: "302001", address: "MI Road, C-Scheme", phone: "0141-2371234", isActive: true, latitude: "26.9124", longitude: "75.7873" },
    { name: "ACCENZA Lucknow Hazratganj", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001", address: "Hazratganj Main Road", phone: "0522-2201234", isActive: true, latitude: "26.8512", longitude: "80.9462" },
  ];

  const createdStores = [];
  for (const s of storeData) {
    const store = await storage.createStore(s);
    createdStores.push(store);
  }
  console.log(`Seeded ${createdStores.length} stores`);

  const allProducts = await storage.getProducts();
  let invCount = 0;
  for (const product of allProducts) {
    const numStores = 3 + Math.floor(Math.random() * 5);
    const shuffledStores = [...createdStores].sort(() => Math.random() - 0.5).slice(0, numStores);
    for (const store of shuffledStores) {
      const qty = 5 + Math.floor(Math.random() * 46);
      await storage.upsertInventory({
        productId: product.id,
        storeId: store.id,
        quantity: qty,
        reservedQty: 0,
      });
      invCount++;
    }
  }
  console.log(`Seeded ${invCount} inventory records`);
}
