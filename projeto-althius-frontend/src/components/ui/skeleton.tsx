import { cn } from "@/lib/utils"

/**
 * Esqueleto de carregamento, adaptado do Coss UI Skeleton (via shoogle.dev/shadcn-components/loader):
 * bloco chapado na cor de preenchimento, com pulso suave e sem brilho colorido, como pede o manual.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse bg-al-hover motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
