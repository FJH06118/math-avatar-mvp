import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { Formula } from "@/types";

const statusLabels: Record<Formula["status"], string> = {
  valid: "正常",
  warning: "需确认",
  error: "有错误",
};

function FormulaStatusIcon({ status }: { status: Formula["status"] }) {
  if (status === "valid") {
    return <CheckCircle2Icon aria-hidden="true" />;
  }
  if (status === "warning") {
    return <AlertTriangleIcon aria-hidden="true" />;
  }
  return <XCircleIcon aria-hidden="true" />;
}

export function FormulaList({ formulas }: { formulas: Formula[] }) {
  if (formulas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">本页未识别到数学公式</p>
        <p className="text-sm text-muted-foreground">
          如课件中实际包含公式，可在真实后端接入后重新识别。
        </p>
      </div>
    );
  }

  return (
    <ItemGroup>
      {formulas.map((formula) => (
        <Item key={formula.id} variant="outline" className="items-start">
          <ItemMedia
            variant="icon"
            className={
              formula.status === "error"
                ? "text-destructive"
                : formula.status === "warning"
                  ? "text-muted-foreground"
                  : "text-primary"
            }
          >
            <FormulaStatusIcon status={formula.status} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ItemTitle>公式检查</ItemTitle>
              <Badge
                variant={
                  formula.status === "error"
                    ? "destructive"
                    : formula.status === "valid"
                      ? "secondary"
                      : "outline"
                }
              >
                {statusLabels[formula.status]}
              </Badge>
            </div>
            <div className="break-words rounded-lg bg-muted p-3 font-mono text-sm">
              {formula.latex}
            </div>
            <ItemDescription>
              中文朗读：{formula.spokenText}
            </ItemDescription>
            {formula.message ? (
              <p className="text-sm text-muted-foreground">{formula.message}</p>
            ) : null}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
