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

// Clean up expired entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 30 * 60 * 1000);

// 5 OTP send requests per IP per 15 minutes
const otpSendLimiter = createRateLimiter(5, 15 * 60 * 1000);
// 10 OTP verify attempts per IP per 15 minutes
const otpVerifyLimiter = createRateLimiter(10, 15 * 60 * 1000);
// ---------------------------------------------------------------------------

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function saveOtp(mobile: string, otp: string, type: string) {
  await db.delete(otpVerifications).where(and(eq(otpVerifications.mobile, mobile), eq(otpVerifications.type, type)));
  await db.insert(otpVerifications).values({
    mobile, otp, type, verified: false,
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
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { mobile } = parsed.data;

      const existing = await storage.getUserByMobile(mobile);
      if (existing) return res.status(409).json({ message: "An account with this mobile number already exists" });

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
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { mobile, otp } = parsed.data;

      const stored = await getOtp(mobile, "registration");
      if (!stored) return res.status(400).json({ message: "OTP expired or not requested. Please request a new one." });
      if (stored.expiresAt < new Date()) {
        await deleteOtp(mobile, "registration");
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }
      if (stored.otp !== otp) return res.status(401).json({ message: "Invalid OTP. Please try again." });

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
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { name, mobile, email, pin, birthday } = parsed.data;

      const storedOtp = await getOtp(mobile, "registration");
      if (!storedOtp || !storedOtp.verified) return res.status(400).json({ message: "Mobile number not verified. Please verify with OTP first." });
      if (storedOtp.expiresAt < new Date()) {
        await deleteOtp(mobile, "registration");
        return res.status(400).json({ message: "Verification expired. Please start the registration again." });
      }
      await deleteOtp(mobile, "registration");

      const existing = await storage.getUserByMobile(mobile);
      if (existing) return res.status(409).json({ message: "An account with this mobile number already exists" });

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
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { mobile } = parsed.data;

      const user = await storage.getUserByMobile(mobile);
      if (!user) return res.status(404).json({ message: "No account found with this mobile number" });

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
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { mobile, otp } = parsed.data;

      const stored = await getOtp(mobile, "login");
      if (!stored) return res.status(400).json({ message: "OTP expired or not requested. Please request a new one." });
      if (stored.expiresAt < new Date()) {
        await deleteOtp(mobile, "login");
        return res.status(400).json({ message: "OTP has expired. Please request a new one." });
      }
      if (stored.otp !== otp) return res.status(401).json({ message: "Invalid OTP. Please try again." });

      await deleteOtp(mobile, "login");
      const user = await storage.getUserByMobile(mobile);
      if (!user) return res.status(404).json({ message: "User not found" });

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
  // WhatsApp AI Beauty & Style Advisor
  // ---------------------------------------------------------------------------
  app.post("/api/webhooks/whatsapp", async (req, res) => {
    res.set("Content-Type", "text/xml");
    try {
      const { Body: messageBody, From: from } = req.body;
      if (!messageBody || !from) return res.send("<Response></Response>");

      const mobile = from.replace("whatsapp:+91", "").replace("whatsapp:+", "");
      const userMessage = messageBody.trim();

      console.log(`[AI Stylist] Message from +91${mobile}: ${userMessage.substring(0, 100)}`);

      await storage.addStylistMessage({ mobile, role: "user", message: userMessage, productIds: null });

      let reply: string;
      let productIds: number[] = [];

      if (isAIStylistConfigured()) {
        const history = await storage.getStylistConversation(mobile);
        const products = await storage.getProducts();
        const result = await processStylistMessage(mobile, userMessage, history, products);
        reply = result.reply;
        productIds = result.productIds;
      } else {
        reply = getDemoResponse(userMessage);
      }

      await storage.addStylistMessage({
        mobile, role: "assistant", message: reply,
        productIds: productIds.length > 0 ? productIds.join(",") : null,
      });

      await sendWhatsApp(mobile, reply);
      console.log(`[AI Stylist] Replied to +91${mobile} (${productIds.length} products recommended)`);
      res.send("<Response></Response>");
    } catch (error) {
      console.error("[AI Stylist] Webhook error:", error);
      res.send("<Response></Response>");
    }
  });

  app.get("/api/admin/stylist/stats", requireAdmin, async (_req, res) => {
    const stats = await storage.getStylistStats();
    res.json(stats);
  });

  app.get("/api/admin/stylist/conversations", requireAdmin, async (_req, res) => {
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
      const hasJewellery = existingProducts.some(p => p.category === "Jewellery");
      const hasHandbags = existingProducts.some(p => p.category === "Handbags");
      if (hasJewellery && hasHandbags) {
        await seedStoresAndInventory();
        await seedAdminUser();
        await seedSummerCampaign();
        return;
      }
      await storage.deleteAllProducts();
    }

    const seedData = [
      // ===== JEWELLERY - Earrings =====
      { name: "Gold Plated Chandbali Earrings", description: "Intricate gold plated chandbali earrings with pearl drops and meenakari work. Perfect for festive occasions.", price: "799", imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Chandbalis" },
      { name: "Silver Jhumka Earrings", description: "Classic silver jhumka earrings with intricate filigree work and small pearl drops. A timeless Indian design.", price: "599", imageUrl: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Jhumkas" },
      { name: "Rose Gold Hoop Earrings", description: "Minimalist rose gold hoop earrings in sterling silver with 18k rose gold plating. Lightweight and elegant.", price: "499", imageUrl: "https://images.unsplash.com/photo-1603561596112-0a132b757442?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Hoops" },
      { name: "Kundan Dangler Earrings", description: "Handcrafted kundan dangler earrings with coloured stone inserts and gold plating. Ideal for weddings and parties.", price: "999", imageUrl: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Danglers" },
      { name: "Diamond Cut Stud Earrings", description: "Elegant diamond-cut cubic zirconia stud earrings in white gold plating. Timeless and versatile.", price: "449", imageUrl: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Studs" },
      { name: "Oxidised Silver Jhumka", description: "Antique oxidised silver finish jhumka earrings with tribal motifs. Bohemian-ethnic style.", price: "399", imageUrl: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Jhumkas" },
      { name: "Pearl Drop Earrings", description: "Delicate freshwater pearl drop earrings with gold plated hook. Soft, feminine and effortlessly elegant.", price: "649", imageUrl: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Danglers" },
      { name: "Meenakari Chandbali Set", description: "Vibrant meenakari chandbali earrings with traditional peacock motif in blue and green enamel work.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Chandbalis" },
      // ===== JEWELLERY - Necklaces =====
      { name: "Gold Plated Temple Necklace", description: "Traditional temple jewellery necklace with lakshmi coin pendants and ruby coloured stones. South Indian design.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Necklaces" },
      { name: "Layered Beads Necklace", description: "Multi-strand layered necklace with crystal beads and gold plated spacers. Modern boho-chic style.", price: "699", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Layered Sets" },
      { name: "Kundan Choker Necklace", description: "Regal kundan choker with emerald green stones and intricate gold meenakari backing. Bridal-inspired design.", price: "1899", imageUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Chokers" },
      { name: "Black Thread Mangalsutra", description: "Traditional black beads mangalsutra with gold plated pendant. Lightweight and wearable every day.", price: "899", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Mangalsutra" },
      { name: "Pearl Strand Necklace", description: "Classic single-strand freshwater pearl necklace with sterling silver clasp. Timeless elegance for every occasion.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Necklaces" },
      // ===== JEWELLERY - Bangles & Bracelets =====
      { name: "Glass Bangle Set — 12 Pcs", description: "Vibrant glass bangle set in assorted festive colours. Sold as a set of 12 for the perfect stack.", price: "299", imageUrl: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Bangles" },
      { name: "Gold Plated Kada Bangle", description: "Broad gold plated kada with floral embossed design. A statement piece for ethnic occasions.", price: "799", imageUrl: "https://images.unsplash.com/photo-1603561596112-0a132b757442?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Kada" },
      { name: "Charm Bracelet — Rose Gold", description: "Dainty rose gold charm bracelet with celestial charms — star, moon, and heart. Adjustable chain.", price: "549", imageUrl: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Bracelets" },
      { name: "Oxidised Bangle Set — 6 Pcs", description: "Antique oxidised silver bangle set with tribal patterns. Traditional craft meets contemporary styling.", price: "499", imageUrl: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Bangles" },
      // ===== JEWELLERY - Rings =====
      { name: "Adjustable Floral Ring", description: "Delicate adjustable ring with floral motif in gold plating. One size fits most — free size.", price: "299", imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Rings" },
      { name: "Kundan Statement Ring", description: "Bold kundan cocktail ring with multi-colour stones in gold base. Eye-catching party wear.", price: "549", imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Rings" },
      // ===== JEWELLERY - Sets =====
      { name: "Bridal Jewellery Set — Red & Gold", description: "Complete bridal set with necklace, earrings, maang tikka and passa. Kundan work with red stones.", price: "3999", imageUrl: "https://images.unsplash.com/photo-1619451334792-150fd785ee74?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Jewellery Sets" },
      { name: "Everyday Pearl Jewellery Set", description: "Classic pearl necklace and earring set in freshwater pearls with gold plated findings.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Jewellery Sets" },
      { name: "Maang Tikka — Gold & Pearl", description: "Traditional maang tikka with gold plated chain and freshwater pearl centrepiece. Bridal and festive wear.", price: "699", imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Maang Tikka" },
      { name: "Anklet Set — Silver Payal", description: "Pair of sterling silver anklets with tiny ghungroo bells. Traditional design, adjustable chain.", price: "399", imageUrl: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Anklets" },
      { name: "Nose Pin — Gold Plated", description: "Delicate L-shaped nose pin in gold plating with a single cubic zirconia stone.", price: "199", imageUrl: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?q=80&w=800&auto=format&fit=crop", category: "Jewellery", subcategory: "Nose Pins" },
      // ===== COSMETICS - Lip =====
      { name: "Velvet Matte Lipstick — Classic Red", description: "Long-lasting velvet matte finish in bold classic red. Enriched with vitamin E for all-day comfort.", price: "499", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Nude Crème Lipstick", description: "Creamy nude lipstick with satin finish. Hydrating formula perfect for everyday wear.", price: "449", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Berry Lip Gloss", description: "High-shine berry lip gloss with plumping effect. Non-sticky, mirror-like finish.", price: "349", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      { name: "Pink Nude Liquid Lip Colour", description: "Liquid lip colour in dusty pink nude. Transfer-proof, long-wear formula. Comfortable all day.", price: "399", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Lip Colour" },
      // ===== COSMETICS - Face =====
      { name: "Liquid Foundation — Natural Beige", description: "Lightweight liquid foundation with medium coverage. Blends seamlessly for a natural, dewy look.", price: "799", imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Foundation" },
      { name: "Full Coverage Foundation — Ivory", description: "Buildable full-coverage foundation with SPF 15. Controls shine for up to 12 hours.", price: "999", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Foundation" },
      { name: "Rose Petal Blush", description: "Silky powder blush in soft rose with micro-shimmer. Buildable colour for a natural flush.", price: "499", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Blush" },
      { name: "Peach Glow Cream Blush", description: "Cream blush stick in warm peach. Blends effortlessly with fingertips or a beauty blender.", price: "549", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Blush" },
      // ===== COSMETICS - Eyes =====
      { name: "Smokey Eyeshadow Palette — 12 Shades", description: "Professional 12-shade eyeshadow palette with mattes, shimmers, and metallics for smokey eye looks.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1583241800698-e8ab01b0b08e?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Eyeshadow" },
      { name: "Nude Eyeshadow Palette — 8 Shades", description: "Everyday nude palette with 8 curated shades. Buttery soft texture with high pigmentation.", price: "899", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Eyeshadow" },
      { name: "Intense Black Kajal", description: "24-hour smudge-proof kajal pencil in intense black. Ophthalmologist-tested, safe for sensitive eyes.", price: "249", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Kajal" },
      { name: "Waterproof Kajal Stick", description: "Twist-up waterproof kajal with creamy glide. Lasts through sweat, humidity, and tears.", price: "299", imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Kajal" },
      { name: "Volumising Mascara", description: "Dramatic volumising mascara with curved brush for lifted, separated lashes. Clump-free formula.", price: "599", imageUrl: "https://images.unsplash.com/photo-1631214500115-598fc2cb8ada?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Mascara" },
      // ===== COSMETICS - Skincare =====
      { name: "Vitamin C Face Serum — 30ml", description: "Brightening vitamin C serum with 10% ascorbic acid and hyaluronic acid. Fades dark spots, boosts glow.", price: "899", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Serums" },
      { name: "Niacinamide 10% Serum — 30ml", description: "Oil-control niacinamide serum that minimises pores and reduces blemishes. Suitable for all skin types.", price: "799", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Serums" },
      { name: "Rose Water Toner — 100ml", description: "Pure rose water toner that balances pH, hydrates, and preps skin for moisturiser. Alcohol-free.", price: "299", imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Toner" },
      { name: "SPF 50 Sunscreen — 50ml", description: "Lightweight SPF 50 PA++++ sunscreen with no white cast. Non-greasy, mattifying finish.", price: "499", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Sunscreen" },
      { name: "Hyaluronic Acid Moisturiser", description: "Lightweight gel moisturiser with 3 types of hyaluronic acid for 72-hour hydration. Plumps and softens skin.", price: "649", imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Moisturiser" },
      { name: "Charcoal Face Wash — 100ml", description: "Deep-cleansing activated charcoal face wash that draws out impurities and excess oil. Gentle foam.", price: "349", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Face Wash" },
      // ===== COSMETICS - Fragrance =====
      { name: "Floral Eau de Parfum — 50ml", description: "Elegant floral perfume with top notes of jasmine and rose, base of sandalwood. Long-lasting 8-hour wear.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Fragrance" },
      { name: "Oud & Musk Perfume — 30ml", description: "Rich unisex fragrance blending warm oud with white musk. Travel-size 30ml spray.", price: "999", imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop", category: "Cosmetics", subcategory: "Fragrance" },
      // ===== HANDBAGS - Casual =====
      { name: "Canvas Tote Bag — Olive", description: "Sturdy canvas tote bag with inner zip pocket and cotton lining. Large enough for a laptop and daily essentials.", price: "999", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Tote Bags" },
      { name: "Woven Straw Tote Bag", description: "Handwoven straw tote with faux leather handles and cotton lining. Summer-perfect, roomy design.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Tote Bags" },
      { name: "Mini Sling Bag — Black", description: "Compact faux leather sling bag with adjustable strap and front zip pocket. Perfect for light outings.", price: "799", imageUrl: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Sling Bags" },
      { name: "Crescent Sling Bag — Tan", description: "Trendy crescent-shaped sling bag in tan vegan leather with long chain strap. Minimalist and chic.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1591561954557-26941169b49e?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Sling Bags" },
      { name: "Quilted Crossbody Bag", description: "Classic quilted crossbody bag in black with gold chain strap. Compact yet functional with 3 compartments.", price: "1499", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Sling Bags" },
      // ===== HANDBAGS - Party & Ethnic =====
      { name: "Embroidered Potli Bag — Red", description: "Traditional potli bag with zari embroidery and gold drawstring. Perfect for weddings and festive events.", price: "699", imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Potli Bags" },
      { name: "Velvet Potli Bag — Emerald", description: "Rich emerald velvet potli bag with gold zardozi embroidery and tassels. Bridal and party essential.", price: "899", imageUrl: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Potli Bags" },
      { name: "Beaded Evening Clutch", description: "Hand-beaded evening clutch with magnetic clasp and detachable chain. Statement piece for parties.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Clutches" },
      { name: "Metallic Gold Clutch", description: "Sleek metallic gold clutch with fold-over flap and magnetic closure. Minimalist evening style.", price: "999", imageUrl: "https://images.unsplash.com/photo-1591561954557-26941169b49e?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Clutches" },
      // ===== HANDBAGS - Everyday =====
      { name: "Structured Work Bag — Tan", description: "Professional structured bag in faux leather with laptop compartment. Top handles and detachable shoulder strap.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Tote Bags" },
      { name: "Mini Backpack — Blush Pink", description: "Cute mini backpack in blush pink vegan leather with gold hardware. Fits essentials and more.", price: "1799", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Backpacks" },
      { name: "Woven Bamboo Clutch", description: "Artisanal bamboo handle clutch with woven body. Eco-friendly, lightweight, summer-ready.", price: "1099", imageUrl: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=800&auto=format&fit=crop", category: "Handbags", subcategory: "Clutches" },
      // ===== ACCESSORIES - Hair =====
      { name: "Pearl Hair Pin Set — 6 Pcs", description: "Set of 6 pearl-topped hair pins in gold and silver. Perfect for updos, braids, and boho hairstyles.", price: "299", imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Hair Accessories" },
      { name: "Floral Fabric Headband", description: "Padded floral fabric headband with knotted bow detail. Adds colour and texture to any look.", price: "249", imageUrl: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Hair Accessories" },
      { name: "Scrunchie Set — 5 Pcs", description: "Pack of 5 satin scrunchies in jewel tones. Gentle on hair, luxe feel, no crease.", price: "349", imageUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Hair Accessories" },
      // ===== ACCESSORIES - Scarves =====
      { name: "Silk Scarf — Floral Print", description: "Lightweight silk-blend scarf with vibrant floral print. Wear as a headscarf, neck tie, or bag accessory.", price: "799", imageUrl: "https://images.unsplash.com/photo-1601924638867-3a6de6b7a500?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Scarves" },
      { name: "Pashmina Stole — Ivory", description: "Soft pashmina stole in ivory with delicate embroidered border. Wrap, drape or style as a dupatta.", price: "1299", imageUrl: "https://images.unsplash.com/photo-1601924638867-3a6de6b7a500?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Scarves" },
      // ===== ACCESSORIES - Eyewear =====
      { name: "Cat Eye Sunglasses — Black", description: "Classic cat-eye frame sunglasses in glossy black with UV400 polarised lenses. Timeless glamour.", price: "999", imageUrl: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Sunglasses" },
      { name: "Round Retro Sunglasses — Tortoise", description: "Retro round frame sunglasses in tortoise shell pattern with gradient brown lenses. Boho chic.", price: "799", imageUrl: "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Sunglasses" },
      { name: "Oversized Square Sunglasses", description: "Bold oversized square sunglasses in matte black with mirrored silver lenses. Maximum style impact.", price: "1199", imageUrl: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Sunglasses" },
      // ===== ACCESSORIES - Wrist & Head =====
      { name: "Rose Gold Bracelet Watch", description: "Elegant bracelet-style watch in rose gold with mesh strap and minimalist dial. Water-resistant.", price: "2499", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Watches" },
      { name: "Embroidered Belt — Ivory", description: "Handcrafted ivory embroidered belt with floral thread work. Cinch over kurtas, dresses, or blazers.", price: "599", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Belts" },
      { name: "Embellished Hairband", description: "Embellished stretch hairband with crystal and pearl clusters. Doubles as a bracelet.", price: "449", imageUrl: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=800&auto=format&fit=crop", category: "Accessories", subcategory: "Hair Accessories" },
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
  const adminPin = process.env.ADMIN_PIN;

  // Fixed admin mobiles + optional extra from env
  const adminMobiles = [
    { mobile: "9377637787", name: "Admin" },
    { mobile: "7778988998", name: "Admin 2" },
    ...(process.env.ADMIN_MOBILE && !["9377637787", "7778988998"].includes(process.env.ADMIN_MOBILE)
      ? [{ mobile: process.env.ADMIN_MOBILE, name: "Admin" }]
      : []),
  ];

  if (!adminPin) {
    console.warn("⚠️  ADMIN_PIN env var not set — skipping admin seed.");
    return;
  }

  const hashedPin = await bcrypt.hash(adminPin, 10);

  for (const { mobile, name } of adminMobiles) {
    const existing = await storage.getUserByMobile(mobile);
    if (existing) continue;
    await storage.createUser({
      name,
      mobile,
      email: process.env.ADMIN_EMAIL || "admin@accenza.in",
      pin: hashedPin,
      birthday: "1990-01-01",
      role: "admin",
    });
    console.log(`Admin user seeded (mobile: ${mobile})`);
  }
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
