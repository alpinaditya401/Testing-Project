"use client"

import { UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { fieldProps } from "@/components/ui/a11y"
import { Field } from "@/components/ui/field"
import { button, control } from "@/components/ui/styles"
import { useHydrated } from "@/hooks/use-hydrated"
import { useRegister } from "@/hooks/use-session"
import { RegisterInput } from "@/lib/api/schemas"
import { fieldErrors } from "@/lib/form"

const CONTACT_HINT = "Email aktif, atau nomor WA yang diawali 08."
const PASSWORD_HINT = "Minimal 8 karakter."
const SERIAL_HINT =
  "Boleh dikosongkan, dan serial bisa ditambahkan nanti lewat halaman Pengaturan. " +
  "Serial yang tidak terdaftar atau sudah dipakai akun lain membatalkan pendaftaran, " +
  "jadi akun belum terbentuk dan formulir ini perlu dikirim ulang."

// min-w-0 lets the field shrink below an input's intrinsic width, so the show/hide
// button next to it cannot push the row wider than a 360px screen.
const passwordInput = `${control()} min-w-0`

export function RegisterForm() {
  const router = useRouter()
  const register = useRegister()
  const hydrated = useHydrated()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)

  // Uncontrolled inputs keep the password out of React state; it still lives in the
  // DOM node, the request body, and the mutation's own variables until the cache
  // entry is dropped.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const serial = data.get("serial_number")
    const parsed = RegisterInput.safeParse({
      name: data.get("name"),
      contact: data.get("contact"),
      password: data.get("password"),
      password_confirmation: data.get("password_confirmation"),
      serial_number: serial || undefined,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      // Without this, the panel keeps showing the server error from an earlier submit
      // while the fields below already point at a different problem.
      register.reset()
      return
    }
    setErrors({})
    register.mutate(parsed.data, {
      onSuccess: () => {
        router.replace("/dashboard")
        router.refresh()
      },
    })
  }

  // Sama dengan LoginForm: tanpa method="post" dan tombol yang menunggu hidrasi,
  // password dan konfirmasinya bisa terkirim sebagai query string.
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
      <Field id="name" label="Nama lengkap" error={errors.name}>
        <input
          name="name"
          autoComplete="name"
          maxLength={100}
          className={control()}
          {...fieldProps("name", { error: errors.name })}
        />
      </Field>

      <Field id="contact" label="Email atau nomor WA" hint={CONTACT_HINT} error={errors.contact}>
        <input
          name="contact"
          autoComplete="username"
          className={control()}
          {...fieldProps("contact", { hint: CONTACT_HINT, error: errors.contact })}
        />
      </Field>

      <Field id="password" label="Password" hint={PASSWORD_HINT} error={errors.password}>
        <div className="flex gap-2">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={passwordInput}
            {...fieldProps("password", { hint: PASSWORD_HINT, error: errors.password })}
          />
          <button
            type="button"
            className={button({ tone: "secondary" })}
            aria-pressed={showPassword}
            aria-controls="password"
            onClick={() => setShowPassword((shown) => !shown)}
          >
            {showPassword ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
      </Field>

      <Field
        id="password_confirmation"
        label="Ulangi password"
        error={errors.password_confirmation}
      >
        <input
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          className={control()}
          {...fieldProps("password_confirmation", { error: errors.password_confirmation })}
        />
      </Field>

      <Field
        id="serial_number"
        label="Serial perangkat (opsional)"
        hint={SERIAL_HINT}
        error={errors.serial_number}
      >
        <input
          name="serial_number"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${control({ font: "data" })}`}
          {...fieldProps("serial_number", { hint: SERIAL_HINT, error: errors.serial_number })}
        />
      </Field>

      {register.isError ? (
        <p
          role="alert"
          className="rounded-crisp border border-alarm-coral-text p-3 text-sm text-alarm-coral-text"
        >
          {register.error.message}
        </p>
      ) : null}

      <button
        type="submit"
        className={button({ className: "w-full" })}
        disabled={!hydrated || register.isPending}
      >
        <UserPlus aria-hidden="true" className="size-5" />
        {register.isPending ? "Membuat akun..." : "Buat akun dan masuk"}
      </button>
    </form>
  )
}
