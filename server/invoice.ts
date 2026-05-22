import type { Order, OrderItem, User, Product } from "@shared/schema";
import { sendSms } from "./sms";

const ACCENZA_GSTIN = process.env.ACCENZA_GSTIN || "29AAAAA0000A1Z5";
const ACCENZA_STATE = "Maharashtra";
const ACCENZA_STATE_CODE = "27";
const ACCENZA_ADDRESS = "Accenza, Mumbai, Maharashtra, India";
const ACCENZA_EMAIL = "care@accenza.in";
const ACCENZA_PHONE = "+91-9000000000";

export interface GSTBreakdown {
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
  totalWithGST: number;
  hsnCode: string;
  isInterState: boolean;
}

function getGSTRate(category: string, _pricePerUnit: number): { rate: number; hsn: string } {
  const cat = category.toLowerCase();
  if (cat === "jewellery")   return { rate: 3,  hsn: "7113" }; // precious/imitation jewellery
  if (cat === "cosmetics")   return { rate: 18, hsn: "3304" }; // beauty/makeup products
  if (cat === "handbags")    return { rate: 12, hsn: "4202" }; // handbags/wallets
  if (cat === "accessories") return { rate: 12, hsn: "6217" }; // clothing accessories
  return { rate: 12, hsn: "6217" };
}

export function calculateGST(
  category: string,
  pricePerUnit: number,
  quantity: number,
  customerState: string
): GSTBreakdown {
  const { rate, hsn } = getGSTRate(category, pricePerUnit);
  const isInterState = customerState.trim().toLowerCase() !== ACCENZA_STATE.toLowerCase();

  const totalWithGST = pricePerUnit * quantity;
  const taxableAmount = Math.round((totalWithGST / (1 + rate / 100)) * 100) / 100;
  const totalGST = Math.round((totalWithGST - taxableAmount) * 100) / 100;

  return {
    taxableAmount,
    gstRate: rate,
    cgst: isInterState ? 0 : Math.round((totalGST / 2) * 100) / 100,
    sgst: isInterState ? 0 : Math.round((totalGST / 2) * 100) / 100,
    igst: isInterState ? totalGST : 0,
    totalGST,
    totalWithGST,
    hsnCode: hsn,
    isInterState,
  };
}

let invoiceCounter = parseInt(process.env.INVOICE_START || "1", 10);

export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
  const seq = String(invoiceCounter++).padStart(5, "0");
  return `ACCENZA/MH/${fy}/${seq}`;
}

export interface InvoiceLineItem {
  name: string;
  category: string;
  size?: string | null;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderNumber: string;
  invoiceDate: string;
  customer: { name: string; mobile: string; email?: string; address: string; state: string; pincode: string };
  items: InvoiceLineItem[];
  subtotalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalGST: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentId?: string;
  isInterState: boolean;
}

export function buildInvoiceData(
  order: Order,
  orderItems: (OrderItem & { productName?: string; productImage?: string; productCategory?: string })[],
  user: User,
  products: Product[]
): InvoiceData {
  const isInterState = order.shippingState.trim().toLowerCase() !== ACCENZA_STATE.toLowerCase();
  const lines: InvoiceLineItem[] = [];

  let subtotalTaxable = 0;
  let totalCGST = 0, totalSGST = 0, totalIGST = 0, totalGST = 0;

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.productId);
    const category = product?.category || item.productCategory || "Accessories";
    const unitPrice = Number(item.price);
    const gst = calculateGST(category, unitPrice, item.quantity, order.shippingState);

    subtotalTaxable += gst.taxableAmount;
    totalCGST += gst.cgst;
    totalSGST += gst.sgst;
    totalIGST += gst.igst;
    totalGST += gst.totalGST;

    lines.push({
      name: product?.name || item.productName || "Product",
      category,
      size: item.size,
      hsnCode: gst.hsnCode,
      quantity: item.quantity,
      unitPrice,
      taxableAmount: gst.taxableAmount,
      gstRate: gst.gstRate,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      totalGST: gst.totalGST,
      total: gst.totalWithGST,
    });
  }

  return {
    invoiceNumber: order.invoiceNumber || generateInvoiceNumber(),
    orderNumber: order.orderNumber,
    invoiceDate: new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    customer: {
      name: order.shippingName,
      mobile: order.shippingPhone,
      email: user.email || undefined,
      address: `${order.shippingAddress}, ${order.shippingCity}`,
      state: order.shippingState,
      pincode: order.shippingPincode,
    },
    items: lines,
    subtotalTaxable: Math.round(subtotalTaxable * 100) / 100,
    totalCGST: Math.round(totalCGST * 100) / 100,
    totalSGST: Math.round(totalSGST * 100) / 100,
    totalIGST: Math.round(totalIGST * 100) / 100,
    totalGST: Math.round(totalGST * 100) / 100,
    discount: Number(order.discountAmount),
    grandTotal: Number(order.totalAmount),
    paymentMethod: order.paymentMethod,
    paymentId: order.razorpayPaymentId || undefined,
    isInterState,
  };
}

