import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconLink } from "@tabler/icons-react";

interface Program {
  id: number;
  name: string;
}

interface ProgramLinkSelectorProps {
  programs: Program[];
  selectedProgramId: number | null;
  onProgramChange: (programId: number | null) => void;
  label?: string;
  disabled?: boolean;
}

export function ProgramLinkSelector({
  programs,
  selectedProgramId,
  onProgramChange,
  label = "Link to Program",
  disabled,
}: ProgramLinkSelectorProps) {
  return (
    <div>
      <Label htmlFor="program-select">{label}</Label>
      <div className="flex gap-2 items-center">
        <Select
          value={selectedProgramId?.toString() || "none"}
          onValueChange={(value) => {
            const programId = value === "none" ? null : parseInt(value);
            onProgramChange(programId);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">No program</span>
            </SelectItem>
            {programs.map((program) => (
              <SelectItem key={program.id} value={program.id.toString()}>
                {program.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open("/programs", "_blank")}
          title="Manage programs"
        >
          <IconLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
