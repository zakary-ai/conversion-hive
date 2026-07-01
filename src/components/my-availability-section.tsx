import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import {
  CloserAvailabilityEditor,
  emptyWeekly,
  normalizeWeekly,
  type Weekly,
} from "./closer-availability-editor";
import {
  getMyAvailabilityDeclaration,
  saveMyAvailabilityDeclaration,
} from "@/lib/api/closer-availability.functions";

export function MyAvailabilitySection({
  lines,
  label,
}: {
  lines: ("b2b" | "b2c")[];
  label: string;
}) {
  const qc = useQueryClient();
  const primary = lines[0];
  const { data } = useQuery({
    queryKey: ["my-availability-declaration", primary],
    queryFn: () => getMyAvailabilityDeclaration({ data: { line: primary } }),
    enabled: !!primary,
  });

  const [open, setOpen] = useState(false);
  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setWeekly(normalizeWeekly(data?.weekly ?? []));
    setNotes(data?.notes ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      for (const line of lines) {
        await saveMyAvailabilityDeclaration({ data: { line, weekly, notes } });
      }
    },
    onSuccess: () => {
      toast.success("Availability saved");
      for (const line of lines) {
        qc.invalidateQueries({ queryKey: ["my-availability-declaration", line] });
      }
      qc.invalidateQueries({ queryKey: ["admin-availability-declarations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
              {label}{" "}
              <span className="text-xs font-normal text-muted-foreground">(informational)</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {open
                ? "Let admins know when you're available. This does not change your booking calendar."
                : "Tap to edit your weekly availability and notes."}
            </p>
          </div>
        </button>
        {open && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        )}
      </div>
      {open && (
        <CloserAvailabilityEditor
          weekly={weekly}
          notes={notes}
          onChange={(v) => {
            setWeekly(v.weekly);
            setNotes(v.notes);
          }}
        />
      )}
    </Card>
  );
}
