import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, AlertCircle } from "lucide-react";
import api from "@/lib/api";

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  columns: Array<{ name: string; dtype: string }>;
  onSuccess: (mapping: Record<string, string>) => void;
}

export function ColumnMappingModal({
  isOpen,
  onClose,
  datasetId,
  columns,
  onSuccess,
}: ColumnMappingModalProps) {
  const [dateCol, setDateCol] = useState("");
  const [revenueCol, setRevenueCol] = useState("");
  const [quantityCol, setQuantityCol] = useState("");
  const [categoryCol, setCategoryCol] = useState("");
  const [regionCol, setRegionCol] = useState("");
  const [customerCol, setCustomerCol] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dateCol || !revenueCol || !quantityCol || !categoryCol || !regionCol) {
      setError("Please fill all required mapping fields.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const res = await api.post(`/datasets/${datasetId}/map`, {
        date_col: dateCol,
        revenue_col: revenueCol,
        quantity_col: quantityCol,
        category_col: categoryCol,
        region_col: regionCol,
        customer_col: customerCol || null,
      });
      onSuccess(res.data.column_mapping);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail?.message || "Failed to save mapping.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-background border-border shadow-2xl glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Configure Column Mapping
          </DialogTitle>
          <DialogDescription>
            Map your dataset fields to the standard schema to enable Sales Analytics.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {error && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="date_col" className="text-xs font-semibold">
                Date Column <span className="text-destructive">*</span>
              </Label>
              <select
                id="date_col"
                value={dateCol}
                onChange={(e) => setDateCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="revenue_col" className="text-xs font-semibold">
                Revenue / Sales Column <span className="text-destructive">*</span>
              </Label>
              <select
                id="revenue_col"
                value={revenueCol}
                onChange={(e) => setRevenueCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="quantity_col" className="text-xs font-semibold">
                Quantity / Units Column <span className="text-destructive">*</span>
              </Label>
              <select
                id="quantity_col"
                value={quantityCol}
                onChange={(e) => setQuantityCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="category_col" className="text-xs font-semibold">
                Product / Category Column <span className="text-destructive">*</span>
              </Label>
              <select
                id="category_col"
                value={categoryCol}
                onChange={(e) => setCategoryCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="region_col" className="text-xs font-semibold">
                Region / Location Column <span className="text-destructive">*</span>
              </Label>
              <select
                id="region_col"
                value={regionCol}
                onChange={(e) => setRegionCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer_col" className="text-xs font-semibold">
                Customer / Account ID Column <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <select
                id="customer_col"
                value={customerCol}
                onChange={(e) => setCustomerCol(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">-- Select Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dtype})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Mapping"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
