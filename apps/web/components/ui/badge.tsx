import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        primary: "border border-primary bg-primary/20 text-primary",
        green: "border border-green-500 bg-green-500/20 text-green-500",
        blue: "border border-blue-500 bg-blue-500/20 text-blue-500",
        red: "border border-red-500 bg-red-500/20 text-red-500",
        teal: "border border-teal-500 bg-teal-500/20 text-teal-500",
        purple: "border border-purple-500 bg-purple-500/20 text-purple-500",
        gray: "border border-gray-500 bg-gray-500/20 text-gray-500",
        coral: "border border-coral-500 bg-coral-500/20 text-coral-500",
        outline: "border border-neutral-800 bg-transparent text-neutral-100",
        warning: "border border-warning bg-warning/20 text-warning",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem]",
        md: "px-3 py-0.5 text-[0.8125rem]",
        lg: "px-4 py-1 text-xs",
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Badge({
  className,
  variant = "primary",
  size = "md",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
