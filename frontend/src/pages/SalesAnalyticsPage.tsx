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
  MapPin,
  Tag,
  Users,
  DollarSign,
  ShoppingCart,
  Layers,
  Map,
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
  Legend,
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
  filters: {
    start_date: string;
    end_date: string;
    granularity: string;
    category: string | null;
    region: string | null;
  };
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
    refetch,
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
    enabled: !!selectedDatasetId && !!selectedDataset?.column_mapping,
    retry: false,
  });

  // Handle Export to CSV
  const handleExport = () => {
    if (!analytics) return;

    // Build CSV string from trend data
    const headers = ["Date", "Revenue", "Quantity"];
    const rows = analytics.trend.map((row) => [row.date, row.revenue, row.quantity]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `sales_analytics_export_${selectedDataset?.original_filename || "data"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMappingSuccess = () => {
    refetch();
  };

  const kpis = analytics?.kpis;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Aggregate transactions, track revenue trends, and review period comparisons.
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

      {/* 1. MAPPING NEEDED / BLANK STATES */}
      {!selectedDatasetId ? (
        <Card className="p-8 text-center glass-card">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-30 text-muted-foreground" />
          <h3 className="text-lg font-bold">No active dataset selected</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
            Please select or upload a dataset first to begin analyzing Sales KPIs.
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
            To query sales data, we need to map your CSV columns (e.g. date, revenue) to our standard analytics schema.
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
      ) : (
        <>
          {/* 2. FILTER BAR */}
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

          {/* ACTIVE DRILL-DOWN CHIPS */}
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

          {/* 3. LOADING / ERROR / RESULTS */}
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
              <p className="text-xs mt-1">Make sure column mapping values match types (e.g. numeric mapping for revenue).</p>
            </div>
          ) : kpis ? (
            <div className="space-y-6">
              {/* KPIs Row */}
              <div className="grid gap-4 md:grid-cols-4">
                {/* Revenue KPI */}
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">
                      {kpis.revenue.label}
                    </CardTitle>
                    <DollarSign className="w-4 h-4 text-indigo-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">${kpis.revenue.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-1.5 py-0 inline-flex items-center gap-0.5 ${
                          kpis.revenue.percentage_change >= 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                      >
                        {kpis.revenue.percentage_change >= 0 ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {kpis.revenue.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">
                      {kpis.revenue.business_meaning}
                    </p>
                  </CardContent>
                </Card>

                {/* Quantity KPI */}
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">
                      {kpis.quantity.label}
                    </CardTitle>
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
                        {kpis.quantity.percentage_change >= 0 ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {kpis.quantity.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">
                      {kpis.quantity.business_meaning}
                    </p>
                  </CardContent>
                </Card>

                {/* AOV KPI */}
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">
                      {kpis.aov.label}
                    </CardTitle>
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
                        {kpis.aov.percentage_change >= 0 ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {kpis.aov.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">
                      {kpis.aov.business_meaning}
                    </p>
                  </CardContent>
                </Card>

                {/* Customers KPI */}
                <Card className="glass-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">
                      {kpis.customers.label}
                    </CardTitle>
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
                        {kpis.customers.percentage_change >= 0 ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {kpis.customers.percentage_change}%
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">
                      {kpis.customers.business_meaning}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Dashboard */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Revenue Trend Chart */}
                <Card className="md:col-span-2 glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Revenue Trend
                    </CardTitle>
                    <CardDescription>Historical trend line of sales revenue</CardDescription>
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
                        <Tooltip
                          contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                          labelClassName="text-xs font-bold text-foreground"
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Region Pie Chart */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Map className="w-4 h-4 text-primary" />
                      Sales by Region
                    </CardTitle>
                    <CardDescription>Click a slice to drill down</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80 flex flex-col justify-center">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.regions}
                            nameKey="region"
                            dataKey="revenue"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            fill="#8884d8"
                            label={({ region, percent }) => `${region} (${(percent * 100).toFixed(0)}%)`}
                            onClick={(data) => {
                              if (data && data.region) {
                                setRegionFilter(data.region);
                              }
                            }}
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

              {/* Categories Bar Chart */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Top Product Categories
                  </CardTitle>
                  <CardDescription>Click a category bar to filter by product slice</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.categories}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="category" className="text-[10px] fill-muted-foreground" tickLine={false} />
                      <YAxis className="text-[10px] fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value) => [`$${value}`, "Revenue"]} />
                      <Bar
                        dataKey="revenue"
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                        onClick={(data) => {
                          if (data && data.category) {
                            setCategoryFilter(data.category);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        {analytics.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12">No data available for this selection.</div>
          )}
        </>
      )}
    </div>
  );
}
