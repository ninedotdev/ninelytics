import { IconLoader2 } from "@tabler/icons-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  size = 16,
  ...props
}: { className?: string; size?: number } & Omit<React.ComponentProps<typeof IconLoader2>, "className">): React.ReactElement {
  return (
    <IconLoader2
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      size={size}
      {...props}
    />
  );
}
