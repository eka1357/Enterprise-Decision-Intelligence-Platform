import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Database,
  Calendar,
  Filter,
  Download,
  AlertTriangle,
  RefreshCw,
  Layers,
  Map,
  DollarSign,
  ShoppingCart,
  Users,
  Brain,
  Sparkles,
  Info,
  X,
  Target,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import api from "@/lib/api";
import { ColumnMappingModal } from "@/components/analytics/ColumnMappingModal";
import { AIEngine } from "@/components/analytics/AIEngine";

interface Dataset {
  id: string;
  original_filename: string;
  status: string;
  columns_metadata: Array<{ name: string; dtype: string }>;
  column_mapping: Record<string, string> | null;
}

interface KPIDetail {
  label: string;
  value: number;
  previous_value: number;
  percentage_change: number;
  business_meaning: string;
}

interface MarketingAnalyticsData {
  kpis: {
    spend: KPIDetail;
    conversion_rate: KPIDetail;
    cac: KPIDetail;
    roas: KPIDetail;
  };
  trend: Array<{ date: string; spend: number; conversions: number }>;
  campaigns: Array<{ campaign: string; spend: number; conversions: number }>;
}

interface CustomerSample {
  customer: string;
  spend: number;
  frequency: number;
  segment: string;
}

interface SegmentationData {
  model_version: string;
  trained_at: string;
  metrics: {
    silhouette: number;
    cluster_sizes: Record<string, number>;
    profiles: Record<string, {
      name: string;
      avg_spend: number;
      avg_frequency: number;
      avg_order_value: number;
      size: number;
      proportion: number;
    }>;
    sample_customers: CustomerSample[];
  };
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function MarketingAnalyticsPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "segmentation">("overview");

  // AI Assistant & reports state
  const [explainingChart, setExplainingChart] = useState<{ type: string; data: any } | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // Training state
  const [trainingStatus, setTrainingStatus] = useState<"idle" | "training" | "success" | "error">("idle");
  const [trainingMessage, setTrainingMessage] = useState("");

