import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import NotFound from "@/pages/not-found";

// Storefront pages — lazy loaded
const Home = lazy(() => import("@/pages/Home"));
const CategoryPage = lazy(() => import("@/pages/CategoryPage"));
const ProductPage = lazy(() => import("@/pages/ProductPage"));
const WishlistPage = lazy(() => import("@/pages/WishlistPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const ExchangePolicyPage = lazy(() => import("@/pages/ExchangePolicyPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const AccountPage = lazy(() => import("@/pages/AccountPage"));
const MyOrdersPage = lazy(() => import("@/pages/MyOrdersPage"));
const OrderDetailPage = lazy(() => import("@/pages/OrderDetailPage"));

// Admin pages — lazy loaded
const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage"));
const AdminOrdersPage = lazy(() => import("@/pages/admin/OrdersPage"));
const SalesPage = lazy(() => import("@/pages/admin/SalesPage"));
const StoresPage = lazy(() => import("@/pages/admin/StoresPage"));
const InventoryPage = lazy(() => import("@/pages/admin/InventoryPage"));
const ArticlesPage = lazy(() => import("@/pages/admin/ArticlesPage"));
const AdminSupportPage = lazy(() => import("@/pages/admin/SupportPage"));
const CampaignsPage = lazy(() => import("@/pages/admin/CampaignsPage"));

const PageFallback = () => <div className="min-h-screen bg-background" />;

function StorefrontRouter() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/category/:category" component={CategoryPage} />
            <Route path="/product/:id" component={ProductPage} />
            <Route path="/wishlist" component={WishlistPage} />
            <Route path="/checkout" component={CheckoutPage} />
            <Route path="/exchange-policy" component={ExchangePolicyPage} />
            <Route path="/login" component={LoginPage} />
            <Route path="/register" component={RegisterPage} />
            <Route path="/account" component={AccountPage} />
            <Route path="/orders" component={MyOrdersPage} />
            <Route path="/orders/:id" component={OrderDetailPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/admin" component={DashboardPage} />
            <Route path="/admin/orders" component={AdminOrdersPage} />
            <Route path="/admin/sales" component={SalesPage} />
            <Route path="/admin/stores" component={StoresPage} />
            <Route path="/admin/inventory" component={InventoryPage} />
            <Route path="/admin/articles" component={ArticlesPage} />
            <Route path="/admin/support" component={AdminSupportPage} />
            <Route path="/admin/campaigns" component={CampaignsPage} />
            <Route component={StorefrontRouter} />
          </Switch>
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
