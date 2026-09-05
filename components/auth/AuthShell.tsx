import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for the auth screens (currently just /entrar):
 *   - branded illustration / icon block
 *   - title + subtitle
 *   - children (the actual form)
 *   - footer with the "outra opção" link
 *
 * Visual spine matches the rest of the app (glass-card on grid-pattern with
 * neon accent) but treats the auth screens as a small focused funnel.
 */
export function AuthShell({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  footerText,
  footerLinkText,
  footerLinkHref,
}: {
  icon: string;
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
  footerText: string;
  footerLinkText: string;
  footerLinkHref: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center text-center gap-3 pt-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/30 to-secondary-container/30 blur-2xl rounded-full" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-[0_0_30px_rgba(255,107,0,0.3)]">
            <span className="material-symbols-outlined text-white text-[32px]">
              {icon}
            </span>
          </div>
        </div>
        <span className="font-label-md text-label-md uppercase tracking-[0.2em] text-primary-container">
          {eyebrow}
        </span>
        <h1 className="font-display-lg text-[32px] leading-tight text-on-surface tracking-tight">
          {title}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-[320px]">
          {subtitle}
        </p>
      </header>

      <div className="glass-card rounded-2xl p-5">{children}</div>

      <p className="text-center font-body-md text-[14px] text-on-surface-variant">
        {footerText}{" "}
        <Link
          href={footerLinkHref}
          className="text-primary-container font-semibold hover:opacity-80"
        >
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}

/**
 * Form field with a leading icon and a Material-style floating-label feel.
 * Use it inside AuthShell forms.
 */
export function IconField({
  icon,
  label,
  type,
  value,
  onChange,
  required = false,
  placeholder,
  autoComplete,
}: {
  icon: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-label-md text-[12px] uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <div className="relative flex items-center">
        <span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[20px] pointer-events-none">
          {icon}
        </span>
        <input
          type={type}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-black border border-white/10 rounded-xl py-3 pl-12 pr-4 font-body-md text-on-surface placeholder:text-surface-variant focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-colors"
        />
      </div>
    </label>
  );
}
