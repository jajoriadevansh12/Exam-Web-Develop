import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  DoorOpen,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  parseRoomsWorkbook,
  applyRoomsImport,
  downloadRoomsTemplate,
  type RoomImportPreview,
} from "@/lib/room-import";
import { listRooms } from "@/lib/seating";

export function RoomImportDialog({
  triggerText = "Import Halls (Excel)",
  buttonVariant = "outline",
  size = "default",
}: {
  triggerText?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RoomImportPreview | null>(null);
  const [includeFloorInBlock, setIncludeFloorInBlock] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [showRoomList, setShowRoomList] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Query existing rooms in database to detect conflicts / duplicates
  const { data: existingRooms = [] } = useQuery({
    queryKey: ["rooms"],
    queryFn: listRooms,
  });

  const analyzeFile = async (
    targetFile: File,
    floorSetting: boolean,
    dbRooms = existingRooms,
  ) => {
    setReading(true);
    try {
      const result = await parseRoomsWorkbook(targetFile, floorSetting, dbRooms);
      setPreview(result);
      toast.success(
        `Parsed ${result.totalRows} rows: ${result.validCount} valid halls ready to import!`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to parse Excel file");
      setPreview(null);
    } finally {
      setReading(false);
    }
  };

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    await analyzeFile(selectedFile, includeFloorInBlock, existingRooms);
  };

  const handleToggleFloor = async (nextFloorSetting: boolean) => {
    setIncludeFloorInBlock(nextFloorSetting);
    if (file) {
      await analyzeFile(file, nextFloorSetting, existingRooms);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setShowRoomList(false);
    setFilterText("");
    setUpdateExisting(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview available");
      return applyRoomsImport(preview.rooms, { updateExisting });
    },
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.inserted} hall(s) successfully! Total capacity: ${res.totalSeats.toLocaleString()} seats.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["active_rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      resetState();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Import failed");
    },
  });

  // Calculate rooms count that will be imported
  const countToImport = useMemo(() => {
    if (!preview) return 0;
    if (updateExisting) {
      return preview.validCount;
    }
    return preview.newRooms.length;
  }, [preview, updateExisting]);

  const seatsToImport = useMemo(() => {
    if (!preview) return 0;
    if (updateExisting) {
      return preview.totalSeats;
    }
    return preview.newRooms.reduce((sum, r) => sum + r.capacity, 0);
  }, [preview, updateExisting]);

  const filteredRooms = useMemo(() => {
    if (!preview) return [];
    const term = filterText.trim().toLowerCase();
    if (!term) return preview.rooms;
    return preview.rooms.filter(
      (r) =>
        r.classroom.toLowerCase().includes(term) ||
        r.building.toLowerCase().includes(term) ||
        r.floor.toLowerCase().includes(term) ||
        r.block.toLowerCase().includes(term),
    );
  }, [preview, filterText]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size={size}>
          <Upload className="size-4" />
          {triggerText}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-6 gap-4 overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5 text-primary" />
            Import Exam Halls (Excel)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload classrooms dataset with Building, Floor, Classroom, Rows, Seats per Row, and Total Capacity.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          className="hidden"
          id="hall-excel-upload"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileChange(f);
          }}
        />

        {!preview ? (
          /* Upload State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-xl bg-muted/20 text-center space-y-4 my-2">
            <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <Upload className="size-7" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-base">Upload Your Classrooms Excel Sheet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Works with 50+ classes. Automatically calculates row/column grids, assigns building blocks, and checks for conflicts.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={reading}
                className="gap-2 shadow-xs"
              >
                {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Choose Excel File (.xlsx, .csv)
              </Button>
              <Button variant="outline" onClick={downloadRoomsTemplate} className="gap-2">
                <Download className="size-4" />
                Download Sample Template
              </Button>
            </div>
          </div>
        ) : (
          /* Preview State - Boxes / Cards Architecture (No scrolling issues!) */
          <div className="flex-1 flex flex-col space-y-4">
            {/* File Info Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/40 text-xs">
              <div className="flex items-center gap-2 truncate">
                <FileSpreadsheet className="size-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate max-w-xs">{file?.name}</span>
                <Badge variant="outline" className="text-[11px] py-0">
                  {preview.totalRows} rows in file
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                >
                  <Upload className="size-3" /> Change File
                </Button>
              </div>
            </div>

            {/* 4 Primary Summary Stat Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Box 1: Total Rooms Added */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Total Halls</span>
                  <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <DoorOpen className="size-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {preview.validCount}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {preview.newRooms.length} new
                    {preview.existingRooms.length > 0 ? ` · ${preview.existingRooms.length} updates` : ""}
                  </div>
                </div>
              </div>

              {/* Box 2: Total Seats Capacity */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Total Seats</span>
                  <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Users className="size-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {preview.totalSeats.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ~{Math.round(preview.totalSeats / (preview.validCount || 1))} seats / hall
                  </div>
                </div>
              </div>

              {/* Box 3: Buildings Detected */}
              <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Buildings</span>
                  <div className="size-7 rounded-lg bg-muted text-foreground flex items-center justify-center">
                    <Building2 className="size-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {preview.buildingsSummary.length}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {preview.uniqueBuildings.join(", ") || "Main"}
                  </div>
                </div>
              </div>

              {/* Box 4: Conflicts / Status Box */}
              <div
                className={`rounded-xl border p-3.5 flex flex-col justify-between ${
                  !preview.hasConflicts
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Conflicts</span>
                  <div
                    className={`size-7 rounded-lg flex items-center justify-center ${
                      !preview.hasConflicts
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {!preview.hasConflicts ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <AlertTriangle className="size-4" />
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold tracking-tight">
                    {preview.hasConflicts ? preview.conflictCount : "0"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {!preview.hasConflicts ? "Clean & Ready" : "Notice / Overlaps"}
                  </div>
                </div>
              </div>
            </div>

            {/* Box 2: Buildings & Floor Distribution Card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Buildings & Blocks Detected ({preview.buildingsSummary.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="include-floor-toggle"
                    checked={includeFloorInBlock}
                    onCheckedChange={handleToggleFloor}
                  />
                  <Label
                    htmlFor="include-floor-toggle"
                    className="text-xs font-medium cursor-pointer text-muted-foreground"
                  >
                    Include Floor in Block Name (e.g. "Main (Floor 1)")
                  </Label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {preview.buildingsSummary.map((b) => (
                  <div
                    key={b.building}
                    className="flex flex-col justify-between p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {b.building}
                      </span>
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
                        {b.roomCount} halls
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                      <span>{b.totalSeats.toLocaleString()} seats</span>
                      {b.floors.length > 0 && (
                        <span className="truncate max-w-[120px] text-right">
                          {b.floors.map((fl) => `Fl ${fl}`).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Box 3: Conflict Status & Resolution Box */}
            {!preview.hasConflicts ? (
              /* Zero Conflicts Card */
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/30 p-4 flex items-start gap-3 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    Zero Conflicts Detected — All {preview.validCount} Rooms Are Ready!
                  </p>
                  <p className="text-xs text-emerald-700/90 dark:text-emerald-400/90">
                    All rooms are completely unique. None clash with existing rooms in your database, and no duplicate rows exist in your Excel file.
                  </p>
                </div>
              </div>
            ) : (
              /* Conflicts / Overlaps Alert Card */
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Conflict & Overlap Resolution
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Overlap with DB */}
                  {preview.existingRooms.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-amber-500/20 bg-background/80 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                            {preview.existingRooms.length} Existing Room(s)
                          </Badge>
                          <span className="text-muted-foreground text-[11px]">
                            already exist in database
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            id="update-existing-switch"
                            checked={updateExisting}
                            onCheckedChange={setUpdateExisting}
                          />
                          <Label
                            htmlFor="update-existing-switch"
                            className="text-[11px] cursor-pointer font-medium"
                          >
                            {updateExisting ? "Update capacities in database" : "Skip existing rooms (Insert new only)"}
                          </Label>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pt-1">
                        {preview.existingRooms.slice(0, 15).map((r) => (
                          <Badge
                            key={r.key}
                            variant="secondary"
                            className="text-[10px] font-mono py-0 text-muted-foreground"
                          >
                            {r.block} - {r.roomNumber} ({r.capacity} seats)
                          </Badge>
                        ))}
                        {preview.existingRooms.length > 15 && (
                          <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                            +{preview.existingRooms.length - 15} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Duplicate in sheet */}
                  {preview.duplicateRooms.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-destructive">
                        <span>{preview.duplicateRooms.length} duplicate classroom(s) in Excel</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        The same classroom was found multiple times in this Excel sheet. Only the first entry will be processed.
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {preview.duplicateRooms.slice(0, 10).map((r) => (
                          <Badge key={r.key} variant="destructive" className="text-[10px] py-0">
                            {r.block} - {r.roomNumber}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Invalid rows */}
                  {preview.invalidRooms.length > 0 && (
                    <div className="p-2.5 rounded-lg border border-border bg-muted/30 space-y-1">
                      <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <Info className="size-3.5" />
                        <span>{preview.invalidRooms.length} incomplete row(s) skipped</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Rows with empty classroom numbers or zero capacities were automatically omitted.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Box 4: Optional Collapsible Room Inspector (Never blocks scrolling!) */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRoomList(!showRoomList)}
                className="w-full flex items-center justify-between p-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Search className="size-3.5" />
                  Want to inspect individual rooms? ({preview.validCount} halls)
                </span>
                {showRoomList ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>

              {showRoomList && (
                <div className="p-3 border-t border-border space-y-2.5 bg-muted/10">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Quick search by room number, building, floor..."
                      className="h-8 pl-8 text-xs bg-background"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground uppercase text-[10px] font-semibold border-b border-border">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Building</th>
                          <th className="p-2 text-left">Classroom</th>
                          <th className="p-2 text-left">Layout</th>
                          <th className="p-2 text-left">Capacity</th>
                          <th className="p-2 text-right pr-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredRooms.slice(0, 50).map((room, idx) => (
                          <tr key={room.key} className="hover:bg-muted/30">
                            <td className="p-2 text-muted-foreground">{idx + 1}</td>
                            <td className="p-2 font-medium">{room.block}</td>
                            <td className="p-2 font-bold">{room.classroom}</td>
                            <td className="p-2 text-muted-foreground font-mono">
                              {room.rowCount} × {room.seatsPerRow}
                            </td>
                            <td className="p-2 font-semibold text-primary">{room.capacity}</td>
                            <td className="p-2 text-right pr-3">
                              {room.status === "already_exists" ? (
                                <Badge variant="outline" className="text-[10px] py-0 border-amber-500/40 text-amber-600">
                                  Update
                                </Badge>
                              ) : room.isValid ? (
                                <Badge variant="secondary" className="text-[10px] py-0 text-emerald-600">
                                  New
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] py-0">
                                  Invalid
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer with One-Click Import Action */}
        <DialogFooter className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border mt-auto">
          {preview ? (
            <div className="text-xs text-muted-foreground">
              Ready to import: <strong className="text-foreground">{countToImport} halls</strong> ·{" "}
              <strong className="text-primary">{seatsToImport.toLocaleString()}</strong> seats
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {preview && (
              <Button
                onClick={() => importMutation.mutate()}
                disabled={countToImport === 0 || importMutation.isPending}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {importMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Import {countToImport} Halls Now
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
