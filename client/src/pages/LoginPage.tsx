import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, isLoggedIn, isLoading } = useAuth();
  const { toast } = useToast();

  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^[6-9]\d{9}$/.test(mobile)) errs.mobile = "Enter a valid 10-digit Indian mobile number";
    if (!/^\d{4}$/.test(pin)) errs.pin = "PIN must be exactly 4 digits";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      await login.mutateAsync({ mobile, pin });
      toast({ title: "Welcome back!", description: "You have signed in successfully." });
      navigate("/account");
    } catch (error: any) {
      let msg = "Invalid mobile number or PIN";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}

      if (msg.toLowerCase().includes("no account") || msg.toLowerCase().includes("user not found")) {
        toast({ title: "New here?", description: "No account found. Let's create one!" });
        navigate(`/register?mobile=${mobile}`);
        return;
      }

      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl md:text-4xl font-display font-light tracking-wide text-center mb-2" data-testid="text-login-title">
          Sign In
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-10">Welcome back to ACCENZA</p>

        <form onSubmit={handleLogin} className="space-y-5">
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
                autoFocus
              />
            </div>
            {errors.mobile && <p className="text-red-700 text-xs mt-1">{errors.mobile}</p>}
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

          <button
            data-testid="button-login"
            type="submit"
            disabled={login.isPending}
            className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {login.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign In
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Don't have an account?{" "}
          <Link href="/register" className="text-foreground underline underline-offset-4 hover:opacity-70" data-testid="link-register">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
