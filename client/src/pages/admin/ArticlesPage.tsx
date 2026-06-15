import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { Loader2, Plus, X, Printer, Barcode, Camera, Wand2, Check, ImageIcon, Upload, Download, Crop } from "lucide-react";
import type { Product } from "@shared/schema";
import { SUBCATEGORIES, getAllSubcategories, getSizesForProduct } from "@shared/schema";
import JsBarcode from "jsbarcode";

type AdminCategory = { id: number; name: string; subcategories: string[] };

const CSV_HEADERS = ["name", "description", "price", "costPrice", "category", "subcategory", "imageUrl", "imageUrl2", "sizes", "barcode"];

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Minimal RFC-4180-ish CSV parser that handles quoted fields with commas / newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

function BarcodeModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (product.barcode && svgRef.current) {
      JsBarcode(svgRef.current, product.barcode, {
        format: "EAN13",
        width: 2,
        height: 80,
        displayValue: true,
        font: "monospace",
        fontSize: 14,
        textMargin: 6,
      });
    }
  }, [product.barcode]);

  const handlePrint = () => {
    if (!svgRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Barcode - ${product.name}</title>
        <style>
          body { display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:100vh; margin:0; font-family:sans-serif; }
          .name { font-size:14px; font-weight:bold; margin-bottom:8px; text-transform:uppercase; letter-spacing:2px; }
          .price { font-size:12px; color:#666; margin-top:4px; }
        </style></head>
        <body>
          <div class="name">${product.name}</div>
          ${svgRef.current.outerHTML}
          <div class="price">MRP: Rs. ${product.price}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-widest">Barcode</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider">{product.name}</p>
          <div className="flex justify-center">
            <svg ref={svgRef} />
          </div>
          <p className="text-xs text-muted-foreground">MRP: Rs. {product.price}</p>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handlePrint}
            className="flex-1 bg-foreground text-background py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print Barcode
          </button>
          <button
            onClick={onClose}
            className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageAdjustModal({
  src,
  onApply,
  onClose,
}: {
  src: string;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const CONTAINER = 320;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPanX((p) => p + dx);
    setPanY((p) => p + dy);
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragging.current = true;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setPanX((p) => p + dx);
    setPanY((p) => p + dy);
  }, []);

  const handleTouchEnd = useCallback(() => { dragging.current = false; }, []);

  const handleApply = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;

    const OUTPUT = 1024;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    // The image is displayed with object-fit: contain inside 320x320
    // Compute the rendered size of the image inside the container
    const scale = Math.min(CONTAINER / nw, CONTAINER / nh);
    const renderedW = nw * scale * zoom;
    const renderedH = nh * scale * zoom;

    // The image center is offset by panX, panY from the container center
    // Image left-top in container coords:
    const imgLeft = (CONTAINER - renderedW) / 2 + panX;
    const imgTop = (CONTAINER - renderedH) / 2 + panY;

    // Viewport (0,0)-(320,320) mapped to image source coords:
    // containerX = imgLeft + srcX * (renderedW / nw)
    // => srcX = (containerX - imgLeft) / (renderedW / nw)
    const pixelScale = renderedW / nw; // pixels per source pixel
    const srcX = (0 - imgLeft) / pixelScale;
    const srcY = (0 - imgTop) / pixelScale;
    const srcW = CONTAINER / pixelScale;
    const srcH = CONTAINER / pixelScale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT, OUTPUT);

    const dataUrl = canvas.toDataURL("image/png");
    onApply(dataUrl);
  }, [zoom, panX, panY, onApply]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background border border-border p-6 space-y-4 w-[380px] max-w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Adjust Image</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop preview */}
        <div
          className="relative mx-auto bg-secondary/30 overflow-hidden cursor-move select-none"
          style={{ width: CONTAINER, height: CONTAINER }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            ref={imgRef}
            src={src}
            alt="Adjust preview"
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
              maxWidth: "none",
              maxHeight: "none",
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transformOrigin: "center center",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest font-semibold flex justify-between">
            <span>Zoom</span>
            <span className="text-muted-foreground font-normal normal-case">{zoom.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-foreground"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="flex-1 bg-foreground text-background py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90"
          >
            Apply
          </button>
          <button
            onClick={onClose}
            className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type Upload = { id: string; preview: string; mime: string };

export default function ArticlesPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    costPrice: "",
    category: "",
    subcategory: "",
  });
  const [autoSizes, setAutoSizes] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  // Image selection state — up to 2 uploaded + up to 2 AI generated; admin picks 2.
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [aiResults, setAiResults] = useState<{ productShot: string | null; modelShot: string | null } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]); // ordered: [primary, secondary]
  const [useUrlMode, setUseUrlMode] = useState(false);
  const [urlInputs, setUrlInputs] = useState({ a: "", b: "" });
  const [savingImages, setSavingImages] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{ index: number; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const { data: apiCategories = [] } = useQuery<AdminCategory[]>({
    queryKey: ["/api/admin/categories"],
  });

  // Use API-driven categories; fall back to hardcoded 4 if not yet loaded.
  const categoryNames = apiCategories.length > 0
    ? apiCategories.map((c) => c.name)
    : ["Jewellery", "Cosmetics", "Handbags", "Accessories"];

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products/category/:category"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/admin/products", data);
      return res.json();
    },
    onSuccess: (newProduct: Product) => {
      invalidateProducts();
      setBarcodeProduct(newProduct);
      setShowAddForm(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setForm({ name: "", description: "", price: "", costPrice: "", category: "", subcategory: "" });
    setAutoSizes([]);
    setSelectedSizes([]);
    setUploads([]);
    setAiResults(null);
    setSelectedImages([]);
    setUseUrlMode(false);
    setUrlInputs({ a: "", b: "" });
    setAiError(null);
  };

  const handleCategoryChange = (category: string) => {
    setForm((prev) => ({ ...prev, category, subcategory: "" }));
    setAutoSizes([]);
    setSelectedSizes([]);
  };

  const handleSubcategoryChange = (subcategory: string) => {
    setForm((prev) => ({ ...prev, subcategory }));
    const sizes = getSizesForProduct(form.category, subcategory);
    setAutoSizes(sizes);
    setSelectedSizes(sizes); // suggested default — admin can toggle off
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const handleAdjustApply = (dataUrl: string) => {
    if (!adjustModal) return;
    const { index, url } = adjustModal;
    // Replace in candidates array — could be an upload or AI result
    const cand = candidates[index];
    if (!cand) return;
    // If it's an uploaded photo, update uploads
    if (cand.label.startsWith("Uploaded")) {
      const uploadIdx = index; // uploads are first in candidates
      setUploads((prev) => prev.map((u, i) => i === uploadIdx ? { ...u, preview: dataUrl } : u));
    } else if (cand.label === "AI · Product") {
      setAiResults((prev) => prev ? { ...prev, productShot: dataUrl } : prev);
    } else if (cand.label === "AI · Model") {
      setAiResults((prev) => prev ? { ...prev, modelShot: dataUrl } : prev);
    }
    // Update selectedImages if this url was selected
    setSelectedImages((prev) => prev.map((s) => s === url ? dataUrl : s));
    setAdjustModal(null);
  };

  // Subcategories from DB categories first, then fall back to hardcoded map.
  const subcategoryList: string[] = (() => {
    if (!form.category) return [];
    const apiCat = apiCategories.find((c) => c.name === form.category);
    if (apiCat && apiCat.subcategories.length > 0) return apiCat.subcategories;
    return SUBCATEGORIES[form.category] ? getAllSubcategories(SUBCATEGORIES[form.category]) : [];
  })();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = ev.target?.result as string;
        setUploads((prev) =>
          prev.length >= 2
            ? prev
            : [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, preview, mime: file.type }]
        );
      };
      reader.readAsDataURL(file);
    });
    setAiError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => {
      const removed = prev.find((u) => u.id === id);
      if (removed) setSelectedImages((sel) => sel.filter((s) => s !== removed.preview));
      return prev.filter((u) => u.id !== id);
    });
  };

  const handleAIGenerate = async () => {
    const base = uploads[0];
    if (!base || !form.category || !form.subcategory) return;
    setAiGenerating(true);
    setAiResults(null);
    setAiError(null);
    try {
      const res = await apiRequest("POST", "/api/admin/ai-images/generate", {
        imageBase64: base.preview,
        mimeType: base.mime,
        category: form.category,
        subcategory: form.subcategory,
        productName: form.name || form.subcategory,
      });
      const data = await res.json();
      if (!data.productShot && !data.modelShot) {
        setAiError("AI could not generate images from this photo. Try a clearer photo on a plain background.");
        return;
      }
      setAiResults(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("503")) {
        setAiError("AI image generation is not configured on the server (OPENAI_API_KEY missing).");
      } else if (msg.includes("413")) {
        setAiError("That photo is too large. Please use a smaller image (under ~10 MB).");
      } else {
        setAiError(msg || "Failed to connect to AI service. Please try again.");
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleImageSelect = (url: string) => {
    setSelectedImages((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= 2) return prev; // cap at 2 — deselect one first
      return [...prev, url];
    });
  };

  const canGenerate = uploads.length >= 1 && !!form.category && !!form.subcategory;

  // Candidate images shown for selection: uploaded photos + AI results.
  const candidates: { url: string; label: string }[] = [
    ...uploads.map((u, i) => ({ url: u.preview, label: `Uploaded ${i + 1}` })),
    ...(aiResults?.productShot ? [{ url: aiResults.productShot, label: "AI · Product" }] : []),
    ...(aiResults?.modelShot ? [{ url: aiResults.modelShot, label: "AI · Model" }] : []),
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let imgs: string[] = useUrlMode
      ? [urlInputs.a, urlInputs.b].map((s) => s.trim()).filter(Boolean)
      : selectedImages;

    if (imgs.length === 0) {
      setAiError(useUrlMode ? "Enter at least one image URL." : "Select at least one image (you can pick up to two).");
      return;
    }

    setSavingImages(true);
    try {
      // Persist any base64 (uploaded / AI) images to disk; pass through plain URLs.
      const finalUrls: string[] = [];
      for (const img of imgs) {
        if (img.startsWith("data:")) {
          try {
            const saveRes = await apiRequest("POST", "/api/admin/ai-images/save", { imageBase64: img });
            const saved = await saveRes.json();
            finalUrls.push(saved.url);
          } catch (err) {
            console.error("Failed to save image:", err);
          }
        } else {
          finalUrls.push(img);
        }
      }
      if (finalUrls.length === 0) {
        setAiError("Could not save the selected images. Please try again.");
        return;
      }
      createMutation.mutate({
        ...form,
        imageUrl: finalUrls[0],
        imageUrl2: finalUrls[1] || "",
        sizes: selectedSizes,
      });
    } finally {
      setSavingImages(false);
    }
  };

  // ── CSV export ──
  const exportCsv = () => {
    if (!products || products.length === 0) return;
    const lines = [CSV_HEADERS.join(",")];
    for (const p of products) {
      lines.push([
        p.name,
        p.description,
        p.price,
        p.costPrice ?? "0",
        p.category,
        p.subcategory ?? "",
        p.imageUrl,
        (p as any).imageUrl2 ?? "",
        (p.sizes || []).join("|"),
        p.barcode ?? "",
      ].map(csvEscape).join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accenza-articles-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── CSV import ──
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
      if (rows.length < 2) {
        setImportResult("CSV is empty or has no data rows.");
        return;
      }
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name: string) => headers.indexOf(name.toLowerCase());
      const iName = idx("name"), iDesc = idx("description"), iPrice = idx("price"), iCost = idx("costPrice"),
        iCat = idx("category"), iSub = idx("subcategory"), iImg = idx("imageUrl"), iImg2 = idx("imageUrl2"), iSizes = idx("sizes");

      if (iName < 0 || iPrice < 0 || iCat < 0 || iImg < 0) {
        setImportResult("CSV must include at least these columns: name, price, category, imageUrl.");
        return;
      }

      const payload = rows.slice(1)
        .filter((r) => (r[iName] || "").trim())
        .map((r) => ({
          name: (r[iName] || "").trim(),
          description: iDesc >= 0 ? (r[iDesc] || "").trim() : "",
          price: (r[iPrice] || "").trim(),
          costPrice: iCost >= 0 ? ((r[iCost] || "").trim() || "0") : "0",
          category: (r[iCat] || "").trim(),
          subcategory: iSub >= 0 ? (r[iSub] || "").trim() : "",
          imageUrl: (r[iImg] || "").trim(),
          imageUrl2: iImg2 >= 0 ? (r[iImg2] || "").trim() : "",
          sizes: iSizes >= 0 ? (r[iSizes] || "").split("|").map((s) => s.trim()).filter(Boolean) : [],
        }));

      if (payload.length === 0) {
        setImportResult("No valid rows found in the CSV.");
        return;
      }

      const res = await apiRequest("POST", "/api/admin/products/bulk", { products: payload });
      const data = await res.json();
      invalidateProducts();
      setImportResult(`Imported ${data.created} article(s).${data.failed ? ` ${data.failed} row(s) failed.` : ""}`);
    } catch (err) {
      setImportResult("Import failed. Please check the CSV format and try again.");
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
          <p className="text-muted-foreground text-sm mt-1">Product catalogue with EAN-13 barcodes</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import CSV
          </button>
          <button
            onClick={exportCsv}
            disabled={!products || products.length === 0}
            className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-foreground text-background px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Article
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-6 text-sm border border-border bg-secondary/40 px-4 py-3 flex items-center justify-between gap-3">
          <span>{importResult}</span>
          <button onClick={() => setImportResult(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-background border border-border p-6 mb-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Article Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="e.g. Gold Jhumka Earrings"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground min-h-[80px]"
                placeholder="Product description..."
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Selling Price (Rs.)</label>
              <input
                type="text"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, "") })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="999"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Cost Price (Rs.)</label>
              <input
                type="text"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                placeholder="500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Category</label>
              <select
                value={form.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                required
              >
                <option value="">Select category</option>
                {categoryNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">Subcategory</label>
              <select
                value={form.subcategory}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                required
                disabled={!form.category}
              >
                <option value="">Select subcategory</option>
                {subcategoryList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {autoSizes.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-2">
                Sizes <span className="text-muted-foreground font-normal normal-case tracking-normal">(tap to select / deselect)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {autoSizes.map((size) => {
                  const active = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className={`px-2.5 py-1 text-xs font-medium border transition-colors ${
                        active
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Product Images Section ── */}
          <div className="border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] uppercase tracking-widest font-semibold">
                Product Images <span className="text-muted-foreground font-normal normal-case tracking-normal">(select up to 2)</span>
              </label>
              <button
                type="button"
                onClick={() => { setUseUrlMode((v) => !v); setAiError(null); }}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {useUrlMode ? "Use Camera / Upload + AI" : "Or enter URLs manually"}
              </button>
            </div>

            {useUrlMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1 text-muted-foreground">Image URL 1 (primary)</label>
                  <input
                    type="url"
                    value={urlInputs.a}
                    onChange={(e) => setUrlInputs({ ...urlInputs, a: e.target.value })}
                    className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1 text-muted-foreground">Image URL 2 (optional)</label>
                  <input
                    type="url"
                    value={urlInputs.b}
                    onChange={(e) => setUrlInputs({ ...urlInputs, b: e.target.value })}
                    className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Upload controls */}
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploads.length >= 2}
                    className="flex items-center gap-2 border border-border px-4 py-2 text-xs uppercase tracking-widest font-semibold hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-4 h-4" />
                    {uploads.length === 0 ? "Upload Photos" : uploads.length >= 2 ? "Max 2 photos" : "Add Another Photo"}
                  </button>
                  <span className="text-xs text-muted-foreground">{uploads.length}/2 uploaded</span>
                </div>

                {/* Generate with AI */}
                <div>
                  <button
                    type="button"
                    onClick={handleAIGenerate}
                    disabled={!canGenerate || aiGenerating}
                    title={!form.category || !form.subcategory ? "Select category and subcategory first" : uploads.length === 0 ? "Upload a photo first" : ""}
                    className="flex items-center gap-2 bg-foreground text-background px-4 py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {aiGenerating ? "Generating..." : "Generate with AI"}
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    AI creates a product-on-stand shot and an on-model shot from your first uploaded photo.
                  </p>
                </div>

                {aiGenerating && (
                  <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <span>AI is creating your images — this takes about 20–30 seconds...</span>
                  </div>
                )}

                {aiError && (
                  <p className="text-xs text-red-500 border border-red-200 bg-red-50 px-3 py-2">{aiError}</p>
                )}

                {/* Candidate grid — pick up to 2 */}
                {candidates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                      Select up to 2 images for this article ({selectedImages.length}/2 selected)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {candidates.map((cand, i) => {
                        const order = selectedImages.indexOf(cand.url);
                        const isSelected = order >= 0;
                        const isUpload = cand.label.startsWith("Uploaded");
                        const uploadId = isUpload ? uploads[i]?.id : undefined;
                        return (
                          <div key={`${cand.label}-${i}`} className="relative">
                            <button
                              type="button"
                              onClick={() => toggleImageSelect(cand.url)}
                              className={`relative block w-full border-2 p-1 transition-all text-left ${
                                isSelected ? "border-yellow-500" : "border-border hover:border-foreground/40"
                              }`}
                            >
                              <img src={cand.url} alt={cand.label} className="w-full aspect-square object-cover" />
                              {isSelected && (
                                <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-yellow-500 text-white text-[10px] font-bold flex items-center justify-center">
                                  {order + 1}
                                </span>
                              )}
                              <div className="mt-1.5 px-1 pb-1 flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-widest font-semibold">{cand.label}</span>
                                {isSelected && (
                                  <Check className="w-3 h-3 text-yellow-600" />
                                )}
                              </div>
                            </button>
                            {isUpload && uploadId && (
                              <button
                                type="button"
                                onClick={() => removeUpload(uploadId)}
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
                                aria-label="Remove photo"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setAdjustModal({ index: i, url: cand.url })}
                              className="absolute bottom-8 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
                              aria-label="Adjust image"
                              title="Crop / Adjust"
                            >
                              <Crop className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      The first selected image is the primary (shown on cards & listings); the second appears in the product gallery.
                    </p>
                  </div>
                )}

                {candidates.length === 0 && (
                  <div className="border border-dashed border-border p-6 flex flex-col items-center justify-center gap-2 text-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">Upload photos and/or generate with AI, then pick up to 2 images.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending || savingImages}
              className="bg-foreground text-background px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {(createMutation.isPending || savingImages) && <Loader2 className="w-3 h-3 animate-spin" />}
              Add Article
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); resetForm(); }}
              className="border border-border px-6 py-2.5 text-xs uppercase tracking-widest font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="bg-background border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Image</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Barcode</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Selling Price</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Cost Price</th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!products || products.length === 0) ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No articles yet. Click "Add Article" to create one.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 text-muted-foreground">#{p.id}</td>
                      <td className="px-4 py-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-10 h-12 object-cover border border-border bg-secondary"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-12 border border-border bg-secondary flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.barcode || "—"}</td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category} / {p.subcategory}</td>
                      <td className="px-4 py-3">Rs. {p.price}</td>
                      <td className="px-4 py-3 text-muted-foreground">Rs. {p.costPrice || "0"}</td>
                      <td className="px-4 py-3">
                        {p.barcode ? (
                          <button
                            onClick={() => setBarcodeProduct(p)}
                            className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 hover:bg-secondary transition-colors"
                          >
                            <Barcode className="w-3.5 h-3.5" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {barcodeProduct && (
        <BarcodeModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
      {adjustModal && (
        <ImageAdjustModal
          src={adjustModal.url}
          onApply={handleAdjustApply}
          onClose={() => setAdjustModal(null)}
        />
      )}
    </AdminLayout>
  );
}
