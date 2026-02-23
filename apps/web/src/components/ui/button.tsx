"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700",
                secondary:
                    "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200",
                danger:
                    "bg-danger text-white hover:bg-red-700 active:bg-red-800",
                ghost:
                    "text-primary-600 hover:bg-primary-50 active:bg-primary-100",
                link:
                    "text-primary-600 underline-offset-4 hover:underline",
            },
            size: {
                default: "h-9 px-4",
                sm: "h-8 px-3 text-xs",
                lg: "h-10 px-6",
                icon: "h-9 w-9",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> { }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };