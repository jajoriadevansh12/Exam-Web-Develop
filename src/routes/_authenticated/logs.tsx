import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/shared/DataPagination";
import { listActivityLogs } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Activity Logs | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Audit trail of every student, section, batch and course change made in the examination branch console.",
      },
      { property: "og:title", content: "Activity Logs | XYZ University Exam Branch" },
      { property: "og:description", content: "Full audit trail of examination branch changes." },
    ],
  }),
  component: LogsPage,
});

const PAGE_SIZE = 25;
const TYPES = ["student", "section", "batch", "course"];

function LogsPage() {
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: ["activity-logs", entityType, page],
    queryFn: () =>
      listActivityLogs({
        ...(entityType === "all" ? {} : { entityType }),
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  return (
    <AdminLayout title="Activity Logs" description="Who changed what, and when">
      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Select
            value={entityType}
            onValueChange={(value) => {
              setEntityType(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All record types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All record types</SelectItem>
              {TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {logs.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (logs.data?.rows.length ?? 0) === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No activity recorded yet for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Record</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Field</th>
                  <th className="px-4 py-2.5 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(logs.data?.rows ?? []).map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">{log.entity_type}</Badge>{" "}
                      <span className="font-medium">{log.entity_label ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5">{log.action}</td>
                    <td className="px-4 py-2.5">{log.field_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.field_name ? `${log.old_value ?? "—"} → ${log.new_value ?? "—"}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DataPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={logs.data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>
    </AdminLayout>
  );
}