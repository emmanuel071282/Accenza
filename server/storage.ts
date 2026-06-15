import { db } from "./db";
import {
  products, users, stores, inventory, orders, orderItems, supportRequests, campaigns,
  stylistConversations, categories,
  type Product, type InsertProduct,
  type User, type InsertUser,
  type Store, type InsertStore,
  type Inventory, type InsertInventory,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type SupportRequest, type InsertSupportRequest,
  type Campaign, type InsertCampaign,
  type StylistConversation, type InsertStylistConversation,
  type Category, type InsertCategory,
  getSizesForProduct,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, inArray, or, ilike } from "drizzle-orm";

export type PeriodMetrics = {
  orders: number;
  sale: number;         // revenue in thousands (₹)
  marginPercent: number; // margin % = (revenue - cost) / revenue * 100
  valuePerOrder: number;
  delivered: number;
  pending: number;
};

export type DashboardMetrics = {
  ld: PeriodMetrics;   // Last Day (yesterday)
  wtd: PeriodMetrics;  // Week To Date
  mtd: PeriodMetrics;  // Month To Date
  ytd: PeriodMetrics;  // Year To Date
};

export interface IStorage {
  searchProducts(query: string): Promise<Product[]>;
  getProducts(): Promise<Product[]>;
  getProductsByCategory(category: string): Promise<Product[]>;
  getProductsByCategoryAndSubcategory(category: string, subcategory: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductBarcode(id: number, barcode: string): Promise<Product | undefined>;
  deleteAllProducts(): Promise<void>;

  createUser(user: InsertUser): Promise<User>;
  getUserByMobile(mobile: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;

  getStores(): Promise<Store[]>;
  getStore(id: number): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined>;

  getInventory(filters?: { productId?: number; storeId?: number }): Promise<(Inventory & { productName?: string; storeName?: string })[]>;
  getInventoryByProductAndStore(productId: number, storeId: number): Promise<Inventory | undefined>;
  upsertInventory(data: InsertInventory): Promise<Inventory>;
  updateInventoryQuantity(id: number, quantity: number): Promise<Inventory | undefined>;
  getStockByProduct(productId: number): Promise<number>;

  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByNumber(orderNumber: string): Promise<Order | undefined>;
  getOrdersByUser(userId: number): Promise<Order[]>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;
  updateOrderPayment(id: number, data: {
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paymentStatus?: string;
    invoiceNumber?: string;
    gstAmount?: string;
  }): Promise<Order | undefined>;

  updateOrderShipping(id: number, data: {
    fulfilledFromStoreId?: number;
    shiprocketOrderId?: string;
    shiprocketShipmentId?: string;
    awbNumber?: string;
    courierName?: string;
    trackingUrl?: string;
    logisticsCost?: string;
    status?: string;
  }): Promise<Order | undefined>;

  /** Find the nearest active store that has stock for ALL items in the cart */
  findNearestStoreWithStock(
    items: { productId: number; quantity: number }[],
    customerPincode: string
  ): Promise<(Store & { distance?: number }) | null>;

  /** Get all stores that have stock for a given product */
  getStoresWithStock(productId: number, minQty?: number): Promise<(Store & { availableQty: number })[]>;

  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  getOrderItems(orderId: number): Promise<(OrderItem & { productName?: string; productImage?: string })[]>;

  getDashboardStats(): Promise<{ totalOrders: number; totalRevenue: number; totalProducts: number; activeStores: number }>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getSalesReport(startDate: Date, endDate: Date): Promise<{ date: string; orders: number; revenue: number }[]>;
  getTopSellingProducts(limit: number): Promise<{ productId: number; name: string; totalQuantity: number; totalRevenue: number }[]>;

  createSupportRequest(data: InsertSupportRequest): Promise<SupportRequest>;
  getSupportRequests(): Promise<SupportRequest[]>;
  updateSupportRequestStatus(id: number, status: string): Promise<SupportRequest | undefined>;

  getCampaigns(): Promise<Campaign[]>;
  getActiveCampaign(): Promise<Campaign | undefined>;
  getCampaignBySlug(slug: string): Promise<Campaign | undefined>;
  getCampaignByPromoCode(code: string): Promise<Campaign | undefined>;
  createCampaign(data: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deactivateAllCampaigns(): Promise<void>;

  getMarketingOptInMobiles(): Promise<string[]>;

  // AI Stylist
  getStylistConversation(mobile: string, limit?: number): Promise<StylistConversation[]>;
  addStylistMessage(data: InsertStylistConversation): Promise<StylistConversation>;
  getStylistStats(): Promise<{ totalConversations: number; uniqueUsers: number; productRecommendations: number }>;

  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(data: InsertCategory): Promise<Category>;
  deleteCategory(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private ensureSizes(product: Product): Product {
    if (!product.sizes || product.sizes.length === 0) {
      return { ...product, sizes: getSizesForProduct(product.category, product.subcategory) };
    }
    return product;
  }

  async searchProducts(query: string): Promise<Product[]> {
    const pattern = `%${query}%`;
    const rows = await db.select().from(products).where(
      or(ilike(products.name, pattern), ilike(products.description, pattern))
    ).limit(20);
    return rows.map(p => this.ensureSizes(p));
  }

  async getProducts(): Promise<Product[]> {
    const rows = await db.select().from(products);
    return rows.map(p => this.ensureSizes(p));
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    const rows = await db.select().from(products).where(eq(products.category, category));
    return rows.map(p => this.ensureSizes(p));
  }

  async getProductsByCategoryAndSubcategory(category: string, subcategory: string): Promise<Product[]> {
    const rows = await db.select().from(products).where(
      and(eq(products.category, category), eq(products.subcategory, subcategory))
    );
    return rows.map(p => this.ensureSizes(p));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product ? this.ensureSizes(product) : undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProductBarcode(id: number, barcode: string): Promise<Product | undefined> {
    const [updated] = await db.update(products).set({ barcode }).where(eq(products.id, id)).returning();
    return updated ? this.ensureSizes(updated) : undefined;
  }

  async deleteAllProducts(): Promise<void> {
    await db.delete(products);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUserByMobile(mobile: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.mobile, mobile));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getStores(): Promise<Store[]> {
    return await db.select().from(stores);
  }

  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(stores).where(eq(stores.id, id));
    return store;
  }

  async createStore(insertStore: InsertStore): Promise<Store> {
    const [store] = await db.insert(stores).values(insertStore).returning();
    return store;
  }

  async updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined> {
    const [store] = await db.update(stores).set(data).where(eq(stores.id, id)).returning();
    return store;
  }

  async getInventory(filters?: { productId?: number; storeId?: number }): Promise<(Inventory & { productName?: string; storeName?: string })[]> {
    let query = db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        storeId: inventory.storeId,
        quantity: inventory.quantity,
        reservedQty: inventory.reservedQty,
        productName: products.name,
        storeName: stores.name,
      })
      .from(inventory)
      .leftJoin(products, eq(inventory.productId, products.id))
      .leftJoin(stores, eq(inventory.storeId, stores.id));

    const conditions = [];
    if (filters?.productId) conditions.push(eq(inventory.productId, filters.productId));
    if (filters?.storeId) conditions.push(eq(inventory.storeId, filters.storeId));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const rows = await query;
    return rows.map(r => ({
      id: r.id,
      productId: r.productId,
      storeId: r.storeId,
      quantity: r.quantity,
      reservedQty: r.reservedQty,
      productName: r.productName ?? undefined,
      storeName: r.storeName ?? undefined,
    }));
  }

  async getInventoryByProductAndStore(productId: number, storeId: number): Promise<Inventory | undefined> {
    const [row] = await db.select().from(inventory).where(
      and(eq(inventory.productId, productId), eq(inventory.storeId, storeId))
    );
    return row;
  }

  async upsertInventory(data: InsertInventory): Promise<Inventory> {
    const existing = await this.getInventoryByProductAndStore(data.productId, data.storeId);
    if (existing) {
      const [updated] = await db.update(inventory)
        .set({ quantity: data.quantity, reservedQty: data.reservedQty ?? 0 })
        .where(eq(inventory.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(inventory).values(data).returning();
    return created;
  }

  async updateInventoryQuantity(id: number, quantity: number): Promise<Inventory | undefined> {
    const [updated] = await db.update(inventory).set({ quantity }).where(eq(inventory.id, id)).returning();
    return updated;
  }

  async getStockByProduct(productId: number): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${inventory.quantity} - ${inventory.reservedQty}), 0)` })
      .from(inventory)
      .where(eq(inventory.productId, productId));
    return Number(result[0]?.total ?? 0);
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
  }

  async getOrders(filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<Order[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(orders.status, filters.status));
    if (filters?.startDate) conditions.push(gte(orders.createdAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(orders.createdAt, filters.endDate));

    let query = db.select().from(orders).orderBy(desc(orders.createdAt));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    return await query;
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    return order;
  }

  async getOrdersByUser(userId: number): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const [order] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return order;
  }

  async updateOrderPayment(id: number, data: {
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paymentStatus?: string;
    invoiceNumber?: string;
    gstAmount?: string;
  }): Promise<Order | undefined> {
    const [order] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return order;
  }

  async updateOrderShipping(id: number, data: {
    fulfilledFromStoreId?: number;
    shiprocketOrderId?: string;
    shiprocketShipmentId?: string;
    awbNumber?: string;
    courierName?: string;
    trackingUrl?: string;
    logisticsCost?: string;
    status?: string;
  }): Promise<Order | undefined> {
    const [order] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return order;
  }

  /**
   * Find the nearest active store that has stock for ALL items in the order.
   *
   * Strategy:
   * 1. Get all active stores
   * 2. For each store, check if it has enough inventory for every item
   * 3. Among qualifying stores, pick the one nearest to the customer pincode
   *
   * Distance is approximated using the pincode's first 2 digits (postal zone).
   * If lat/lng are set on the store, uses Haversine distance to the customer's
   * approximate location (pincode centroid). Otherwise falls back to pincode
   * zone proximity.
   */
  async findNearestStoreWithStock(
    items: { productId: number; quantity: number }[],
    customerPincode: string
  ): Promise<(Store & { distance?: number }) | null> {
    const activeStores = await db.select().from(stores).where(eq(stores.isActive, true));
    if (activeStores.length === 0) return null;

    // Check which stores can fulfill ALL items
    const qualifyingStores: (Store & { distance?: number })[] = [];

    for (const store of activeStores) {
      let canFulfill = true;
      for (const item of items) {
        const inv = await this.getInventoryByProductAndStore(item.productId, store.id);
        if (!inv || (inv.quantity - inv.reservedQty) < item.quantity) {
          canFulfill = false;
          break;
        }
      }
      if (canFulfill) {
        const distance = this.calculatePincodeDistance(store.pincode, customerPincode, store.latitude, store.longitude);
        qualifyingStores.push({ ...store, distance });
      }
    }

    if (qualifyingStores.length === 0) {
      // Fallback: find ANY store that can fulfill (split shipment if needed later)
      // For now, find the store that has the most items
      let bestStore: Store | null = null;
      let bestCount = 0;
      for (const store of activeStores) {
        let count = 0;
        for (const item of items) {
          const inv = await this.getInventoryByProductAndStore(item.productId, store.id);
          if (inv && (inv.quantity - inv.reservedQty) >= item.quantity) count++;
        }
        if (count > bestCount) { bestCount = count; bestStore = store; }
      }
      return bestStore ? { ...bestStore, distance: undefined } : null;
    }

    // Sort by distance (nearest first)
    qualifyingStores.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return qualifyingStores[0];
  }

  /**
   * Approximate distance between two Indian pincodes.
   * Uses lat/lng if available, otherwise falls back to postal zone matching.
   */
  private calculatePincodeDistance(
    storePincode: string,
    customerPincode: string,
    storeLat?: string | null,
    storeLng?: string | null
  ): number {
    // If store has lat/lng, use approximate customer location from pincode
    if (storeLat && storeLng) {
      const customerCoords = this.approximateCoordinates(customerPincode);
      if (customerCoords) {
        return this.haversine(
          Number(storeLat), Number(storeLng),
          customerCoords.lat, customerCoords.lng
        );
      }
    }

    // Fallback: zone-based proximity
    // Same city (first 3 digits match) = 0 km
    // Same state/zone (first 2 digits match) = 100 km
    // Same region (first 1 digit match) = 500 km
    // Different region = 1500 km
    if (storePincode.substring(0, 3) === customerPincode.substring(0, 3)) return 0;
    if (storePincode.substring(0, 2) === customerPincode.substring(0, 2)) return 100;
    if (storePincode[0] === customerPincode[0]) return 500;
    return 1500;
  }

  /** Haversine distance in km */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Approximate lat/lng from Indian pincode first 2 digits (postal zone).
   * These are rough centroids — enough for nearest-store ranking.
   */
  private approximateCoordinates(pincode: string): { lat: number; lng: number } | null {
    const zone = pincode.substring(0, 2);
    const zoneCoords: Record<string, { lat: number; lng: number }> = {
      // Delhi NCR
      "11": { lat: 28.61, lng: 77.23 },
      // UP
      "20": { lat: 26.85, lng: 80.95 }, "21": { lat: 26.85, lng: 81.00 },
      "22": { lat: 26.45, lng: 80.35 }, "23": { lat: 27.18, lng: 79.00 },
      "24": { lat: 28.63, lng: 77.37 }, "25": { lat: 29.97, lng: 78.07 },
      "26": { lat: 28.98, lng: 79.41 }, "27": { lat: 26.45, lng: 83.38 },
      "28": { lat: 27.20, lng: 79.00 },
      // Rajasthan
      "30": { lat: 26.92, lng: 75.79 }, "31": { lat: 27.63, lng: 75.15 },
      "32": { lat: 28.02, lng: 73.31 }, "33": { lat: 26.30, lng: 73.02 },
      "34": { lat: 24.58, lng: 73.68 },
      // Gujarat
      "36": { lat: 23.02, lng: 72.57 }, "37": { lat: 22.31, lng: 70.80 },
      "38": { lat: 21.17, lng: 72.83 }, "39": { lat: 21.77, lng: 72.15 },
      // Maharashtra
      "40": { lat: 19.08, lng: 72.88 }, "41": { lat: 18.52, lng: 73.86 },
      "42": { lat: 19.88, lng: 75.32 }, "43": { lat: 20.93, lng: 77.75 },
      "44": { lat: 21.15, lng: 79.09 },
      // Telangana / AP
      "50": { lat: 17.39, lng: 78.49 }, "51": { lat: 17.00, lng: 78.00 },
      "52": { lat: 15.83, lng: 78.05 }, "53": { lat: 17.73, lng: 83.30 },
      // Karnataka
      "56": { lat: 12.97, lng: 77.59 }, "57": { lat: 15.36, lng: 75.12 },
      "58": { lat: 15.85, lng: 74.50 },
      // Tamil Nadu
      "60": { lat: 13.08, lng: 80.27 }, "61": { lat: 11.66, lng: 78.16 },
      "62": { lat: 10.79, lng: 78.70 }, "63": { lat: 11.02, lng: 76.97 },
      "64": { lat: 9.92, lng: 78.12 },
      // Kerala
      "67": { lat: 11.25, lng: 75.77 }, "68": { lat: 9.93, lng: 76.26 },
      "69": { lat: 8.52, lng: 76.94 },
      // West Bengal
      "70": { lat: 22.57, lng: 88.36 }, "71": { lat: 22.65, lng: 88.40 },
      "72": { lat: 23.24, lng: 87.86 }, "73": { lat: 23.53, lng: 87.33 },
      // MP / CG
      "45": { lat: 22.72, lng: 75.86 }, "46": { lat: 23.26, lng: 77.41 },
      "47": { lat: 24.53, lng: 80.33 }, "48": { lat: 21.25, lng: 81.63 },
      "49": { lat: 21.27, lng: 81.60 },
      // Punjab / Haryana
      "12": { lat: 28.46, lng: 77.03 }, "13": { lat: 30.73, lng: 76.78 },
      "14": { lat: 31.63, lng: 74.87 }, "15": { lat: 31.10, lng: 77.17 },
      "16": { lat: 30.73, lng: 76.78 },
      // Bihar / Jharkhand
      "80": { lat: 25.61, lng: 85.14 }, "81": { lat: 25.60, lng: 85.12 },
      "82": { lat: 24.80, lng: 84.99 }, "83": { lat: 23.35, lng: 85.33 },
      // Odisha
      "75": { lat: 20.30, lng: 85.83 }, "76": { lat: 20.27, lng: 85.84 },
      "77": { lat: 21.47, lng: 83.97 },
      // Assam / NE
      "78": { lat: 26.14, lng: 91.74 }, "79": { lat: 23.73, lng: 92.72 },
    };
    return zoneCoords[zone] || null;
  }

  async getStoresWithStock(productId: number, minQty: number = 1): Promise<(Store & { availableQty: number })[]> {
    const rows = await db
      .select({
        id: stores.id,
        name: stores.name,
        city: stores.city,
        state: stores.state,
        pincode: stores.pincode,
        address: stores.address,
        phone: stores.phone,
        isActive: stores.isActive,
        latitude: stores.latitude,
        longitude: stores.longitude,
        availableQty: sql<number>`${inventory.quantity} - ${inventory.reservedQty}`,
      })
      .from(inventory)
      .innerJoin(stores, eq(inventory.storeId, stores.id))
      .where(
        and(
          eq(inventory.productId, productId),
          eq(stores.isActive, true),
          sql`${inventory.quantity} - ${inventory.reservedQty} >= ${minQty}`
        )
      )
      .orderBy(desc(sql`${inventory.quantity} - ${inventory.reservedQty}`));

    return rows.map(r => ({
      ...r,
      availableQty: Number(r.availableQty),
    }));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [created] = await db.insert(orderItems).values(item).returning();
    return created;
  }

  async getOrderItems(orderId: number): Promise<(OrderItem & { productName?: string; productImage?: string })[]> {
    const rows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        storeId: orderItems.storeId,
        quantity: orderItems.quantity,
        price: orderItems.price,
        size: orderItems.size,
        productName: products.name,
        productImage: products.imageUrl,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    return rows.map(r => ({
      id: r.id,
      orderId: r.orderId,
      productId: r.productId,
      storeId: r.storeId,
      quantity: r.quantity,
      price: r.price,
      size: r.size,
      productName: r.productName ?? undefined,
      productImage: r.productImage ?? undefined,
    }));
  }

  async getDashboardStats(): Promise<{ totalOrders: number; totalRevenue: number; totalProducts: number; activeStores: number }> {
    const [orderStats] = await db
      .select({
        totalOrders: sql<number>`COUNT(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders);

    const [productStats] = await db
      .select({ totalProducts: sql<number>`COUNT(*)` })
      .from(products);

    const [storeStats] = await db
      .select({ activeStores: sql<number>`COUNT(*)` })
      .from(stores)
      .where(eq(stores.isActive, true));

    return {
      totalOrders: Number(orderStats?.totalOrders ?? 0),
      totalRevenue: Number(orderStats?.totalRevenue ?? 0),
      totalProducts: Number(productStats?.totalProducts ?? 0),
      activeStores: Number(storeStats?.activeStores ?? 0),
    };
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const now = new Date();

    // Yesterday (last day)
    const ldStart = new Date(now); ldStart.setDate(ldStart.getDate() - 1); ldStart.setHours(0, 0, 0, 0);
    const ldEnd = new Date(now); ldEnd.setDate(ldEnd.getDate() - 1); ldEnd.setHours(23, 59, 59, 999);

    // Week to date (Monday of current week)
    const wtdStart = new Date(now);
    const dayOfWeek = wtdStart.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0 offset
    wtdStart.setDate(wtdStart.getDate() - diff);
    wtdStart.setHours(0, 0, 0, 0);

    // Month to date (1st of current month)
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Year to date (Jan 1st of current year)
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const fetchPeriod = async (start: Date, end: Date): Promise<PeriodMetrics> => {
      const [stats] = await db
        .select({
          totalOrders: sql<number>`COUNT(*)`,
          totalRevenue: sql<number>`COALESCE(SUM(${orders.totalAmount}::numeric), 0)`,
          totalLogistics: sql<number>`COALESCE(SUM(${orders.logisticsCost}::numeric), 0)`,
          delivered: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'delivered')`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} NOT IN ('delivered', 'cancelled', 'returned', 'rto'))`,
        })
        .from(orders)
        .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)));

