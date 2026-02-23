import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-9 w-full rounded border border-neutral-300 bg-white px-3 py-1",
                    "text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400",
                    "transition-colors",
                    "focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20",
                    "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
                    "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20",
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = "Input";

export { Input };