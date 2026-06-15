import { pgTable, text, serial, numeric, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price").notNull(),
  costPrice: numeric("cost_price").notNull().default("0"),
  imageUrl: text("image_url").notNull(),
  imageUrl2: text("image_url2").notNull().default(""),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull().default(""),
  sizes: text("sizes").array().default([]),
  barcode: text("barcode").unique(),
});

export const SIZE_CHART: Record<string, Record<string, string[]>> = {
  Jewellery: {
    default: ["Free Size"],
    Rings: ["US 5", "US 6", "US 7", "US 8", "US 9", "US 10"],
    Bangles: ["2.2", "2.4", "2.6", "2.8"],
    Bracelets: ["Free Size", "S", "M", "L"],
    Necklaces: ["Free Size"],
    Earrings: ["Free Size"],
    "Nose Pins": ["Free Size"],
    "Anklets": ["Free Size"],
    "Maang Tikka": ["Free Size"],
    "Jewellery Sets": ["Free Size"],
  },
  Cosmetics: {
    default: ["Free Size"],
    "Lip Colour": ["Free Size"],
    Foundation: ["Free Size"],
    Blush: ["Free Size"],
    Eyeshadow: ["Free Size"],
    Kajal: ["Free Size"],
    Mascara: ["Free Size"],
    "Nail Polish": ["Free Size"],
    "Skin Care": ["Free Size"],
    "Hair Care": ["Free Size"],
    Fragrance: ["Free Size"],
    "Makeup Kit": ["Free Size"],
    Concealer: ["Free Size"],
    Highlighter: ["Free Size"],
    Primer: ["Free Size"],
  },
  Handbags: {
    default: ["Free Size"],
    "Tote Bags": ["Free Size"],
    "Clutches": ["Free Size"],
    "Sling Bags": ["Free Size"],
    "Backpacks": ["Free Size"],
    "Shoulder Bags": ["Free Size"],
    "Mini Bags": ["Free Size"],
    "Potli Bags": ["Free Size"],
    "Wallets": ["Free Size"],
    "Wristlets": ["Free Size"],
  },
  Accessories: {
    default: ["Free Size"],
    Scarves: ["Free Size"],
    Sunglasses: ["Free Size"],
    Watches: ["Free Size"],
    Hairbands: ["Free Size"],
    "Hair Clips": ["Free Size"],
    Belts: ["XS", "S", "M", "L", "XL"],
    Caps: ["Free Size", "S", "M", "L"],
    "Stoles": ["Free Size"],
  },
};

export function getSizesForProduct(category: string, subcategory: string): string[] {
  const catSizes = SIZE_CHART[category];
  if (!catSizes) return ["Free Size"];
  return catSizes[subcategory] || catSizes.default || ["Free Size"];
}

export const insertProductSchema = createInsertSchema(products).omit({ id: true, barcode: true });

export function generateEAN13Barcode(productId: number): string {
  const prefix = "890";
  const company = "0001";
  const productPart = String(productId).padStart(5, "0");
  const partial = prefix + company + productPart;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(partial[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return partial + String(checkDigit);
}

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mobile: text("mobile").notNull().unique(),
  email: text("email").notNull(),
  pin: text("pin").notNull(),
  birthday: text("birthday").notNull(),
  role: text("role").notNull().default("customer"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  eyebrow: text("eyebrow").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default("Shop Now"),
  ctaLink: text("cta_link").notNull().default("/"),
  heroImageUrl: text("hero_image_url").notNull().default(""),
  promoCode: text("promo_code").notNull(),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: numeric("discount_value").notNull().default("10"),
  minOrder: numeric("min_order").notNull().default("0"),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
});

export const insertCampaignSchema = createInsertSchema(campaigns)
  .omit({ id: true })
  .extend({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    discountValue: z.union([z.string(), z.number()]).transform((v) => String(v)),
    minOrder: z.union([z.string(), z.number()]).transform((v) => String(v)),
  });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export const DISCOUNT_TYPES = ["percent", "flat", "shipping"] as const;
export type DiscountType = typeof DISCOUNT_TYPES[number];

export const supportRequests = pgTable("support_requests", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull(),
  mobile: text("mobile").notNull(),
  type: text("type").notNull(),
  orderNumber: text("order_number").notNull(),
  itemDescription: text("item_description").notNull(),
  reason: text("reason").notNull(),
  extraDetails: text("extra_details").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupportRequestSchema = createInsertSchema(supportRequests).omit({ id: true, createdAt: true });
export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
export type SupportRequest = typeof supportRequests.$inferSelect;

export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  mobile: text("mobile").notNull(),
  otp: text("otp").notNull(),
  type: text("type").notNull(),
  verified: boolean("verified").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
});