export function generateInvoiceHTML(inv: InvoiceData): string {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const itemRows = inv.items.map(item => `
    <tr>
      <td>${item.name}${item.size ? ` <span style="color:#666;font-size:11px">(${item.size})</span>` : ""}</td>
      <td style="text-align:center">${item.hsnCode}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${fmt(item.unitPrice)}</td>
      <td style="text-align:right">${fmt(item.taxableAmount)}</td>
      <td style="text-align:center">${item.gstRate}%</td>
      ${inv.isInterState
        ? `<td style="text-align:right">${fmt(item.igst)}</td>`
        : `<td style="text-align:right">${fmt(item.cgst)}<br/>${fmt(item.sgst)}</td>`
      }
      <td style="text-align:right"><strong>${fmt(item.total)}</strong></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${inv.invoiceNumber}</title>
<style>
  body { font-family: Georgia, serif; font-size: 13px; color: #1a0a00; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #8B6914; padding-bottom: 16px; }
  .brand { font-size: 28px; font-weight: 900; letter-spacing: 3px; color: #8B6914; }
  .brand span { color: #555; font-size: 11px; font-weight: 400; display: block; letter-spacing: 2px; margin-top: 2px; font-family: Arial; }
  .invoice-meta { text-align: right; }
  .invoice-meta h2 { margin: 0 0 4px; font-size: 18px; color: #8B6914; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .box { background: #fdf8f0; padding: 12px 16px; border: 1px solid #e8d5a3; }
  .box h4 { margin: 0 0 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #8B6914; font-family: Arial; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #8B6914; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-family: Arial; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0e4c4; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .totals { margin-left: auto; width: 320px; }
  .totals table td { padding: 5px 10px; }
  .grand-total td { font-size: 15px; font-weight: bold; background: #8B6914; color: #fff; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e8d5a3; font-size: 11px; color: #666; text-align: center; font-family: Arial; }
  .paid-badge { display: inline-block; background: #16a34a; color: #fff; padding: 2px 10px; font-size: 11px; font-weight: bold; letter-spacing: 1px; border-radius: 2px; font-family: Arial; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">ACCENZA <span>JEWELLERY · COSMETICS · HANDBAGS · ACCESSORIES</span></div>
    <div style="margin-top:8px; font-size:12px; color:#444; font-family:Arial;">
      ${ACCENZA_ADDRESS}<br/>
      GSTIN: <strong>${ACCENZA_GSTIN}</strong><br/>
      ${ACCENZA_EMAIL} · ${ACCENZA_PHONE}
    </div>
  </div>
  <div class="invoice-meta">
    <h2>TAX INVOICE</h2>
    <div><strong>${inv.invoiceNumber}</strong></div>
    <div style="color:#666; font-size:12px; font-family:Arial;">Date: ${inv.invoiceDate}</div>
    <div style="font-family:Arial;">Order: <strong>${inv.orderNumber}</strong></div>
    ${inv.paymentId ? `<div style="font-size:11px; color:#666; font-family:Arial;">Payment ID: ${inv.paymentId}</div>` : ""}
    <div style="margin-top:8px"><span class="paid-badge">✓ PAID</span></div>
  </div>
</div>

<div class="grid">
  <div class="box">
    <h4>Bill To</h4>
    <strong>${inv.customer.name}</strong><br/>
    ${inv.customer.address}<br/>
    ${inv.customer.state} – ${inv.customer.pincode}<br/>
    📱 ${inv.customer.mobile}
    ${inv.customer.email ? `<br/>✉ ${inv.customer.email}` : ""}
  </div>
  <div class="box">
    <h4>Sold By</h4>
    <strong>Accenza</strong><br/>
    GSTIN: ${ACCENZA_GSTIN}<br/>
    State: ${ACCENZA_STATE} (${ACCENZA_STATE_CODE})<br/>
    Supply type: ${inv.isInterState ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align:center">HSN</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th>
      <th style="text-align:right">Taxable</th>
      <th style="text-align:center">GST%</th>
      <th style="text-align:right">${inv.isInterState ? "IGST" : "CGST / SGST"}</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr><td>Taxable Amount</td><td style="text-align:right">${fmt(inv.subtotalTaxable)}</td></tr>
    ${inv.isInterState
      ? `<tr><td>IGST</td><td style="text-align:right">${fmt(inv.totalIGST)}</td></tr>`
      : `<tr><td>CGST</td><td style="text-align:right">${fmt(inv.totalCGST)}</td></tr>
         <tr><td>SGST</td><td style="text-align:right">${fmt(inv.totalSGST)}</td></tr>`
    }
    ${inv.discount > 0 ? `<tr><td style="color:#16a34a;">Discount</td><td style="text-align:right; color:#16a34a;">– ${fmt(inv.discount)}</td></tr>` : ""}
    <tr class="grand-total">
      <td>Grand Total</td>
      <td style="text-align:right">${fmt(inv.grandTotal)}</td>
    </tr>
  </table>
</div>

<div style="margin-top:20px; font-size:12px; color:#444; font-family:Arial;">
  <strong>Payment Method:</strong> ${inv.paymentMethod.toUpperCase()}
</div>

<div class="footer">
  This is a computer-generated invoice and does not require a physical signature.<br/>
  For queries: ${ACCENZA_EMAIL} · ${ACCENZA_PHONE}<br/>
  <strong>Thank you for shopping with ACCENZA!</strong>
</div>

</body>
</html>`;
}

export async function sendInvoiceWhatsApp(
  mobile: string,
  invoiceNumber: string,
  orderNumber: string,
  grandTotal: number,
  _invoiceHtml: string
): Promise<void> {
  const message =
    `✨ *ACCENZA*\n\n` +
    `✅ Your order *${orderNumber}* is confirmed!\n\n` +
    `🧾 Invoice No: *${invoiceNumber}*\n` +
    `💳 Amount Paid: *₹${grandTotal.toLocaleString("en-IN")}*\n\n` +
    `Your GST-compliant invoice has been sent to your email.\n\n` +
    `Thank you for shopping with ACCENZA! 💎`;

  try {
    await sendSms(mobile, message);
  } catch (err) {
    console.error("Failed to send WhatsApp invoice:", err);
  }
}

let _transporter: any = null;

async function getTransporter() {
  if (_transporter) return _transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  try {
    const mod = await import("nodemailer");
    const nm = mod.default ?? mod;
    _transporter = nm.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return _transporter;
  } catch {
    console.warn("[email] nodemailer not installed — run: npm install nodemailer");
    return null;
  }
}

export async function sendInvoiceEmail(
  email: string,
  invoiceNumber: string,
  orderNumber: string,
  invoiceHtml: string
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Invoice email → ${email}  |  Invoice ${invoiceNumber}  |  Order ${orderNumber}`);
    return;
  }

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn("[email] SMTP not configured — skipping invoice email");
    return;
  }

  const from = process.env.SMTP_FROM || "ACCENZA <care@accenza.in>";
  await transporter.sendMail({
    from,
    to: email,
    subject: `Your ACCENZA Invoice ${invoiceNumber} — Order ${orderNumber}`,
    html: invoiceHtml,
    text: `Thank you for your ACCENZA order ${orderNumber}. Invoice number: ${invoiceNumber}.`,
  });
}
