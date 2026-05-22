import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

type MessageType = "bot" | "user";
interface Message {
  id: number;
  type: MessageType;
  text: string;
  buttons?: { label: string; value: string }[];
}

type Step =
  | "menu"
  | "return_order" | "return_item" | "return_reason" | "return_mobile" | "return_done"
  | "exchange_order" | "exchange_item" | "exchange_for" | "exchange_mobile" | "exchange_done"
  | "policy" | "contact" | "typing";

interface ChatData {
  type: "return" | "exchange" | null;
  orderNumber: string;
  itemDescription: string;
  reason: string;
  extraDetails: string;
  mobile: string;
}

let msgId = 1;
function msg(type: MessageType, text: string, buttons?: { label: string; value: string }[]): Message {
  return { id: msgId++, type, text, buttons };
}

const RETURN_REASONS = [
  { label: "Wrong size / fit", value: "Wrong size or fit" },
  { label: "Defective / damaged", value: "Defective or damaged item" },
  { label: "Not as described", value: "Item not as described" },
  { label: "Changed my mind", value: "Changed mind" },
  { label: "Wrong item received", value: "Wrong item received" },
];

const POLICY_TEXT = `ACCENZA Return & Exchange Policy:

• Items can be returned or exchanged within 7 days of delivery.
• Items must be unused and in original condition with all tags and packaging.
• Cosmetics and fragrances are non-returnable once opened (hygiene policy).
• Sale items are not eligible for return.
• Refunds are processed within 5–7 business days to the original payment method.
• For exchanges, the new item ships once we receive the return.
• Damaged or defective items are eligible for full refund or replacement.`;

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>("menu");
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<ChatData>({
    type: null, orderNumber: "", itemDescription: "", reason: "", extraDetails: "", mobile: "",
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("open-accenza-chat", handler);
    return () => window.removeEventListener("open-accenza-chat", handler);
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) startChat();
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startChat() {
    const name = user?.name ? ` ${user.name.split(" ")[0]}` : "";
    setMessages([
      msg("bot", `Hi${name}! 💎 Welcome to ACCENZA Support.\n\nHow can I help you today?`, [
        { label: "↩ Return a product", value: "return" },
        { label: "🔄 Exchange a product", value: "exchange" },
        { label: "📋 Return & exchange policy", value: "policy" },
        { label: "📞 Contact us", value: "contact" },
      ]),
    ]);
    setStep("menu");
  }

  function addBotMsg(text: string, buttons?: { label: string; value: string }[]) {
    setMessages(prev => [...prev, msg("bot", text, buttons)]);
  }

  function addUserMsg(text: string) {
    setMessages(prev => [...prev, msg("user", text)]);
  }

  function handleButton(value: string) {
    if (step === "menu") {
      if (value === "return") {
        addUserMsg("↩ Return a product");
        setData(d => ({ ...d, type: "return" }));
        setTimeout(() => {
          addBotMsg("Sure! Let's process your return.\n\nPlease enter your **order number** (e.g. ACC-12345):");
          setStep("return_order");
        }, 400);
      } else if (value === "exchange") {
        addUserMsg("🔄 Exchange a product");
        setData(d => ({ ...d, type: "exchange" }));
        setTimeout(() => {
          addBotMsg("No problem! Let's set up your exchange.\n\nPlease enter your **order number** (e.g. ACC-12345):");
          setStep("exchange_order");
        }, 400);
      } else if (value === "policy") {
        addUserMsg("📋 Return & exchange policy");
        setTimeout(() => {
          addBotMsg(POLICY_TEXT, [
            { label: "↩ Return a product", value: "go_return" },
            { label: "🔄 Exchange a product", value: "go_exchange" },
            { label: "🏠 Back to menu", value: "back" },
          ]);
          setStep("policy");
        }, 400);
      } else if (value === "contact") {
        addUserMsg("📞 Contact us");
        setTimeout(() => {
          addBotMsg("You can reach our support team:\n\n📞 Phone: +91-9000000000\n📧 Email: care@accenza.in\n⏰ Hours: Mon–Sat, 10 AM – 7 PM\n\nOr submit a return/exchange request and we'll call you back!", [
            { label: "↩ Start a return", value: "go_return" },
            { label: "🔄 Start an exchange", value: "go_exchange" },
            { label: "🏠 Back to menu", value: "back" },
          ]);
          setStep("contact");
        }, 400);
      }
    } else if (step === "policy" || step === "contact") {
      if (value === "go_return") {
        addUserMsg("↩ Return a product");
        setData(d => ({ ...d, type: "return" }));
        setTimeout(() => {
          addBotMsg("Please enter your **order number** (e.g. ACC-12345):");
          setStep("return_order");
        }, 400);
      } else if (value === "go_exchange") {
        addUserMsg("🔄 Exchange a product");
        setData(d => ({ ...d, type: "exchange" }));
        setTimeout(() => {
          addBotMsg("Please enter your **order number** (e.g. ACC-12345):");
          setStep("exchange_order");
        }, 400);
      } else if (value === "back") {
        addUserMsg("🏠 Back to menu");
        setTimeout(() => {
          addBotMsg("How else can I help you?", [
            { label: "↩ Return a product", value: "return" },
            { label: "🔄 Exchange a product", value: "exchange" },
            { label: "📋 Return & exchange policy", value: "policy" },
            { label: "📞 Contact us", value: "contact" },
          ]);
          setStep("menu");
        }, 400);
      }
    } else if (step === "return_reason") {
      addUserMsg(value);
      setData(d => ({ ...d, reason: value }));
      setTimeout(() => {
        const mobile = user?.mobile || "";
        if (mobile) {
          addBotMsg(`Got it!\n\nShould we contact you on your registered number **+91 ${mobile}**?`, [
            { label: "✅ Yes, use this number", value: "use_registered" },
            { label: "📱 Use a different number", value: "use_other" },
          ]);
          setStep("return_mobile");
        } else {
          addBotMsg("Please enter your **mobile number** for us to contact you:");
          setStep("return_mobile");
        }
      }, 400);
    } else if (step === "return_mobile") {
      if (value === "use_registered") {
        addUserMsg("✅ Yes, use this number");
        setData(d => ({ ...d, mobile: user?.mobile || "" }));
        submitRequest({ ...data, mobile: user?.mobile || "", reason: data.reason });
      } else if (value === "use_other") {
        addUserMsg("📱 Use a different number");
        addBotMsg("Please enter your **10-digit mobile number**:");
      }
    } else if (step === "exchange_mobile") {
      if (value === "use_registered") {
        addUserMsg("✅ Yes, use this number");
        setData(d => ({ ...d, mobile: user?.mobile || "" }));
        submitRequest({ ...data, mobile: user?.mobile || "" });
      } else if (value === "use_other") {
        addUserMsg("📱 Use a different number");
        addBotMsg("Please enter your **10-digit mobile number**:");
      }
    }
  }

  function handleTextSubmit() {
    const val = inputValue.trim();
    if (!val) return;
    setInputValue("");

    if (step === "return_order") {
      addUserMsg(val);
      setData(d => ({ ...d, orderNumber: val }));
      setTimeout(() => {
        addBotMsg("Which item would you like to return? Please describe it briefly (e.g. \"Gold jhumka earrings\"):");
        setStep("return_item");
      }, 400);
    } else if (step === "return_item") {
      addUserMsg(val);
      setData(d => ({ ...d, itemDescription: val }));
      setTimeout(() => {
        addBotMsg("What is the reason for returning this item?", RETURN_REASONS);
        setStep("return_reason");
      }, 400);
    } else if (step === "return_mobile") {
      if (!/^[6-9]\d{9}$/.test(val)) {
        addBotMsg("That doesn't look like a valid 10-digit Indian mobile number. Please try again:");
        return;
      }
      addUserMsg(val);
      setData(d => ({ ...d, mobile: val }));
      submitRequest({ ...data, mobile: val });
    } else if (step === "exchange_order") {
      addUserMsg(val);
      setData(d => ({ ...d, orderNumber: val }));
      setTimeout(() => {
        addBotMsg("Which item would you like to exchange? Please describe it (e.g. \"Rose gold ring\"):");
        setStep("exchange_item");
      }, 400);
    } else if (step === "exchange_item") {
      addUserMsg(val);
      setData(d => ({ ...d, itemDescription: val }));
      setTimeout(() => {
        addBotMsg("What would you like to exchange it for? Please specify size, shade, or variant:");
        setStep("exchange_for");
      }, 400);
    } else if (step === "exchange_for") {
      addUserMsg(val);
      setData(d => ({ ...d, extraDetails: val, reason: `Exchange for: ${val}` }));
      setTimeout(() => {
        const mobile = user?.mobile || "";
        if (mobile) {
          addBotMsg(`Should we contact you on your registered number **+91 ${mobile}**?`, [
            { label: "✅ Yes, use this number", value: "use_registered" },
            { label: "📱 Use a different number", value: "use_other" },
          ]);
          setStep("exchange_mobile");
        } else {
          addBotMsg("Please enter your **10-digit mobile number** for us to contact you:");
          setStep("exchange_mobile");
        }
      }, 400);
    } else if (step === "exchange_mobile") {
      if (!/^[6-9]\d{9}$/.test(val)) {
        addBotMsg("That doesn't look like a valid 10-digit mobile number. Please try again:");
        return;
      }
      addUserMsg(val);
      setData(d => ({ ...d, mobile: val }));
      submitRequest({ ...data, mobile: val });
    }
  }

  async function submitRequest(finalData: ChatData) {
    setIsSubmitting(true);
    setStep("typing");
    addBotMsg("Submitting your request...");
    try {
      const response = await apiRequest("POST", "/api/support/request", {
        mobile: finalData.mobile,
        type: finalData.type,
        orderNumber: finalData.orderNumber,
        itemDescription: finalData.itemDescription,
        reason: finalData.reason,
        extraDetails: finalData.extraDetails,
      });
      const result = await response.json();
      setMessages(prev => prev.filter(m => m.text !== "Submitting your request..."));
      const typeLabel = finalData.type === "return" ? "Return" : "Exchange";
      addBotMsg(
        `✅ Your ${typeLabel} request has been submitted!\n\n🎫 Ticket Number: **${result.ticketNumber}**\n\nOur team will contact you on **+91 ${finalData.mobile}** within 24 hours.\n\n**Next steps:**\n• Keep the item ready for pickup\n• Our team will arrange a free pickup\n• Refund/exchange processed after inspection`,
        [{ label: "🏠 Back to main menu", value: "restart" }]
      );
      setStep("return_done");
    } catch {
      setMessages(prev => prev.filter(m => m.text !== "Submitting your request..."));
      addBotMsg("Sorry, something went wrong. Please try again or contact us at care@accenza.in", [
        { label: "🔄 Try again", value: "restart" },
      ]);
      setStep("menu");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleButtonClick(value: string) {
    if (value === "restart") {
      addUserMsg("🏠 Back to main menu");
      setData({ type: null, orderNumber: "", itemDescription: "", reason: "", extraDetails: "", mobile: "" });
      setTimeout(() => {
        addBotMsg("How else can I help you?", [
          { label: "↩ Return a product", value: "return" },
          { label: "🔄 Exchange a product", value: "exchange" },
          { label: "📋 Return & exchange policy", value: "policy" },
          { label: "📞 Contact us", value: "contact" },
        ]);
        setStep("menu");
      }, 400);
      return;
    }
    handleButton(value);
  }

  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          {i < text.split("\n").length - 1 && <br />}
        </span>
      );
    });
  }

  const needsInput = [
    "return_order", "return_item", "return_mobile",
    "exchange_order", "exchange_item", "exchange_for", "exchange_mobile"
  ].includes(step);

  const inputPlaceholder: Record<string, string> = {
    return_order: "Enter order number...",
    return_item: "Describe the item...",
    return_mobile: "Enter 10-digit mobile number...",
    exchange_order: "Enter order number...",
    exchange_item: "Describe the item...",
    exchange_for: "e.g. Different shade, Size S...",
    exchange_mobile: "Enter 10-digit mobile number...",
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open support chat"
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
          style={{ background: "linear-gradient(135deg, #8B6914, #c9a227)" }}
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-amber-100 flex flex-col overflow-hidden"
          style={{ height: "520px" }}
        >
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #8B6914, #c9a227)" }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm tracking-wide">ACCENZA Support</p>
                <p className="text-white/80 text-xs">Returns & Exchanges</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-amber-50/30">
            {messages.map(m => (
              <div key={m.id} className={`flex flex-col gap-1 ${m.type === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.type === "user"
                    ? "text-white rounded-br-sm"
                    : "bg-white text-gray-800 shadow-sm border border-amber-100 rounded-bl-sm"
                }`}
                  style={m.type === "user" ? { background: "linear-gradient(135deg, #8B6914, #c9a227)" } : {}}>
                  {renderText(m.text)}
                </div>
                {m.buttons && m.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-w-[90%]">
                    {m.buttons.map(btn => (
                      <button
                        key={btn.value}
                        onClick={() => handleButtonClick(btn.value)}
                        disabled={isSubmitting}
                        className="text-xs px-3 py-1.5 bg-white border border-amber-400 text-amber-700 rounded-full hover:bg-amber-50 transition-colors font-medium disabled:opacity-50"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {needsInput && (
            <div className="border-t border-amber-100 bg-white p-2 flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                placeholder={inputPlaceholder[step] || "Type your answer..."}
                disabled={isSubmitting}
                className="flex-1 text-sm border border-amber-200 rounded-full px-4 py-2 outline-none focus:border-amber-400 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!inputValue.trim() || isSubmitting}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #8B6914, #c9a227)" }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
