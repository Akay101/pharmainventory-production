import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      className={cn("shimmer-wave rounded-md overflow-hidden", className)}
      {...props} />
  );
}

export { Skeleton }
