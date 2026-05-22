import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { register, isLoggedIn, isLoading } = useAuth();
  const { toast } = useToast();

  const urlMobile = new URLSearchParams(searchString).get("mobile") || "";

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState(urlMobile);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [birthday, setBirthday] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate("/account");
  }, [isLoading, isLoggedIn, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoggedIn) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    if (!/^[6-9]\d{9}$/.test(mobile)) errs.mobile = "Enter a valid 10-digit Indian mobile number";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
    if (!/^\d{4}$/.test(pin)) errs.pin = "PIN must be exactly 4 digits";
    if (pin !== confirmPin) errs.confirmPin = "PINs do not match";
    if (!birthday) errs.birthday = "Birthday is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await register.mutateAsync({ name: name.trim(), mobile, email: email.trim(), pin, confirmPin, birthday });
      toast({ title: "Welcome to ACCENZA!", description: "Your account has been created successfully." });
      navigate("/account");
    } catch (error: any) {
      let msg = "Registration failed. Please try again.";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Registration Failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl md:text-4xl font-display font-light tracking-wide text-center mb-2" data-testid="text-register-title">
          Create Account
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-10">Join ACCENZA for a seamless shopping experience</p>

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Full Name</label>
            <input
              data-testid="input-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              placeholder="Enter your full name"
              autoFocus
            />
            {errors.name && <p className="text-red-700 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Mobile Number</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-border bg-secondary text-sm text-muted-foreground">+91</span>
              <input
                data-testid="input-mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="10-digit mobile number"
              />
            </div>
            {errors.mobile && <p className="text-red-700 text-xs mt-1">{errors.mobile}</p>}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Email Address</label>
            <input
              data-testid="input-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              placeholder="your@email.com"
            />
            {errors.email && <p className="text-red-700 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Birthday</label>
            <input
              data-testid="input-birthday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            />
            {errors.birthday && <p className="text-red-700 text-xs mt-1">{errors.birthday}</p>}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">4-Digit PIN</label>
            <div className="relative">
              <input
                data-testid="input-pin"
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground pr-12"
                placeholder="••••"
                maxLength={4}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.pin && <p className="text-red-700 text-xs mt-1">{errors.pin}</p>}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Confirm PIN</label>
            <div className="relative">
              <input
                data-testid="input-confirm-pin"
                type={showConfirmPin ? "text" : "password"}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground pr-12"
                placeholder="••••"
                maxLength={4}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPin(!showConfirmPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPin && <p className="text-red-700 text-xs mt-1">{errors.confirmPin}</p>}
          </div>

          <button
            data-testid="button-register"
            type="submit"
            disabled={register.isPending}
            className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {register.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Account
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4 hover:opacity-70" data-testid="link-login">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
