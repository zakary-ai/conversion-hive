import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import {
  CloserAvailabilityEditor,
  emptyWeekly,
  normalizeWeekly,
  type Weekly,
} from "@/components/closer-availability-editor";
import {
  listAvailabilityDeclarations,
  adminSaveAvailabilityDeclaration,
} from "@/lib/api/closer-availability.functions";

type Row = {
  closer_id: string;
  closer_user_id: string | null;
  full_name: string;
  email: string;
  active: boolean;
  declaration: { weekly: Weekly; notes: string; updated_at: string } | null;
};

export function AdminCloserAvailabilityPanel({ line }: { line: "b2b" | "b2c" }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-availability-declarations", line],
    queryFn: () => listAvailabilityDeclarations({ data: { line } }),
  });

  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-start gap-2 text-left min-w-0 flex-1"
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <h3 className="font-display font-semibold">
              Closer availability{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (informational — does not affect booking hours)
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {open
                ? "What each closer has declared. You can edit on their behalf."
                : `Tap to view what ${line.toUpperCase()} closers declared.`}
            </p>
          </div>
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              No {line.toUpperCase()} closers yet.
            </div>
          )}
          {(rows as Row[]).map((r) => (
            <CloserRow key={r.closer_id} row={r} line={line} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CloserRow({ row, line }: { row: Row; line: "b2b" | "b2c" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setWeekly(normalizeWeekly(row.declaration?.weekly ?? []));
    setNotes(row.declaration?.notes ?? "");
  }, [row.declaration]);

  const save = useMutation({
    mutationFn: () => {
      if (!row.closer_user_id) throw new Error("Closer has no linked user account");
      return adminSaveAvailabilityDeclaration({
        data: { closer_user_id: row.closer_user_id, line, weekly, notes },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-availability-declarations", line] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasData =
    !!row.declaration && (row.declaration.notes || row.declaration.weekly?.some((d) => d.enabled));

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2">
            {row.full_name}
            {!row.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
            {hasData ? (
              <Badge variant="secondary" className="text-[10px]">Set</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Not set</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {!row.closer_user_id && (
            <div className="text-xs text-muted-foreground">
              This closer has no linked user account yet, so you can't save changes here.
            </div>
          )}
          <CloserAvailabilityEditor
            weekly={weekly}
            notes={notes}
            onChange={(v) => {
              setWeekly(v.weekly);
              setNotes(v.notes);
            }}
            readOnly={!row.closer_user_id}
          />
          {row.closer_user_id && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
