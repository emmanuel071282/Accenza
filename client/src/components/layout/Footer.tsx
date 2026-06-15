import { Link } from "wouter";

const INSTAGRAM_URL = "#"; // update when ready
const FACEBOOK_URL = "https://www.facebook.com/share/1BCEpzR2Y1/";
const WHATSAPP_URL = "https://wa.me/917778988998";
const PHONE = "+91 7778988998";
const EMAIL = "customer.care@accenzastore.in";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.115 1.532 5.844L.057 23.887a.5.5 0 0 0 .609.619l6.204-1.625A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.655-.518-5.17-1.418l-.37-.219-3.833 1.004 1.02-3.727-.242-.387A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-16 md:py-24 mt-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">

          {/* Brand */}
          <div className="space-y-6">
            <h3 className="font-display text-2xl font-bold tracking-widest">ACCENZA</h3>
            <p className="text-sm text-primary-foreground/70 max-w-xs">
              Curated jewellery, cosmetics, handbags & accessories for the modern Indian woman.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-4 pt-2">
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-primary-foreground/60 hover:text-white transition-colors">
                <InstagramIcon />
              </a>
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-primary-foreground/60 hover:text-white transition-colors">
                <FacebookIcon />
              </a>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="text-primary-foreground/60 hover:text-white transition-colors">
                <WhatsAppIcon />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Shop</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li><Link href="/category/Jewellery" className="hover:text-white transition-colors">Jewellery</Link></li>
              <li><Link href="/category/Cosmetics" className="hover:text-white transition-colors">Cosmetics</Link></li>
              <li><Link href="/category/Handbags" className="hover:text-white transition-colors">Handbags</Link></li>
              <li><Link href="/category/Accessories" className="hover:text-white transition-colors">Accessories</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Help</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li><Link href="/login" className="hover:text-white transition-colors">My Account</Link></li>
              <li><Link href="/orders" className="hover:text-white transition-colors">My Orders</Link></li>
              <li><Link href="/exchange-policy" className="hover:text-white transition-colors">Returns & Exchange</Link></li>
              <li>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("open-accenza-chat"))}
                  className="hover:text-white transition-colors text-left"
                >
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          {/* Contact + Newsletter */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-widest font-semibold text-primary-foreground/80">Contact</h4>
              <a href={`tel:${PHONE.replace(/\s/g, "")}`}
                className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-white transition-colors">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25z"/>
                </svg>
                {PHONE}
              </a>
              <a href={`mailto:${EMAIL}`}
                className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-white transition-colors">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>
                </svg>
                {EMAIL}
              </a>
            </div>

            <div className="space-y-3">
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
