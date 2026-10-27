import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SuggestInput } from "@/components/shared/SuggestInput";
import { RoomImportDialog } from "@/components/rooms/RoomImportDialog";
import { createRoom, deleteRoom, listRooms, updateRoom, type Room } from "@/lib/seating";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({
    meta: [
      { title: "Exam halls & rooms | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Maintain examination halls with block, room number, row and seat layout used by the seating arrangement engine.",
      },
      { property: "og:title", content: "Exam halls & rooms | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Room master data with seat grid layout for exam seating allocation.",
      },
    ],
  }),
  component: RoomsPage,
});

const schema = z.object({
  block: z.string().trim().min(1, "Block is required").max(40),
  room_number: z.string().trim().min(1, "Room number is required").max(20),
  row_count: z.number().int().min(1, "At least 1 row").max(30),
  seats_per_row: z.number().int().min(1, "At least 1 seat per row").max(30),
  is_active: z.boolean(),
});

const EMPTY = { block: "Main", room_number: "", row_count: 5, seats_per_row: 6, is_active: true };

function RoomsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading } = useQuery({ queryKey: ["rooms"], queryFn: listRooms });
  const rooms = data ?? [];

  const totals = useMemo(
    () => ({
      halls: rooms.length,
      active: rooms.filter((room) => room.is_active).length,
      seats: rooms
        .filter((room) => room.is_active)
        .reduce((sum, room) => sum + room.row_count * room.seats_per_row, 0),
    }),
    [rooms],
  );

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      return editing ? updateRoom(editing.id, parsed) : createRoom(parsed);
    },
    onSuccess: () => {
      toast.success(editing ? "Room updated" : "Room added");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Invalid input")
          : error instanceof Error
            ? error.message
            : "Could not save room",
      ),
  });

  const remove = useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      toast.success("Room deleted");
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: () => toast.error("Cannot delete this room while seating plans reference it."),
  });

  return (
    <AdminLayout title="Exam halls" description="Rooms and seat grid layout">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Halls", value: totals.halls },
          { label: "Active halls", value: totals.active },
          { label: "Usable seats", value: totals.seats },
        ].map((stat) => (
          <div key={stat.label} className="panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <p className="text-sm font-medium">Hall register</p>
          <div className="flex items-center gap-2">
            <RoomImportDialog triggerText="Import Halls (Excel)" />
            <Button
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> New hall
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No halls yet. Add a hall such as Block A / Room 101 with 5 rows × 6 seats.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Block</th>
                  <th className="px-4 py-2.5 font-medium">Room</th>
                  <th className="px-4 py-2.5 font-medium">Layout</th>
                  <th className="px-4 py-2.5 font-medium">Capacity</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="px-4 py-2.5">{room.block}</td>
                    <td className="px-4 py-2.5 font-medium">{room.room_number}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {room.row_count} rows × {room.seats_per_row} seats
                    </td>
                    <td className="px-4 py-2.5">{room.row_count * room.seats_per_row}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={room.is_active ? "default" : "secondary"}>
                        {room.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(room);
                          setForm({
                            block: room.block,
                            room_number: room.room_number,
                            row_count: room.row_count,
                            seats_per_row: room.seats_per_row,
                            is_active: room.is_active,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(room.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit hall" : "New hall"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block">Block</Label>
              <SuggestInput
                id="block"
                value={form.block}
                maxLength={40}
                onChange={(value) => setForm({ ...form, block: value })}
                suggestions={[...new Set(rooms.map((room) => room.block))].map((block) => ({
                  value: block,
                  hint: `${rooms.filter((room) => room.block === block).length} halls`,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-number">Room number</Label>
              <Input
                id="room-number"
                value={form.room_number}
                maxLength={20}
                onChange={(event) => setForm({ ...form, room_number: event.target.value })}
                placeholder="101"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rows">Rows (benches deep)</Label>
              <Input
                id="rows"
                type="number"
                min={1}
                max={30}
                value={form.row_count}
                onChange={(event) =>
                  setForm({ ...form, row_count: Number(event.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seats">Seats per row</Label>
              <Input
                id="seats"
                type="number"
                min={1}
                max={30}
                value={form.seats_per_row}
                onChange={(event) =>
                  setForm({ ...form, seats_per_row: Number(event.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="active">Available for allocation</Label>
              <span className="ml-auto text-sm text-muted-foreground">
                Capacity {form.row_count * form.seats_per_row}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save hall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}