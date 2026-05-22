import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { register, isLoggedIn, isLoading } = useAuth();
  const { toast } = useToast();

  const urlMobile = new URLSearchParams(searchString).get("mobile") || "";

  const [step, setStep] = useState<"details" | "otp" | "complete">("details");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState(urlMobile);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [birthday, setBirthday] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate("/account");
  }, [isLoading, isLoggedIn, navigate]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoggedIn) return null;

  const validateDetails = () => {
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

  const handleSendOtp = async () => {
    if (!validateDetails()) return;
    setOtpSending(true);
    try {
      const result = await apiRequest("POST", "/api/auth/send-registration-otp", { mobile });
      const data = await result.json();
      setStep("otp");
      setResendTimer(30);
      if (data.simulated) setSimulatedOtp(data.otp);
      toast({
        title: "OTP Sent",
        description: data.simulated ? "Demo mode — your code is shown below." : `Verification code sent to +91${mobile}.`,
      });
    } catch (error: any) {
      let msg = "Failed to send OTP";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{4}$/.test(otp)) { setErrors({ otp: "Enter a valid 4-digit OTP" }); return; }
    setErrors({});
    setOtpVerifying(true);
    try {
      await apiRequest("POST", "/api/auth/verify-registration-otp", { mobile, otp });
    } catch (error: any) {
      let msg = "Invalid OTP. Please try again.";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Verification Failed", description: msg, variant: "destructive" });
      setOtpVerifying(false);
      return;
    }

    try {
      await register.mutateAsync({ name: name.trim(), mobile, email: email.trim(), pin, confirmPin, birthday });
      toast({ title: "Welcome to ACCENZA!", description: "Your account has been created successfully." });
      navigate("/account");
    } catch (error: any) {
      let msg = "Registration failed. Please try again.";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Registration Failed", description: msg, variant: "destructive" });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setOtpSending(true);
    try {
      const result = await apiRequest("POST", "/api/auth/send-registration-otp", { mobile });
      const data = await result.json();
      setResendTimer(30);
      setOtp("");
      if (data.simulated) setSimulatedOtp(data.otp);
      toast({ title: "OTP Resent", description: data.simulated ? "Demo mode — your new code is shown below." : `New code sent to +91${mobile}.` });
    } catch (error: any) {
      let msg = "Failed to resend OTP";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setOtpSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-wide text-center mb-2" data-testid="text-register-title">
          Create Account
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-10">Join ACCENZA for a seamless shopping experience</p>

        {step === "details" && (
          <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Full Name</label>
              <input data-testid="input-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="Enter your full name" autoFocus />
              {errors.name && <p className="text-red-700 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Mobile Number</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 border border-r-0 border-border bg-secondary text-sm text-muted-foreground">+91</span>
                <input data-testid="input-mobile" type="tel" value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                  placeholder="10-digit mobile number" />
              </div>
              {errors.mobile && <p className="text-red-700 text-xs mt-1">{errors.mobile}</p>}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Email Address</label>
              <input data-testid="input-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="your@email.com" />
              {errors.email && <p className="text-red-700 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Birthday</label>
              <input data-testid="input-birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground" />
              {errors.birthday && <p className="text-red-700 text-xs mt-1">{errors.birthday}</p>}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">4-Digit PIN</label>
              <div className="relative">
                <input data-testid="input-pin" type={showPin ? "text" : "password"} value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground pr-12"
                  placeholder="••••" maxLength={4} />
                <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.pin && <p className="text-red-700 text-xs mt-1">{errors.pin}</p>}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Confirm PIN</label>
              <div className="relative">
                <input data-testid="input-confirm-pin" type={showConfirmPin ? "text" : "password"} value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-foreground pr-12"
                  placeholder="••••" maxLength={4} />
                <button type="button" onClick={() => setShowConfirmPin(!showConfirmPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPin && <p className="text-red-700 text-xs mt-1">{errors.confirmPin}</p>}
            </div>

            <button data-testid="button-send-otp" type="submit" disabled={otpSending}
              className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {otpSending && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify Mobile & Create Account
            </button>
          </form>
        )}

        {step === "otp" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">We've sent a 4-digit OTP to</p>
              <p className="text-sm font-semibold">+91 {mobile}</p>
              <button data-testid="button-change-mobile" type="button"
                onClick={() => { setStep("details"); setOtp(""); setSimulatedOtp(null); }}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Change number
              </button>
            </div>

            {simulatedOtp && (
              <div className="p-4 border border-dashed border-amber-400 bg-amber-50 text-center">
                <p className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold mb-1">Demo Mode — Your OTP</p>
                <p className="text-3xl font-bold tracking-[0.4em] text-amber-700">{simulatedOtp}</p>
                <p className="text-[10px] text-amber-600 mt-1">SMS delivery requires a connected SMS provider</p>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2 text-center">Enter OTP</label>
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <input key={i} data-testid={`input-otp-${i}`} type="text" inputMode="numeric" maxLength={1}
                    value={otp[i] || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      const newOtp = otp.split("");
                      newOtp[i] = val;
                      setOtp(newOtp.join("").slice(0, 4));
                      if (val && i < 3) {
                        const next = e.target.parentElement?.children[i + 1] as HTMLInputElement;
                        next?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[i] && i > 0) {
                        const prev = (e.target as HTMLElement).parentElement?.children[i - 1] as HTMLInputElement;
                        prev?.focus();
                      }
                    }}
                    className="w-14 h-14 border border-border bg-background text-center text-lg font-semibold focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                ))}
              </div>
              {errors.otp && <p className="text-red-700 text-xs mt-1 text-center">{errors.otp}</p>}
            </div>

            <button data-testid="button-verify-otp" type="button" onClick={handleVerifyOtp}
              disabled={otpVerifying || otp.length < 4}
              className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {otpVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
              {otpVerifying ? "Verifying..." : "Verify & Create Account"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Didn't receive the OTP?{" "}
              {resendTimer > 0 ? (
                <span className="text-foreground" aria-live="polite">Resend in {resendTimer}s</span>
              ) : (
                <button data-testid="button-resend-otp" type="button" onClick={handleResendOtp} disabled={otpSending}
                  className="text-foreground underline underline-offset-4 hover:opacity-70">
                  Resend OTP
                </button>
              )}
            </p>
          </div>
        )}

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
