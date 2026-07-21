import { useState, useEffect } from "react";
import { Sparkles, X, Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface AIEngineProps {
  datasetId: string;
  chartType: string;
  chartData: any;
  onClose: () => void;
}

export function AIEngine({ datasetId, chartType, chartData, onClose }: AIEngineProps) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchExplanation = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.post(`/datasets/${datasetId}/assistant/explain-chart`, {
          chart_type: chartType,
          chart_data: chartData,
        });
        if (active) {
          setExplanation(res.data.explanation);
        }
      } catch (err: any) {
        if (active) {
          setError(err.response?.data?.detail || "AI explanation is temporarily unavailable.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchExplanation();
    return () => {
      active = false;
    };
  }, [datasetId, chartType, chartData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border border-primary/20 bg-card/90 shadow-2xl glass-card w-full max-w-sm rounded-lg overflow-hidden animate-in slide-in-from-right duration-300">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-primary/5 border-b border-border">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-primary">
            <Sparkles className="w-4 h-4" />
            AI Insight Explainer
          </CardTitle>
          <CardDescription className="text-[10px]">
            Explaining: {chartType}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        ) : error ? (
          <div className="flex gap-2 text-xs text-destructive p-3 bg-destructive/10 rounded-md border border-destructive/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-foreground bg-muted/30 p-3 rounded-md border border-border">
              {explanation}
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="w-3 h-3 mr-1 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
