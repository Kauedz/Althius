import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Selo da marca, adaptado do ReUI Badge e do Shadcnblocks Pill (via shoogle.dev/shadcn-components/badge).
 * Formato reto (selo) ou pílula; Oswald 400 maiúsculo com entreletra 0,18em; cor só quando o estado exige.
 */
const badgeVariants = cva(
  "inline-flex h-5.5 shrink-0 items-center gap-1.5 px-2 text-[0.6875rem] font-normal tracking-rotulo whitespace-nowrap uppercase",
  {
    variants: {
      tom: {
        neutro: "border border-al-line text-al-muted",
        quente: "bg-al-rosa-suave text-al-rosa-texto",
        morna: "bg-al-atencao-suave text-al-accent-2",
        fria: "bg-al-hover text-al-muted",
        sucesso: "bg-al-sucesso-suave text-al-sucesso",
        atencao: "bg-al-atencao-suave text-al-atencao",
        erro: "border border-al-erro/40 text-al-erro",
        agente: "bg-al-agente-suave text-al-agente",
      },
      forma: { selo: "rounded-none", pilula: "rounded-full" },
    },
    defaultVariants: { tom: "neutro", forma: "selo" },
  }
)

function Badge({ className, tom, forma, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tom, forma }), className)} {...props} />
}

export { Badge, badgeVariants }
