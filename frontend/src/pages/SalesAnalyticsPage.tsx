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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

interface SalesAnalyticsData {
  kpis: {
    revenue: KPIDetail;
    quantity: KPIDetail;
    aov: KPIDetail;
    customers: KPIDetail;
  };
  trend: Array<{ date: string; revenue: number; quantity: number }>;
  categories: Array<{ category: string; revenue: number; quantity: number }>;
  regions: Array<{ region: string; revenue: number; quantity: number }>;
}

interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface ForecastData {
  dataset_id: string;
  model_version: string;
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
  };
  predictions: ForecastPoint[];
  shap_drivers: string[];
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function SalesAnalyticsPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [granularity, setGranularity] = useState("daily");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "forecasting">("overview");

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

  // Auto-select the first dataset if none selected
  useMemo(() => {
    if (readyDatasets.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(readyDatasets[0].id);
    }
  }, [readyDatasets, selectedDatasetId]);

  const selectedDataset = useMemo(() => {
    return readyDatasets.find((d) => d.id === selectedDatasetId);
  }, [readyDatasets, selectedDatasetId]);

  // 2. Fetch sales metrics
  const {
    data: analytics,
    isLoading: loadingAnalytics,
    refetch: refetchAnalytics,
    error: analyticsError,
  } = useQuery<SalesAnalyticsData>({
    queryKey: [
      "sales-analytics",
      selectedDatasetId,
      startDate,
      endDate,
      granularity,
      categoryFilter,
      regionFilter,
    ],
    queryFn: async () => {
      const params: Record<string, string> = { granularity };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (categoryFilter) params.category = categoryFilter;
      if (regionFilter) params.region = regionFilter;

      const res = await api.get(`/analytics/sales/${selectedDatasetId}`, { params });
      return res.data;
    },
    enabled: !!selectedDatasetId && !!selectedDataset?.column_mapping && activeTab === "overview",
    retry: false,
  });

  // 3. Fetch latest forecast
  const {
    data: forecast,
    isLoading: loadingForecast,
    refetch: refetchForecast,
    error: forecastError,
  } = useQuery<ForecastData>({
    queryKey: ["sales-forecast", selectedDatasetId],
    queryFn: async () => {
      const res = await api.get(`/datasets/${selectedDatasetId}/forecast/latest`);
      return res.data;
    },
    enabled: !!selectedDatasetId && !!selectedDataset?.column_mapping && activeTab === "forecasting",
    retry: false,
  });

  // Trigger forecast model training
  const handleTrainForecast = async () => {
    if (!selectedDatasetId) return;
    setTrainingStatus("training");
    setTrainingMessage("Model training initiated...");

    try {
      await api.post(`/datasets/${selectedDatasetId}/forecast`);
      setTrainingStatus("success");
      setTrainingMessage("XGBoost forecasting model trained successfully!");
      refetchForecast();
    } catch (err: any) {
      setTrainingStatus("error");
      setTrainingMessage(err.response?.data?.detail || "Failed to train forecasting model.");
    }
  };

  // Combine trend and forecast data for the chart
  const combinedChartData = useMemo(() => {
    if (!analytics?.trend) return [];
    
    // Add historical records
    const records = analytics.trend.map((t) => ({
      date: t.date,
      historical: t.revenue,
      forecast: null,
      yhat_lower: null,
      yhat_upper: null,
    }));

    if (!forecast?.predictions) return records;

    // Connect historical trend to forecast line
    const lastHist = records[records.length - 1];
    
    // Add forecasted records
    const forecastRecords = forecast.predictions.map((p, idx) => ({
      date: p.date,
      historical: idx === 0 && lastHist ? lastHist.historical : null,
      forecast: p.yhat,
      yhat_lower: p.yhat_lower,
      yhat_upper: p.yhat_upper,
    }));

    return [...records, ...forecastRecords];
  }, [analytics, forecast]);

  // Handle Export to CSV
  const handleExport = () => {
    if (!analytics) return;
    const headers = ["Date", "Revenue", "Quantity"];
    const rows = analytics.trend.map((row) => [row.date, row.revenue, row.quantity]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_analytics_${selectedDataset?.original_filename || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMappingSuccess = () => {
    refetchAnalytics();
  };

  const kpis = analytics?.kpis;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales Module</h2>
          <p className="text-sm text-muted-foreground">
            Aggregate transactional revenue, analyze categories, and generate ML predictions.
          </p>
        </div>

        {/* Dataset Selector */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setSelectedDatasetId(e.target.value);
              setCategoryFilter(null);
              setRegionFilter(null);
              setTrainingStatus("idle");
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
          Analytics Overview
        </button>
        <button
          onClick={() => setActiveTab("forecasting")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "forecasting"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain className="w-4 h-4" />
          Sales Forecasting
        </button>
      </div>

      {/* BLANK STATES */}
      {!selectedDatasetId ? (
        <Card className="p-8 text-center glass-card">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-30 text-muted-foreground" />
          <h3 className="text-lg font-bold">No active dataset selected</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
            Please select or upload a dataset first to begin analyzing Sales details.
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
            To run sales analytics or forecasting models, map your CSV columns to the standard Sales schema.
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
        // TAB 1: ANALYTICS OVERVIEW
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

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Granularity:</span>
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-sm focus:outline-none"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loadingAnalytics}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* DRILL-DOWN CHIPS */}
          {(categoryFilter || regionFilter) && (
            <div className="flex flex-wrap gap-2 items-center bg-primary/5 p-3 rounded-lg border border-primary/20">
              <span className="text-xs font-bold text-primary">Active Filters:</span>
              {categoryFilter && (
                <Badge variant="secondary" className="text-xs pl-2 pr-1.5 py-0.5 inline-flex items-center gap-1.5">
                  Category: {categoryFilter}
                  <button onClick={() => setCategoryFilter(null)} className="text-muted-foreground hover:text-foreground font-bold">
                    ×
                  </button>
                </Badge>
              )}
              {regionFilter && (
                <Badge variant="secondary" className="text-xs pl-2 pr-1.5 py-0.5 inline-flex items-center gap-1.5">
                  Region: {regionFilter}
                  <button onClick={() => setRegionFilter(null)} className="text-muted-foreground hover:text-foreground font-bold">
                    ×
                  </button>
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-[10px] py-0 px-2 ml-auto" onClick={() => {
                setCategoryFilter(null);
                setRegionFilter(null);
              }}>
                Clear All
              </Button>
            </div>
          )}

          {/* RESULTS GRID */}
          {loadingAnalytics ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <Skeleton className="md:col-span-2 h-96 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          ) : analyticsError ? (
            <div className="p-6 text-center border border-destructive/20 bg-destructive/5 rounded-lg text-destructive">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
              <h4 className="font-bold">Failed to load analytics</h4>
              <p className="text-xs mt-1">Check that data types inside the column mapping values are accurate.</p>
            </div>
          ) : kpis ? (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Total Revenue</CardTitle>
                    <DollarSign className="w-4 h-4 text-indigo-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">${kpis.revenue.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.revenue.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.revenue.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.revenue.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.revenue.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Units Sold</CardTitle>
                    <ShoppingCart className="w-4 h-4 text-emerald-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{kpis.quantity.value.toLocaleString()}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.quantity.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.quantity.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.quantity.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.quantity.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Avg Order Value</CardTitle>
                    <Layers className="w-4 h-4 text-purple-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">${kpis.aov.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.aov.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.aov.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.aov.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.aov.business_meaning}</p>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Customer Base</CardTitle>
                    <Users className="w-4 h-4 text-amber-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{kpis.customers.value.toLocaleString()}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.customers.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.customers.percentage_change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {kpis.customers.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{kpis.customers.business_meaning}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2 glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Revenue Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.trend}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="date" className="text-[10px] fill-muted-foreground" tickLine={false} />
                        <YAxis className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                        <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Map className="w-4 h-4 text-primary" />
                      Sales by Region
                    </CardTitle>
                    <CardDescription>Click a slice to filter dashboard</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80 flex flex-col justify-center">
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.regions}
                            nameKey="region"
                            dataKey="revenue"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ region, percent }) => `${region} (${(percent * 100).toFixed(0)}%)`}
                            onClick={(data) => data?.region && setRegionFilter(data.region)}
                            className="cursor-pointer"
                          >
                            {analytics.regions.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`$${value}`, "Revenue"]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Top Product Categories
                  </CardTitle>
                  <CardDescription>Click a bar to filter by product slice</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.categories}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="category" className="text-[10px] fill-muted-foreground" tickLine={false} />
                      <YAxis className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value) => [`$${value}`, "Revenue"]} />
                      <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} onClick={(data) => data?.category && setCategoryFilter(data.category)} className="cursor-pointer">
                        {analytics.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      ) : (
        // TAB 2: SALES FORECASTING
        <div className="space-y-6">
          {/* Actions & Metrics Row */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Forecaster Model Training
                </CardTitle>
                <CardDescription>Asynchronously train a predictive XGBoost model</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full flex items-center justify-center gap-2" onClick={handleTrainForecast} disabled={trainingStatus === "training"}>
                  {trainingStatus === "training" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Training model...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Train XGBoost Forecaster
                    </>
                  )}
                </Button>

                {trainingStatus !== "idle" && (
                  <div className={`p-3 rounded-md border text-xs ${
                    trainingStatus === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : trainingStatus === "error"
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {trainingMessage}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model Info Card */}
            {forecast && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    Model Details & Metrics
                  </CardTitle>
                  <CardDescription>Trained model specifications</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Active Version</span>
                    <Badge variant="secondary" className="font-bold">{forecast.model_version}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">MAPE (Mean Error %)</span>
                    <span className="font-bold text-sm text-indigo-400">{forecast.metrics.mape}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">MAE</span>
                    <span className="font-bold text-sm">${forecast.metrics.mae.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">RMSE</span>
                    <span className="font-bold text-sm">${forecast.metrics.rmse.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Why explanations panel */}
            {forecast && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Prediction Explainability
                  </CardTitle>
                  <CardDescription>Plain-language drivers computed via feature-contributions</CardDescription>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  {forecast.shap_drivers.map((driver, index) => (
                    <div key={index} className="flex gap-2 items-start text-muted-foreground">
                      <span className="text-primary font-bold">•</span>
                      <span>{driver}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Forecast Chart */}
          {loadingForecast ? (
            <Skeleton className="h-[400px] w-full" />
          ) : forecastError ? (
            <Card className="p-8 text-center border-dashed border-2 border-border">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-45" />
              <h4 className="font-bold">No active model trained yet</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Train your XGBoost forecaster above to generate future predictions and confidence bands.
              </p>
            </Card>
          ) : combinedChartData.length > 0 ? (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  30-Day Sales Revenue Projections
                </CardTitle>
                <CardDescription>Historical trend extended with XGBoost predictions & 95% confidence bands</CardDescription>
              </CardHeader>
              <CardContent className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={combinedChartData}>
                    <defs>
                      <linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" className="text-[10px] fill-muted-foreground" tickLine={false} />
                    <YAxis className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                    
                    {/* Shaded Confidence Interval */}
                    <Area type="monotone" dataKey="yhat_upper" stroke="none" fill="#6366f1" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="yhat_lower" stroke="none" fill="#1e1e38" fillOpacity={0.1} />
                    
                    {/* Historical Series */}
                    <Area type="monotone" dataKey="historical" stroke="#94a3b8" strokeWidth={1.5} fillOpacity={1} fill="url(#colorHist)" name="Historical Revenue" />
                    
                    {/* Forecast Series */}
                    <Area type="monotone" dataKey="forecast" stroke="#6366f1" strokeDasharray="4 4" strokeWidth={2} fillOpacity={1} fill="url(#colorForecast)" name="XGBoost Forecast" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
