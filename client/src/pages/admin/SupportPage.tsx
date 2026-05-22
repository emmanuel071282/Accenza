import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, RefreshCw, MessageCircle, Package, ArrowLeftRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SupportRequest } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const STATUSES = ["pending", "processing", "resolved", "rejected"];

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data: requests = [], isLoading, refetch } = useQuery<SupportRequest[]>({
    queryKey: ["/api/admin/support-requests"],
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/support-requests/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-requests"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter || r.type === filter);

  const counts = {
    all: requests.length,
    return: requests.filter(r => r.type === "return").length,
    exchange: requests.filter(r => r.type === "exchange").length,
    pending: requests.filter(r => r.status === "pending").length,
    processing: requests.filter(r => r.status === "processing").length,
    resolved: requests.filter(r => r.status === "resolved").length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Support Requests</h1>
            <p className="text-sm text-gray-500">Returns & Exchange requests from customers</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
          {[
            { key: "all", label: "All Requests", count: counts.all, color: "bg-gray-100 text-gray-700" },
            { key: "pending", label: "Pending", count: counts.pending, color: "bg-yellow-100 text-yellow-700" },
            { key: "processing", label: "Processing", count: counts.processing, color: "bg-blue-100 text-blue-700" },
            { key: "resolved", label: "Resolved", count: counts.resolved, color: "bg-green-100 text-green-700" },
            { key: "return", label: "Returns", count: counts.return, color: "bg-orange-100 text-orange-700" },
            { key: "exchange", label: "Exchanges", count: counts.exchange, color: "bg-purple-100 text-purple-700" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              data-testid={`button-filter-${tab.key}`}
              className={`rounded-lg px-3 py-2 text-center transition-all border-2 ${
                filter === tab.key ? "border-orange-400 shadow-sm" : "border-transparent"
              } ${tab.color}`}
            >
              <div className="text-xl font-bold">{tab.count}</div>
              <div className="text-xs font-medium">{tab.label}</div>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading requests...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No requests found</p>
            <p className="text-gray-400 text-sm mt-1">Support requests will appear here when customers submit them</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow" data-testid={`card-support-${req.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-sm text-gray-900">{req.ticketNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[req.status] || "bg-gray-100 text-gray-600"}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                        req.type === "return" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"
                      }`}>
                        {req.type === "return" ? <Package className="w-3 h-3" /> : <ArrowLeftRight className="w-3 h-3" />}
                        {req.type.charAt(0).toUpperCase() + req.type.slice(1)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                      <span><span className="text-gray-400">Order:</span> <span className="font-medium text-gray-800">{req.orderNumber}</span></span>
                      <span><span className="text-gray-400">Mobile:</span> <span className="font-medium text-gray-800">+91 {req.mobile}</span></span>
                      <span className="sm:col-span-2"><span className="text-gray-400">Item:</span> {req.itemDescription}</span>
                      <span className="sm:col-span-2"><span className="text-gray-400">Reason:</span> {req.reason}</span>
                      {req.extraDetails && (
                        <span className="sm:col-span-2"><span className="text-gray-400">Details:</span> {req.extraDetails}</span>
                      )}
                      <span className="text-gray-400 text-xs">{new Date(req.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <select
                      value={req.status}
                      onChange={e => updateStatus.mutate({ id: req.id, status: e.target.value })}
                      data-testid={`select-status-${req.id}`}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400 cursor-pointer"
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
