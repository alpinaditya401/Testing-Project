"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

// false selama HTML dari server belum dihidrasi, true sesudahnya. Formulir yang
// hanya bekerja lewat onSubmit memakainya untuk menahan tombol kirim: sebelum hidrasi,
// tombol yang aktif akan memicu submit bawaan browser, yang tidak pernah sampai ke API.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
