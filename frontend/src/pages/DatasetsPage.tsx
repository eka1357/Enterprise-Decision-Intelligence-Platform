import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Database,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

interface Dataset {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  row_count: number | null;
  column_count: number | null;
  columns_metadata: Array<{ name: string; dtype: string }> | null;
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

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const { data: datasets, isLoading } = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: async () => {
      const res = await api.get("/datasets");
      return res.data;
    },
  });

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setUploadError("Only CSV files are accepted.");
        return;
      }

      setUploading(true);
      setUploadError("");
      setUploadSuccess("");
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      try {
        await api.post("/datasets/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const pct = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              setUploadProgress(pct);
            }
          },
        });

        setUploadSuccess(`"${file.name}" uploaded successfully!`);
        queryClient.invalidateQueries({ queryKey: ["datasets"] });
      } catch (err: any) {
        setUploadError(
          err.response?.data?.detail || "Upload failed. Please try again."
        );
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [queryClient]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Datasets</h2>
        <p className="text-muted-foreground">
          Upload and manage your CSV data files.
        </p>
      </div>

      {/* Upload Zone */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-all duration-300 cursor-pointer",
              dragActive
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              uploading && "pointer-events-none opacity-70"
            )}
            onClick={() =>
              document.getElementById("file-upload-input")?.click()
            }
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
              disabled={uploading}
            />

            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300",
                dragActive
                  ? "bg-primary/10 scale-110"
                  : "bg-muted"
              )}
            >
              <Upload
                className={cn(
                  "w-6 h-6 transition-colors",
                  dragActive ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>

            <p className="text-sm font-medium mb-1">
              {dragActive
                ? "Drop your file here"
                : "Drag & drop a CSV file, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">
              CSV files only · Max 50 MB
            </p>

            {/* Upload Progress */}
            {uploading && (
              <div className="mt-4 w-full max-w-xs">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full gradient-primary rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Messages */}
      {uploadSuccess && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{uploadSuccess}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => setUploadSuccess("")}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => setUploadError("")}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Datasets Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            Uploaded Datasets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : datasets && datasets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Rows
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Columns
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Size
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Uploaded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((d, idx) => (
                    <tr
                      key={d.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="font-medium truncate max-w-[200px]">
                            {d.original_filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {d.row_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {d.column_count ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {formatBytes(d.file_size_bytes)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {d.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No datasets yet</p>
              <p className="text-xs mt-1">
                Upload a CSV file above to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
