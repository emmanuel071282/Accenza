import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-16 md:py-24 mt-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">

          <div className="space-y-6">
            <h3 className="font-display text-2xl font-bold tracking-widest">ACCENZA</h3>
            <p className="text-sm text-primary-foreground/70 max-w-xs">
              Curated jewellery, cosmetics, handbags & accessories for the modern Indian woman.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Shop</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li><Link href="/category/Jewellery" className="hover:text-white transition-colors">Jewellery</Link></li>
              <li><Link href="/category/Cosmetics" className="hover:text-white transition-colors">Cosmetics</Link></li>
              <li><Link href="/category/Handbags" className="hover:text-white transition-colors">Handbags</Link></li>
              <li><Link href="/category/Accessories" className="hover:text-white transition-colors">Accessories</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Help</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li><Link href="/login" className="hover:text-white transition-colors">My Account</Link></li>
              <li><Link href="/orders" className="hover:text-white transition-colors">My Orders</Link></li>
              <li><Link href="/exchange-policy" className="hover:text-white transition-colors">Returns & Exchange</Link></li>
              <li><a href="#" className="hover:text-white transition-colors">Shipping Info</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Stay Connected</h4>
            <p className="text-sm text-primary-foreground/70">Subscribe for new arrivals and exclusive offers.</p>
            <form className="flex mt-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Email address"
                className="bg-transparent border-b border-primary-foreground/30 px-0 py-2 text-sm w-full focus:outline-none focus:border-primary-foreground transition-colors placeholder:text-primary-foreground/40"
              />
              <button className="text-xs uppercase tracking-widest font-semibold ml-4 hover:text-primary-foreground/70 transition-colors">
                Join
              </button>
            </form>
          </div>

        </div>

        <div className="mt-16 md:mt-24 pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-primary-foreground/40">
          <p>&copy; {new Date().getFullYear()} Accenza. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
