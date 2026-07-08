"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

export function SearchInput({
  defaultValue,
  placeholder = "RFC, teléfono, nombre o subscriber",
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
          params.set("q", value.trim());
        } else {
          params.delete("q");
        }
        router.push(`${pathname}?${params.toString()}`);
      }, 400);
    },
    [router, pathname, searchParams],
  );

  return (
    <input
      className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-primary"
      defaultValue={defaultValue ?? ""}
      name="q"
      onChange={handleChange}
      placeholder={placeholder}
      type="search"
    />
  );
}
