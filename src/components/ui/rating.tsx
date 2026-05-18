import { Star } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type RatingProps = {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
  className?: string;
  "aria-label"?: string;
};

const sizeMap = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

export function Rating({
  value,
  onChange,
  max = 10,
  size = "md",
  readOnly = false,
  className,
  "aria-label": ariaLabel,
}: RatingProps) {
  const [hover, setHover] = React.useState<number | null>(null);
  const displayValue = hover ?? value;

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", readOnly && "pointer-events-none", className)}
      role="group"
      aria-label={ariaLabel ?? `Rating, ${value} of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const filled = star <= displayValue;
        return (
          <button
            type="button"
            key={star}
            aria-label={`Rate ${star} of ${max}`}
            onClick={() => onChange?.(star === value ? 0 : star)}
            onMouseEnter={() => !readOnly && setHover(star)}
            onMouseLeave={() => !readOnly && setHover(null)}
            disabled={readOnly}
            className={cn(
              "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !readOnly && "cursor-pointer transition-transform hover:scale-110",
            )}
          >
            <Star
              className={cn(
                sizeMap[size],
                filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