  // 1. Fetch datasets list
  const { data: datasets, isLoading: loadingDatasets } = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: async () => {
      const res = await api.get("/datasets");
      return res.data;
    },
  });

  const readyDatasets = useMemo(() => {
    return datasets?.filter((d) => d.status === "ready") ?? [];
  }, [datasets]);

  // Auto-select first dataset
  useMemo(() => {
    if (readyDatasets.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(readyDatasets[0].id);
    }
  }, [readyDatasets, selectedDatasetId]);

  const selectedDataset = useMemo(() => {
    return readyDatasets.find((d) => d.id === selectedDatasetId);
  }, [readyDatasets, selectedDatasetId]);

  // 2. Fetch marketing metrics
  const {
    data: analytics,
    isLoading: loadingAnalytics,
    refetch: refetchAnalytics,
    error: analyticsError,
  } = useQuery<MarketingAnalyticsData>({
    queryKey: [
      "marketing-analytics",
      selectedDatasetId,
      startDate,
      endDate,
      campaignFilter,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (campaignFilter) params.campaign_filter = campaignFilter;

      const res = await api.get(`/analytics/marketing/${selectedDatasetId}`, { params });
      return res.data;
    },
    enabled: !!selectedDatasetId && !!selectedDataset?.column_mapping && activeTab === "overview",
    retry: false,
  });

  // 3. Fetch latest segmentation
  const {
    data: segmentation,
    isLoading: loadingSegmentation,
    refetch: refetchSegmentation,
    error: segmentationError,
  } = useQuery<SegmentationData>({
    queryKey: ["customer-segmentation", selectedDatasetId],
    queryFn: async () => {
      const res = await api.get(`/analytics/marketing/${selectedDatasetId}/segmentation/latest`);
      return res.data;
    },
    enabled: !!selectedDatasetId && !!selectedDataset?.column_mapping && activeTab === "segmentation",
    retry: false,
  });

  // Trigger segment model training
  const handleTrainSegmentation = async () => {
    if (!selectedDatasetId) return;
    setTrainingStatus("training");
    setTrainingMessage("Preprocessing customer RFM attributes and training K-Means...");

    try {
      await api.post(`/analytics/marketing/${selectedDatasetId}/segmentation`);
      setTrainingStatus("success");
      setTrainingMessage("Customer K-Means clustering compiled successfully!");
      refetchSegmentation();
    } catch (err: any) {
      setTrainingStatus("error");
      setTrainingMessage(err.response?.data?.detail || "Failed to train segmentation model.");
    }
  };

  // Summarize dashboard action
  const handleSummarizeDashboard = async () => {
    if (!selectedDatasetId || !analytics) return;
    setLoadingSummary(true);
    setSummaryError("");
    setDashboardSummary("");

    try {
      const res = await api.post(`/datasets/${selectedDatasetId}/assistant/summarize-dashboard`, {
        kpis: {
          revenue: analytics.kpis.spend,
          quantity: analytics.kpis.conversion_rate,
          aov: analytics.kpis.cac,
          customers: analytics.kpis.roas,
        },
        trend: analytics.trend.map((t) => ({ date: t.date, revenue: t.spend, quantity: t.conversions })),
        categories: analytics.campaigns.map((c) => ({ category: c.campaign, revenue: c.spend, quantity: c.conversions })),
        regions: [],
      });
      setDashboardSummary(res.data.summary);
    } catch (err: any) {
      setSummaryError(err.response?.data?.detail || "AI summary is temporarily unavailable.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleMappingSuccess = () => {
    refetchAnalytics();
  };

  const kpis = analytics?.kpis;

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* AI Explainer Floating Panel */}
      {explainingChart && (
        <div className="fixed bottom-6 right-6 z-50">
          <AIEngine
            datasetId={selectedDatasetId}
            chartType={explainingChart.type}
            chartData={explainingChart.data}
            onClose={() => setExplainingChart(null)}
          />
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Marketing Module</h2>
          <p className="text-sm text-muted-foreground">
            Aggregate ad expenditures, conversions, ROAS, and group profiles via K-Means.
          </p>
        </div>

        {/* Dataset Selector */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setSelectedDatasetId(e.target.value);
              setCampaignFilter(null);
              setTrainingStatus("idle");
              setDashboardSummary("");
              setExplainingChart(null);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring min-w-[200px]"
            disabled={loadingDatasets}
          >
            <option value="">-- Select Dataset --</option>
            {readyDatasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.original_filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Campaign Performance Overview
        </button>
        <button
          onClick={() => setActiveTab("segmentation")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "segmentation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain className="w-4 h-4" />
          Customer Segmentation (K-Means)
        </button>
      </div>

      {/* BLANK STATES */}
      {!selectedDatasetId ? (
        <Card className="p-8 text-center glass-card">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-30 text-muted-foreground" />
          <h3 className="text-lg font-bold">No active dataset selected</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
            Please select or upload a dataset first to begin analyzing Marketing metrics.
          </p>
          <Link to="/datasets" className="mt-4 inline-block">
            <Button>Go to Datasets</Button>
          </Link>
        </Card>
      ) : selectedDataset && !selectedDataset.column_mapping ? (
        <Card className="p-8 text-center border-dashed border-2 border-primary/30 bg-primary/5">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
          <h3 className="text-lg font-bold">Column Mapping Required</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">
            To view campaign marketing aggregates, configure your columns in the mapping editor.
          </p>
          <Button className="mt-4" onClick={() => setIsMappingModalOpen(true)}>
            Configure Column Mapping
          </Button>

          <ColumnMappingModal
            isOpen={isMappingModalOpen}
            onClose={() => setIsMappingModalOpen(false)}
            datasetId={selectedDatasetId}
            columns={selectedDataset.columns_metadata}
            onSuccess={handleMappingSuccess}
          />
        </Card>
      ) : activeTab === "overview" ? (
        // OVERVIEW TAB
        <>
          {/* FILTER BAR */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Range:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 py-0 px-2 text-xs w-[130px]"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 py-0 px-2 text-xs w-[130px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSummarizeDashboard} disabled={loadingAnalytics || loadingSummary}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Summarize Dashboard
              </Button>
            </div>
          </div>

          {/* DRILL-DOWN CHIP */}
          {campaignFilter && (
            <div className="flex flex-wrap gap-2 items-center bg-primary/5 p-3 rounded-lg border border-primary/20">
              <span className="text-xs font-bold text-primary">Active Filters:</span>
              <Badge variant="secondary" className="text-xs pl-2 pr-1.5 py-0.5 inline-flex items-center gap-1.5">
                Campaign: {campaignFilter}
                <button onClick={() => setCampaignFilter(null)} className="text-muted-foreground hover:text-foreground font-bold">
                  ×
                </button>
              </Badge>
            </div>
          )}

          {/* AI SUMMARY PANEL */}
          {loadingSummary && (
            <Card className="border border-primary/20 bg-primary/5 p-4 space-y-2">
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-3 w-[95%]" />
            </Card>
          )}

          {dashboardSummary && (
            <Card className="border border-primary/20 bg-primary/5 relative overflow-hidden animate-in fade-in duration-300">
              <div className="absolute top-0 right-0 p-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDashboardSummary("")}>
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold flex items-center gap-1 text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Campaign Performance Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {dashboardSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* RESULTS GRID */}
          {loadingAnalytics ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : analyticsError ? (
            <div className="p-6 text-center border border-destructive/20 bg-destructive/5 rounded-lg text-destructive">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
              <h4 className="font-bold">Failed to load campaign analytics</h4>
            </div>
          ) : kpis ? (
            <div className="space-y-6">
              {/* KPIs Row */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Ad Spend</CardTitle>
                    <DollarSign className="w-4 h-4 text-indigo-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">${kpis.spend.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.spend.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.spend.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.spend.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.spend.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Conversion Rate</CardTitle>
                    <Percent className="w-4 h-4 text-emerald-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{kpis.conversion_rate.value}%</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.conversion_rate.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.conversion_rate.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.conversion_rate.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.conversion_rate.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">CAC</CardTitle>
                    <Target className="w-4 h-4 text-amber-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">${kpis.cac.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.cac.percentage_change <= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.cac.percentage_change <= 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                        {kpis.cac.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.cac.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">ROAS</CardTitle>
                    <DollarSign className="w-4 h-4 text-purple-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{kpis.roas.value}x</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.roas.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.roas.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.roas.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.roas.business_meaning}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2 glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Marketing Expenditure & Conversions Trend
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary" onClick={() => setExplainingChart({ type: "Marketing Spend Trend", data: analytics.trend })}>
                      <Sparkles className="w-3 h-3 mr-1" />
                      Explain
                    </Button>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.trend}>
                        <defs>
                          <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="date" className="text-[10px] fill-muted-foreground" tickLine={false} />
                        <YAxis className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                        <Area type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" name="Ad Spend ($)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Campaign Breakdown */}
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">Top Converting Campaigns</CardTitle>
                      <CardDescription className="text-[10px]">Click a campaign to drill down</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.campaigns}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="campaign" className="text-[10px]" />
                        <YAxis className="text-[10px]" />
                        <Tooltip />
                        <Bar dataKey="conversions" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(data) => data?.campaign && setCampaignFilter(data.campaign)} className="cursor-pointer">
                          {analytics.campaigns.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        // SEGMENTATION TAB
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  K-Means Segment Compiler
                </CardTitle>
                <CardDescription>Group customers into High-Value and At-Risk segments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full flex items-center justify-center gap-2" onClick={handleTrainSegmentation} disabled={trainingStatus === "training"}>
                  {trainingStatus === "training" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Clustering customers...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Run Segmentation model
                    </>
                  )}
                </Button>
                {trainingStatus !== "idle" && (
                  <div className={`p-3 rounded-md border text-xs ${
                    trainingStatus === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                  }`}>
                    {trainingMessage}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Silhouette details */}
            {segmentation && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    Model Silhouette Score
                  </CardTitle>
                  <CardDescription>Evaluation rating representing clustering cohesion</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-extrabold text-indigo-400">
                    {segmentation.metrics.silhouette}%
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Silhouette coefficient measures separation distance between clusters (higher is better).
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Clusters profiles details */}
          {loadingSegmentation ? (
            <Skeleton className="h-60 w-full" />
          ) : segmentationError ? (
            <Card className="p-8 text-center border-dashed border-2 border-border">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-45" />
              <h4 className="font-bold">No active segmentation run</h4>
              <p className="text-xs text-muted-foreground mt-1">Train your K-Means model to output segments.</p>
            </Card>
          ) : segmentation?.metrics?.profiles ? (
            <div className="space-y-6">
              {/* Segment profiles grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {Object.entries(segmentation.metrics.profiles).map(([key, prof]: any) => (
                  <Card key={key} className="glass-card border-l-4 border-l-primary">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-bold">{prof.name}</CardTitle>
                        <Badge variant="secondary">{prof.proportion.toFixed(0)}% of customers</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Avg Purchase Spend:</span>
                        <span className="font-bold text-foreground">${prof.avg_spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Order Frequency:</span>
                        <span className="font-bold text-foreground">{prof.avg_frequency.toFixed(1)} orders</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average Order Value:</span>
                        <span className="font-bold text-foreground">${prof.avg_order_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Sample classified customers table */}
              {segmentation.metrics.sample_customers && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base">Sample Labeled Customers</CardTitle>
                    <CardDescription className="text-[10px]">Showing assignments for first 100 customer entries</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Identifier</TableHead>
                          <TableHead className="text-center">Total Spend</TableHead>
                          <TableHead className="text-center">Purchase Frequency</TableHead>
                          <TableHead className="text-right">Assigned Cluster Profile</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {segmentation.metrics.sample_customers.map((c, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-xs">{c.customer}</TableCell>
                            <TableCell className="text-center text-xs">${c.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center text-xs">{c.frequency}</TableCell>
                            <TableCell className="text-right text-xs">
                              <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                {c.segment}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
