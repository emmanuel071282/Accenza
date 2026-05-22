import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ArrowLeft, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { sendOtp, verifyOtp, isLoggedIn, isLoading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<"mobile" | "otp">("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(0);
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate("/account");
  }, [isLoading, isLoggedIn, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-28 pb-20 flex items-start justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoggedIn) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^[6-9]\d{9}$/.test(mobile)) errs.mobile = "Enter a valid 10-digit Indian mobile number";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      const result = await sendOtp.mutateAsync({ mobile });
      setStep("otp");
      setOtp(["", "", "", ""]);
      setCountdown(30);
      if (result.simulated) setSimulatedOtp(result.otp);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      toast({
        title: "OTP Sent!",
        description: result.simulated
          ? "Demo mode — your code is shown below."
          : `Verification code sent to +91 ${mobile}.`,
      });
    } catch (error: any) {
      let msg = "Failed to send OTP";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      if (msg.toLowerCase().includes("no account found") || msg.toLowerCase().includes("user not found")) {
        toast({ title: "New here?", description: "No account found. Let's create one!" });
        navigate(`/register?mobile=${mobile}`);
        return;
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setOtp(pasted.split(""));
      inputRefs.current[3]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpString = otp.join("");
    if (otpString.length !== 4) { setErrors({ otp: "Please enter the 4-digit OTP" }); return; }
    setErrors({});
    try {
      await verifyOtp.mutateAsync({ mobile, otp: otpString });
      toast({ title: "Welcome back!", description: "You have signed in successfully." });
      navigate("/account");
    } catch (error: any) {
      let msg = "Verification failed";
      try { msg = JSON.parse(error.message.split(":").slice(1).join(":").trim()).message; } catch {}
      toast({ title: "Invalid OTP", description: msg, variant: "destructive" });
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    try {
      const result = await sendOtp.mutateAsync({ mobile });
      setOtp(["", "", "", ""]);
      setCountdown(30);
      if (result.simulated) setSimulatedOtp(result.otp);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      toast({
        title: "OTP Resent!",
        description: result.simulated ? "Demo mode — your new code is shown below." : `New code sent to +91 ${mobile}.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to resend OTP", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pt-28 pb-20 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-wide text-center mb-2" data-testid="text-login-title">
          Sign In
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-10">Welcome back to ACCENZA</p>

        {step === "mobile" && (
          <form onSubmit={handleSendOtp} className="space-y-5">
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
            <button
              data-testid="button-send-otp"
              type="submit"
              disabled={sendOtp.isPending}
              className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sendOtp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              Send OTP
            </button>
          </form>
        )}

        {step === "otp" && (
          <div>
            <button
              data-testid="button-back-to-mobile"
              onClick={() => { setStep("mobile"); setOtp(["", "", "", ""]); setErrors({}); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Change number
            </button>

            <div className="text-center mb-8">
              <p className="text-sm text-muted-foreground">We sent a verification code to</p>
              <p className="text-sm font-semibold mt-1">+91 {mobile}</p>
            </div>

            {simulatedOtp && (
              <div className="mb-6 p-4 border border-dashed border-amber-400 bg-amber-50 text-center">
                <p className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold mb-1">Demo Mode — Your OTP</p>
                <p className="text-3xl font-bold tracking-[0.4em] text-amber-700">{simulatedOtp}</p>
                <p className="text-[10px] text-amber-600 mt-1">SMS delivery requires a connected SMS provider</p>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-4 text-center">Enter OTP</label>
                <div className="flex gap-3 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      data-testid={`input-otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-14 h-14 text-center text-xl font-bold border border-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground transition-all"
                    />
                  ))}
                </div>
                {errors.otp && <p className="text-red-700 text-xs mt-2 text-center">{errors.otp}</p>}
              </div>

              <button
                data-testid="button-verify-otp"
                type="submit"
                disabled={verifyOtp.isPending}
                className="w-full bg-foreground text-background py-3.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifyOtp.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify & Sign In
              </button>
            </form>

            <div className="text-center mt-6">
              <p className="text-xs text-muted-foreground mb-1">Didn't receive the code?</p>
              <button
                data-testid="button-resend-otp"
                onClick={handleResendOtp}
                disabled={countdown > 0 || sendOtp.isPending}
                className="text-xs font-semibold uppercase tracking-widest text-foreground underline underline-offset-4 hover:opacity-70 disabled:opacity-40 disabled:no-underline"
              >
                {countdown > 0 ? <span aria-live="polite">Resend in {countdown}s</span> : "Resend OTP"}
              </button>
            </div>
          </div>
        )}

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
