"use client"

import { type ErrorBoundaryProps, ErrorState } from "@/components/error-state"

// Error boundaries must be Client Components in the App Router. Boundary ini menangkap
// error halaman di dalam shell dashboard; error dari app/dashboard/layout.tsx sendiri
// naik ke app/error.tsx karena error.tsx tidak membungkus layout di segmen yang sama.
export default function DashboardError({ error, retry }: ErrorBoundaryProps) {
  return <ErrorState error={error} retry={retry} />
}