export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const stylistConversations = pgTable("stylist_conversations", {
  id: serial("id").primaryKey(),
  mobile: text("mobile").notNull(),
  role: text("role").notNull(),
  message: text("message").notNull(),
  productIds: text("product_ids"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStylistConversationSchema = createInsertSchema(stylistConversations).omit({ id: true, createdAt: true });
export type InsertStylistConversation = z.infer<typeof insertStylistConversationSchema>;
export type StylistConversation = typeof stylistConversations.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
});

export const insertStoreSchema = createInsertSchema(stores).omit({ id: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof stores.$inferSelect;

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  storeId: integer("store_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  reservedQty: integer("reserved_qty").notNull().default(0),
});

export const insertInventorySchema = createInsertSchema(inventory).omit({ id: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventory.$inferSelect;

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderNumber: text("order_number").notNull().unique(),
  status: text("status").notNull().default("placed"),
  totalAmount: numeric("total_amount").notNull(),
  shippingName: text("shipping_name").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingPincode: text("shipping_pincode").notNull(),
  shippingPhone: text("shipping_phone").notNull(),
  paymentMethod: text("payment_method").notNull(),
  promoCode: text("promo_code"),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  invoiceNumber: text("invoice_number"),
  gstAmount: numeric("gst_amount").notNull().default("0"),
  fulfilledFromStoreId: integer("fulfilled_from_store_id"),
  shiprocketOrderId: text("shiprocket_order_id"),
  shiprocketShipmentId: text("shiprocket_shipment_id"),
  awbNumber: text("awb_number"),
  courierName: text("courier_name"),
  trackingUrl: text("tracking_url"),
  logisticsCost: numeric("logistics_cost").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  storeId: integer("store_id"),
  quantity: integer("quantity").notNull(),
  price: numeric("price").notNull(),
  costPrice: numeric("cost_price").notNull().default("0"),
  size: text("size"),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export const ORDER_STATUSES = ["placed", "confirmed", "processing", "ready_to_ship", "shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", "returned", "rto"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email address"),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  confirmPin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  birthday: z.string().min(1, "Birthday is required"),
}).refine((data) => data.pin === data.confirmPin, {
  message: "PINs do not match",
  path: ["confirmPin"],
});

export const loginSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export interface SubcategorySection {
  section: string;
  items: string[];
}

export type SubcategoryConfig = string[] | SubcategorySection[];

export const SUBCATEGORIES: Record<string, SubcategoryConfig> = {
  Jewellery: [
    { section: "Earrings", items: ["Studs", "Danglers", "Hoops", "Chandbalis", "Jhumkas"] },
    { section: "Necklaces", items: ["Necklaces", "Chokers", "Layered Sets", "Mangalsutra"] },
    { section: "Bangles & Bracelets", items: ["Bangles", "Bracelets", "Kada"] },
    { section: "Rings", items: ["Rings", "Thumb Rings", "Midi Rings"] },
    { section: "Sets & Others", items: ["Jewellery Sets", "Maang Tikka", "Nose Pins", "Anklets", "Brooches"] },
  ],
  Cosmetics: [
    { section: "Face", items: ["Foundation", "Concealer", "Blush", "Highlighter", "Primer", "Makeup Kit"] },
    { section: "Eyes", items: ["Eyeshadow", "Kajal", "Mascara", "Eyeliner"] },
    { section: "Lips", items: ["Lip Colour", "Lip Gloss", "Lip Liner"] },
    { section: "Nails", items: ["Nail Polish", "Nail Art"] },
    { section: "Care", items: ["Skin Care", "Hair Care", "Fragrance", "Body Care"] },
  ],
  Handbags: [
    { section: "Casual", items: ["Tote Bags", "Shoulder Bags", "Sling Bags", "Backpacks"] },
    { section: "Party & Ethnic", items: ["Clutches", "Potli Bags", "Wristlets", "Mini Bags"] },
    { section: "Everyday", items: ["Wallets", "Crossbody Bags", "Work Bags"] },
  ],
  Accessories: [
    { section: "Hair", items: ["Hairbands", "Hair Clips", "Hair Pins", "Scrunchies"] },
    { section: "Neck & Waist", items: ["Scarves", "Stoles", "Belts"] },
    { section: "Eyewear", items: ["Sunglasses"] },
    { section: "Wrist & Head", items: ["Watches", "Caps", "Hats"] },
  ],
};

export function isGroupedSubcategories(config: SubcategoryConfig): config is SubcategorySection[] {
  return config.length > 0 && typeof config[0] === "object";
}

export function getAllSubcategories(config: SubcategoryConfig): string[] {
  if (isGroupedSubcategories(config)) {
    return config.flatMap((g) => g.items);
  }
  return config as string[];
}

export const categories = pgTable("admin_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subcategories: text("subcategories").array().notNull().default([]),
});
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
