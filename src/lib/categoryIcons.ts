import {
  Smartphone, Shirt, Lamp, Wrench, Car, Palette, Music, Bike, Gamepad2,
  BookOpen, Sparkles, Package, LayoutGrid, type LucideIcon,
} from 'lucide-react'

// ================================================================
// categories.icon has held a lucide name since the first seed and has
// never been rendered. This connects it.
//
// A static map rather than lucide's dynamic loader: twelve icons is not
// worth shipping the whole set for, and an explicit table fails
// visibly — a slug nobody mapped falls back to the box rather than to a
// blank space that looks like a layout bug.
// ================================================================

const ICONS: Record<string, LucideIcon> = {
  smartphone:  Smartphone,
  shirt:       Shirt,
  lamp:        Lamp,
  wrench:      Wrench,
  car:         Car,
  palette:     Palette,
  music:       Music,
  bike:        Bike,
  'gamepad-2': Gamepad2,
  'book-open': BookOpen,
  sparkles:    Sparkles,
  package:     Package,
}

export function categoryIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Package
}

export const AllIcon = LayoutGrid
