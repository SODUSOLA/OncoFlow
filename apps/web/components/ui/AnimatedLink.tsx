import Link from "next/link";
import { cn } from "@/lib/utils";

interface AnimatedLinkProps extends React.ComponentProps<typeof Link> {
  className?: string;
}

/** Link with an underline that grows from 0 to full width on hover. */
export function AnimatedLink({ className, children, ...props }: AnimatedLinkProps) {
  return (
    <Link
      className={cn(
        "relative inline-block after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0",
        "after:bg-current after:transition-[width] after:duration-standard after:ease-out",
        "hover:after:w-full",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