      // Calculate total cost from order_items for margin
      const [costStats] = await db
        .select({
          totalCost: sql<number>`COALESCE(SUM(${orderItems.costPrice}::numeric * ${orderItems.quantity}), 0)`,
          totalItemRevenue: sql<number>`COALESCE(SUM(${orderItems.price}::numeric * ${orderItems.quantity}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)));

      const totalOrders = Number(stats?.totalOrders ?? 0);
      const totalRevenue = Number(stats?.totalRevenue ?? 0);
      const totalLogistics = Number(stats?.totalLogistics ?? 0);
      const totalCost = Number(costStats?.totalCost ?? 0);
      const totalItemRevenue = Number(costStats?.totalItemRevenue ?? 0);
      // Margin % = (Revenue - Cost Price - Logistics) / Revenue * 100
      const marginPercent = totalItemRevenue > 0
        ? Math.round(((totalItemRevenue - totalCost - totalLogistics) / totalItemRevenue) * 100)
        : 0;

      return {
        orders: totalOrders,
        sale: Math.round(totalRevenue / 1000),  // convert to thousands
        marginPercent,
        valuePerOrder: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        delivered: Number(stats?.delivered ?? 0),
        pending: Number(stats?.pending ?? 0),
      };
    };

    const [ld, wtd, mtd, ytd] = await Promise.all([
      fetchPeriod(ldStart, ldEnd),
      fetchPeriod(wtdStart, now),
      fetchPeriod(mtdStart, now),
      fetchPeriod(ytdStart, now),
    ]);

    return { ld, wtd, mtd, ytd };
  }

  async getSalesReport(startDate: Date, endDate: Date): Promise<{ date: string; orders: number; revenue: number }[]> {
    const rows = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})::text`,
        orders: sql<number>`COUNT(*)`,
        revenue: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders)
      .where(and(gte(orders.createdAt, startDate), lte(orders.createdAt, endDate)))
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    return rows.map(r => ({
      date: r.date,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
    }));
  }

