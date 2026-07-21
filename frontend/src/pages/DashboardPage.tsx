import { useQuery } from "@tanstack/react-query";
import { Database, Rows3, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface Dataset {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  row_count: number | null;
  column_count: number | null;
  status: string;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DashboardPage() {
  const { data: datasets, isLoading } = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: async () => {
      const res = await api.get("/datasets");
      return res.data;
    },
  });

  const totalDatasets = datasets?.length ?? 0;
  const totalRows = datasets?.reduce((sum, d) => sum + (d.row_count ?? 0), 0) ?? 0;
  const totalSize = datasets?.reduce((sum, d) => sum + d.file_size_bytes, 0) ?? 0;

  const stats = [
    {
      label: "Total Datasets",
      value: totalDatasets,
      icon: Database,
      color: "from-indigo-500 to-purple-600",
    },
    {
      label: "Total Rows",
      value: totalRows.toLocaleString(),
      icon: Rows3,
      color: "from-emerald-500 to-teal-600",
    },
    {
      label: "Storage Used",
      value: formatBytes(totalSize),
      icon: HardDrive,
      color: "from-amber-500 to-orange-600",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-muted-foreground">
          Here's an overview of your data platform.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                >
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : datasets && datasets.length > 0 ? (
            <div className="space-y-2">
              {datasets.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{d.original_filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.row_count?.toLocaleString() ?? "—"} rows · {d.column_count ?? "—"} columns
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No datasets uploaded yet.</p>
              <p className="text-xs mt-1">Go to Datasets to upload your first CSV.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
