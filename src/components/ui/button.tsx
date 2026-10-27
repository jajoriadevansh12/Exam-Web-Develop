import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#166534] text-white font-semibold rounded-full border-0 shadow-sm hover:bg-[#0F4526] transition-colors duration-200",
        destructive:
          "bg-destructive text-destructive-foreground rounded-full shadow-sm hover:bg-destructive/90 transition-colors duration-200",
        outline:
          "border border-[#D5DDD8] bg-white text-[#1A1F1C] rounded-full shadow-xs hover:border-[#1F7A4D] hover:text-[#1F7A4D] transition-all duration-200 aria-selected:bg-[#E6F4EC] aria-selected:border-[#1F7A4D] aria-selected:text-[#1F7A4D] data-[state=active]:bg-[#E6F4EC] data-[state=active]:border-[#1F7A4D] data-[state=active]:text-[#1F7A4D]",
        pill:
          "border border-[#D5DDD8] bg-white text-[#1A1F1C] rounded-full shadow-xs hover:border-[#1F7A4D] active:bg-[#E6F4EC] active:border-[#1F7A4D] active:text-[#1F7A4D] aria-selected:bg-[#E6F4EC] aria-selected:border-[#1F7A4D] aria-selected:text-[#1F7A4D] data-[state=active]:bg-[#E6F4EC] data-[state=active]:border-[#1F7A4D] data-[state=active]:text-[#1F7A4D] transition-all duration-200",
        secondary:
          "bg-[#E3EEE8] text-[#14532D] font-semibold rounded-full shadow-xs hover:bg-[#D9EFE2] transition-colors duration-200",
        ghost:
          "text-[#1A1F1C] rounded-full hover:bg-[#E6F4EC] hover:text-[#1F7A4D] transition-colors duration-200",
        link:
          "text-[#1F7A4D] underline-offset-4 hover:underline font-semibold",
      },
      size: {
        default: "h-10 px-7 py-2.5", // 10px 28px padding
        sm: "h-8 px-4 text-xs rounded-full",
        lg: "h-11 px-8 text-base rounded-full",
        pill: "h-9 px-6 py-2 text-xs", // 8px 24px padding
        icon: "size-10 rounded-xl bg-white border border-[#D5DDD8] shadow-[0_1px_4px_rgba(20,83,45,0.08)] hover:border-[#1F7A4D] transition-all duration-200",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