  async getTopSellingProducts(limit: number): Promise<{ productId: number; name: string; totalQuantity: number; totalRevenue: number }[]> {
    const rows = await db
      .select({
        productId: orderItems.productId,
        name: products.name,
        totalQuantity: sql<number>`SUM(${orderItems.quantity})`,
        totalRevenue: sql<number>`SUM(${orderItems.quantity} * ${orderItems.price})`,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .groupBy(orderItems.productId, products.name)
      .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
      .limit(limit);

    return rows.map(r => ({
      productId: r.productId,
      name: r.name ?? "Unknown",
      totalQuantity: Number(r.totalQuantity),
      totalRevenue: Number(r.totalRevenue),
    }));
  }

  async createSupportRequest(data: InsertSupportRequest): Promise<SupportRequest> {
    const [req] = await db.insert(supportRequests).values(data).returning();
    return req;
  }

  async getSupportRequests(): Promise<SupportRequest[]> {
    return db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt));
  }

  async updateSupportRequestStatus(id: number, status: string): Promise<SupportRequest | undefined> {
    const [updated] = await db.update(supportRequests).set({ status }).where(eq(supportRequests.id, id)).returning();
    return updated;
  }

  async getCampaigns(): Promise<Campaign[]> {
    return db.select().from(campaigns).orderBy(desc(campaigns.id));
  }

  async getActiveCampaign(): Promise<Campaign | undefined> {
    const now = new Date();
    const rows = await db.select().from(campaigns).where(eq(campaigns.isActive, true));
    return rows.find((c) => c.startDate <= now && c.endDate >= now);
  }

  async getCampaignBySlug(slug: string): Promise<Campaign | undefined> {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
    return c;
  }

  async getCampaignByPromoCode(code: string): Promise<Campaign | undefined> {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.promoCode, code.toUpperCase()));
    return c;
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const [c] = await db.insert(campaigns).values({ ...data, promoCode: data.promoCode.toUpperCase() }).returning();
    return c;
  }

  async updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const payload: Partial<InsertCampaign> = {
      ...data,
      ...(data.promoCode ? { promoCode: data.promoCode.toUpperCase() } : {}),
    };
    const [updated] = await db.update(campaigns).set(payload).where(eq(campaigns.id, id)).returning();
    return updated;
  }

  async deactivateAllCampaigns(): Promise<void> {
    await db.update(campaigns).set({ isActive: false });
  }

  async getMarketingOptInMobiles(): Promise<string[]> {
    const rows = await db.select({ mobile: users.mobile, optIn: users.marketingOptIn }).from(users);
    return rows.filter((r) => r.optIn).map((r) => r.mobile);
  }

  // ---------------------------------------------------------------------------
  // AI Stylist
  // ---------------------------------------------------------------------------
  async getStylistConversation(mobile: string, limit = 20): Promise<StylistConversation[]> {
    if (!mobile) {
      // Return all recent messages across all users (for admin)
      return db
        .select()
        .from(stylistConversations)
        .orderBy(desc(stylistConversations.createdAt))
        .limit(limit);
    }
    return db
      .select()
      .from(stylistConversations)
      .where(eq(stylistConversations.mobile, mobile))
      .orderBy(desc(stylistConversations.createdAt))
      .limit(limit)
      .then((rows) => rows.reverse()); // chronological order
  }

  async addStylistMessage(data: InsertStylistConversation): Promise<StylistConversation> {
    const [msg] = await db.insert(stylistConversations).values(data).returning();
    return msg;
  }

  async getStylistStats(): Promise<{ totalConversations: number; uniqueUsers: number; productRecommendations: number }> {
    const [stats] = await db
      .select({
        totalConversations: sql<number>`COUNT(*)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${stylistConversations.mobile})`,
        productRecommendations: sql<number>`COUNT(*) FILTER (WHERE ${stylistConversations.productIds} IS NOT NULL AND ${stylistConversations.productIds} != '')`,
      })
      .from(stylistConversations);
    return {
      totalConversations: Number(stats?.totalConversations ?? 0),
      uniqueUsers: Number(stats?.uniqueUsers ?? 0),
      productRecommendations: Number(stats?.productRecommendations ?? 0),
    };
  }

  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.name);
  }

  async createCategory(data: InsertCategory): Promise<Category> {
    const [cat] = await db.insert(categories).values(data).returning();
    return cat;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }
}

export const storage = new DatabaseStorage();
