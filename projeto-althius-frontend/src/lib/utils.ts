import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Indexa uma lista pelo `id` de cada item. */
export function porId<T extends { id: string }>(lista: T[] = []): Record<string, T> {
  return Object.fromEntries(lista.map((item) => [item.id, item]))
}
