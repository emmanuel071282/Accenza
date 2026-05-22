import { Package, RotateCcw, Clock, ShieldCheck, AlertTriangle, Truck, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

const EXCHANGE_STEPS = [
  { step: "1", title: "Initiate Return", desc: "Go to My Orders, select the item and choose 'Return/Exchange'. Pick your reason." },
  { step: "2", title: "Schedule Pickup", desc: "Choose a convenient date and time slot. Our courier partner will pick up from your doorstep." },
  { step: "3", title: "Quality Check", desc: "Once received at our warehouse, items undergo a quality check within 1-2 business days." },
  { step: "4", title: "Refund / Exchange", desc: "Refund is initiated to your original payment method or exchange is dispatched within 7 working days." },
];

const NON_RETURNABLE = [
  "Intimate wear (bras, lingerie sets, briefs)",
  "Swimwear and beachwear",
  "Jewellery and hair accessories",
  "Perfumes and grooming products",
  "Customised or personalised items",
  "Free gifts and promotional items",
  "Items marked as 'Non-returnable' on product page",
];

const EXCHANGE_CONDITIONS = [
  { icon: CheckCircle2, text: "Item must be unused, unwashed, and in original condition with all tags attached" },
  { icon: CheckCircle2, text: "Original packaging, brand tags, price tags must be intact" },
  { icon: CheckCircle2, text: "Return/exchange request must be raised within the return window" },
  { icon: CheckCircle2, text: "Item should not be altered, ironed, or have any stains/damage" },
  { icon: CheckCircle2, text: "Free gift items must be returned along with the main product" },
];

const FAQ_ITEMS = [
  {
    q: "How long does the refund take?",
    a: "Refunds are processed within 7 working days after the quality check is completed. The exact timeline may vary slightly depending on your payment method.",
  },
  {
    q: "Can I exchange for a different size?",
    a: "Yes, you can exchange for a different size of the same product, subject to availability. If the desired size is unavailable, you will receive a full refund.",
  },
  {
    q: "What if I received a damaged or defective item?",
    a: "Report damaged/defective items within 48 hours of delivery. We will arrange a free return pickup and send a replacement or issue a full refund immediately.",
  },
  {
    q: "Is there a pickup charge for returns?",
    a: "No, return pickup is completely free for all eligible items within the return window.",
  },
  {
    q: "Can I return items bought during a sale?",
    a: "Yes, sale items follow the same return policy. However, the refund will be for the amount you actually paid (discounted price).",
  },
  {
    q: "What if pickup is unavailable in my area?",
    a: "If reverse pickup is not available in your pin code, you can self-ship the item to our warehouse. Shipping charges will be reimbursed after quality check.",
  },
];

export default function ExchangePolicyPage() {
  return (
    <div className="min-h-screen bg-background pt-28 pb-20">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl">

        <div className="mb-12 md:mb-16">
          <h1 data-testid="text-page-title" className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tighter mb-4">
            Returns & Exchange Policy
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            We want you to love what you buy. If something doesn't work out, our hassle-free return and exchange policy has got you covered.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          <div className="border border-border p-6 flex flex-col items-center text-center" data-testid="card-return-window">
            <Clock className="w-8 h-8 mb-4 text-foreground" />
            <span className="text-3xl font-display font-bold tracking-tighter mb-1">15 Days</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Return Window</span>
            <p className="text-sm text-muted-foreground mt-2">From the date of delivery for most items</p>
          </div>
          <div className="border border-border p-6 flex flex-col items-center text-center" data-testid="card-free-pickup">
            <Truck className="w-8 h-8 mb-4 text-foreground" />
            <span className="text-3xl font-display font-bold tracking-tighter mb-1">Free</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Return Pickup</span>
            <p className="text-sm text-muted-foreground mt-2">Doorstep pickup at no extra cost</p>
          </div>
          <div className="border border-border p-6 flex flex-col items-center text-center" data-testid="card-refund-time">
            <RotateCcw className="w-8 h-8 mb-4 text-foreground" />
            <span className="text-3xl font-display font-bold tracking-tighter mb-1">7 Days</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Refund Processing</span>
            <p className="text-sm text-muted-foreground mt-2">Within 7 working days after quality check</p>
          </div>
        </div>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {EXCHANGE_STEPS.map((s) => (
              <div key={s.step} className="border border-border p-6 flex gap-5" data-testid={`step-${s.step}`}>
                <span className="text-3xl font-display font-bold tracking-tighter text-muted-foreground/30 shrink-0">{s.step}</span>
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-widest mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter mb-8">Conditions for Return/Exchange</h2>
          <div className="border border-border divide-y divide-border">
            {EXCHANGE_CONDITIONS.map((c, i) => (
              <div key={i} className="flex items-start gap-4 p-5" data-testid={`condition-${i}`}>
                <c.icon className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <p className="text-sm">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter mb-4">Refund Modes</h2>
          <p className="text-sm text-muted-foreground mb-6">Refunds are credited back to the original payment method used at the time of purchase.</p>
          <div className="border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary">
                  <th className="text-left py-4 px-5 text-xs uppercase tracking-widest font-semibold">Payment Method</th>
                  <th className="text-left py-4 px-5 text-xs uppercase tracking-widest font-semibold">Refund Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-4 px-5">UPI (Google Pay / Paytm / Amazon Pay)</td><td className="py-4 px-5 text-muted-foreground">5-7 working days</td></tr>
                <tr><td className="py-4 px-5">Credit / Debit Card (Visa, Mastercard, RuPay)</td><td className="py-4 px-5 text-muted-foreground">7 working days</td></tr>
                <tr><td className="py-4 px-5">Net Banking</td><td className="py-4 px-5 text-muted-foreground">7 working days</td></tr>
                <tr><td className="py-4 px-5">Cash on Delivery</td><td className="py-4 px-5 text-muted-foreground">ACCENZA Wallet credit (instant) or bank transfer (7 working days)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-foreground" />
            <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter">Non-Returnable Items</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">The following categories are not eligible for return or exchange due to hygiene and safety reasons:</p>
          <div className="border border-border divide-y divide-border">
            {NON_RETURNABLE.map((item, i) => (
              <div key={i} className="flex items-start gap-4 p-5" data-testid={`non-returnable-${i}`}>
                <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <HelpCircle className="w-6 h-6 text-foreground" />
            <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tighter">Frequently Asked Questions</h2>
          </div>
          <div className="border border-border divide-y divide-border">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i} className="p-6" data-testid={`faq-${i}`}>
                <h3 className="font-semibold text-sm mb-2">{faq.q}</h3>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border p-8 md:p-12 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto mb-4 text-foreground" />
          <h2 className="text-2xl font-display font-bold tracking-tighter mb-3">Need Help?</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Our customer support team is available 7 days a week to help you with returns, exchanges, and any order-related queries.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-accenza-chat"))}
            data-testid="button-start-return-exchange"
            className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3 text-sm font-semibold uppercase tracking-widest hover:bg-foreground/80 transition-colors mb-6"
          >
            Start a Return or Exchange
          </button>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <span className="text-muted-foreground">Email: <span className="text-foreground font-medium">customercare@accenzafashion.in</span></span>
            <span className="hidden sm:inline text-muted-foreground/30">|</span>
            <span className="text-muted-foreground">Call: <span className="text-foreground font-medium">1800-123-ACCENZA</span></span>
          </div>
        </section>
      </div>
    </div>
  );
}
