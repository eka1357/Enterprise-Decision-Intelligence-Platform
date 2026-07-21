import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Database,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Gauge,
  ListFilter,
  Layers,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface ProfileSummary {
  total_rows: number;
  total_columns: number;
  duplicate_rows: number;
  missing_values: number;
  outliers_found: number;
}

interface ProfileMetrics {
  completeness: number;
  uniqueness: number;
  validity: number;
  consistency: number;
}

interface ColumnProfile {
  name: string;
  type: string;
  null_count: number;
  missing_percentage: number;
  unique_count: number;
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  std?: number;
  outlier_count?: number;
  top_categories?: Array<{ value: string; count: number }>;
}

interface ProfileReport {
  overall_score: number;
  validation_passed: boolean;
  summary: ProfileSummary;
  metrics: ProfileMetrics;
  columns: Record<string, ColumnProfile>;
  issues: Array<{
    level: string;
    category: string;
    column?: string;
    message: string;
  }>;
  cleaning_actions: Array<{
    step: string;
    details: string;
    mappings?: Record<string, string>;
    imputations?: Record<string, { strategy: string; value: any; count: number }>;
  }>;
  cleaned_file_path: string;
}

export function DatasetProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<"overview" | "columns" | "issues" | "cleaning">("overview");

  const { data: report, isLoading, error } = useQuery<ProfileReport>({
    queryKey: ["dataset-profile", id],
    queryFn: async () => {
      const res = await api.get(`/datasets/${id}/profile`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive" />
        <h3 className="text-lg font-bold">Failed to load data profile</h3>
        <p className="text-muted-foreground text-sm mt-2">
          The dataset is either processing, failed, or does not exist.
        </p>
        <Link to="/datasets" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Datasets
          </Button>
        </Link>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-500 stroke-emerald-500";
    if (score >= 60) return "text-amber-500 stroke-amber-500";
    return "text-destructive stroke-destructive";
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score >= 60) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/datasets">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">Data Profile Report</h2>
              <Badge variant="outline" className={getScoreBg(report.overall_score)}>
                Quality Score: {report.overall_score}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Deep validation & quality analysis of your dataset.
            </p>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Quality Score Radial Meter */}
        <Card className="md:col-span-1 glass-card flex flex-col justify-center items-center p-6 text-center">
          <CardTitle className="text-sm font-semibold text-muted-foreground mb-4">
            Overall Quality Score
          </CardTitle>
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* SVG Radial Meter */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="50"
                className="stroke-muted"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r="50"
                className={getScoreColor(report.overall_score)}
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={314}
                strokeDashoffset={314 - (314 * report.overall_score) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-3xl font-extrabold tracking-tight">
                {report.overall_score}
              </span>
              <span className="text-xs text-muted-foreground block">/ 100</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Weighted score based on completeness, validity, uniqueness, and consistency.
          </p>
        </Card>

        {/* Core Stats Cards */}
        <div className="md:col-span-3 grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-muted-foreground">
                Total Rows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.summary.total_rows.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-muted-foreground">
                Total Columns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.summary.total_columns}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-muted-foreground">
                Missing Values
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">
                {report.summary.missing_values.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-muted-foreground">
                Duplicate Rows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {report.summary.duplicate_rows.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-border space-x-4">
        {[
          { id: "overview", label: "Overview", icon: Database },
          { id: "columns", label: "Columns Details", icon: FileSpreadsheet },
          { id: "issues", label: "Flagged Issues", icon: AlertTriangle },
          { id: "cleaning", label: "Cleaning Actions", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "issues" && report.issues.length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-[10px]">
                  {report.issues.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Dimensions Metric breakdown */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Dimension Scores</CardTitle>
                <CardDescription>Metrics representing overall data health.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { name: "Completeness", value: report.metrics.completeness, desc: "Absence of NULL or missing values" },
                  { name: "Validity", value: report.metrics.validity, desc: "Alignment with expected column data types" },
                  { name: "Uniqueness", value: report.metrics.uniqueness, desc: "Absence of redundant or duplicated rows" },
                  { name: "Consistency", value: report.metrics.consistency, desc: "Structural similarity with prior datasets" },
                ].map((metric) => (
                  <div key={metric.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{metric.name}</span>
                      <span className="font-semibold">{metric.value}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full gradient-primary rounded-full"
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground block">{metric.desc}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Validation Overview Card */}
            <Card className="glass-card flex flex-col justify-between">
              <CardHeader>
                <CardTitle className="text-base">Validation Summary</CardTitle>
                <CardDescription>Pandera schema validation results.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center items-center text-center p-6">
                {report.validation_passed ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-base text-emerald-400">All Schemas Valid</h4>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Pandera successfully validated the schema. No datatypes or constraint mismatches detected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-base text-destructive">Schema Validation Failed</h4>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Some values failed strict type mapping checks or formatting constraints.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* COLUMNS TAB */}
        {activeTab === "columns" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Columns Profile</CardTitle>
              <CardDescription>Per-column data distribution and type breakdown.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-3 px-4 font-medium">Name</th>
                      <th className="text-left py-3 px-4 font-medium">Type</th>
                      <th className="text-right py-3 px-4 font-medium">Null Count</th>
                      <th className="text-right py-3 px-4 font-medium">Null %</th>
                      <th className="text-right py-3 px-4 font-medium">Uniques</th>
                      <th className="text-right py-3 px-4 font-medium">Outliers</th>
                      <th className="text-left py-3 px-4 font-medium">Range / Top Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(report.columns).map((col) => (
                      <tr key={col.name} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-4 font-semibold">{col.name}</td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {col.type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">{col.null_count.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums">{col.missing_percentage}%</td>
                        <td className="py-3 px-4 text-right tabular-nums">{col.unique_count.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-destructive">
                          {col.outlier_count !== undefined ? col.outlier_count.toLocaleString() : "—"}
                        </td>
                        <td className="py-3 px-4 text-xs max-w-xs">
                          {col.type === "numeric" && col.min !== undefined ? (
                            <div className="flex flex-col gap-0.5 text-right font-mono text-[10px]">
                              <span>Min: {col.min?.toLocaleString()}</span>
                              <span>Max: {col.max?.toLocaleString()}</span>
                              <span>Mean: {col.mean?.toFixed(1)}</span>
                            </div>
                          ) : col.top_categories && col.top_categories.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {col.top_categories.slice(0, 3).map((cat) => (
                                <Badge key={cat.value} variant="outline" className="text-[10px] px-1 py-0 border-border bg-muted/20">
                                  {cat.value} ({cat.count})
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ISSUES TAB */}
        {activeTab === "issues" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flagged Quality Issues</CardTitle>
              <CardDescription>Warnings and alerts discovered during profiling.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.issues.length > 0 ? (
                report.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-4 rounded-lg border ${
                      issue.level === "warning"
                        ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
                        : issue.level === "error"
                        ? "bg-destructive/5 border-destructive/20 text-destructive"
                        : "bg-blue-500/5 border-blue-500/20 text-blue-400"
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm capitalize">
                          {issue.category.replace("_", " ")}
                        </span>
                        {issue.column && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Column: {issue.column}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1 text-foreground/90">{issue.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500 opacity-60" />
                  <p className="text-sm font-semibold">No issues flagged!</p>
                  <p className="text-xs">Your dataset has exceptional validation quality.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* CLEANING TAB */}
        {activeTab === "cleaning" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automated Cleaning Summary</CardTitle>
              <CardDescription>Steps performed to resolve identified issues and standardize columns.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {report.cleaning_actions.length > 0 ? (
                <div className="space-y-4">
                  {report.cleaning_actions.map((action, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-muted/40 border border-border space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <h4 className="font-bold text-sm capitalize">
                          {action.step.replace(/_/g, " ")}
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">{action.details}</p>

                      {/* Display mappings for column standardization */}
                      {action.mappings && Object.keys(action.mappings).length > 0 && (
                        <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 text-xs">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border bg-muted/50 text-muted-foreground text-left">
                                <th className="py-2 px-3">Original Name</th>
                                <th className="py-2 px-3">Standardized Name</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(action.mappings).map(([orig, cleaned]) => (
                                <tr key={orig} className="border-b border-border/30 font-mono">
                                  <td className="py-2 px-3">{orig}</td>
                                  <td className="py-2 px-3 text-primary">{cleaned}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Display imputations for null values */}
                      {action.imputations && Object.keys(action.imputations).length > 0 && (
                        <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 text-xs">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border bg-muted/50 text-muted-foreground text-left">
                                <th className="py-2 px-3">Column</th>
                                <th className="py-2 px-3">Imputation Method</th>
                                <th className="py-2 px-3">Imputed Value</th>
                                <th className="py-2 px-3 text-right">Rows Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(action.imputations).map(([col, data]) => (
                                <tr key={col} className="border-b border-border/30 font-mono">
                                  <td className="py-2 px-3">{col}</td>
                                  <td className="py-2 px-3 capitalize">{data.strategy}</td>
                                  <td className="py-2 px-3 text-primary">{String(data.value)}</td>
                                  <td className="py-2 px-3 text-right tabular-nums">{data.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-1 bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                    <Info className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      Cleaned CSV stored separately on disk. Raw file preserved intact.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No cleaning steps required</p>
                  <p className="text-xs">Your raw dataset is already clean and consistent.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
