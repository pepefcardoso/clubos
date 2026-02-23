"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, ...props }, ref) => (
        <label
            ref={ref}
            className={cn(
                "text-[0.8125rem] font-medium leading-none text-neutral-700",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                className,
            )}
            {...props}
        />
    ),
);
Label.displayName = "Label";

export { Label };