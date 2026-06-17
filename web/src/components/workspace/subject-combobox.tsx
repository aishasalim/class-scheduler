"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getTamuSubjectName,
  isKnownTamuSubject,
  normalizeSubjectCode,
  searchTamuSubjects,
  type TamuSubject,
} from "@/lib/tamu-subjects";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type SubjectComboboxProps = {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export function SubjectCombobox({ value, onChange, required, disabled }: SubjectComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const normalized = normalizeSubjectCode(value);
  const resolvedName = getTamuSubjectName(normalized);
  const unknown = normalized.length >= 2 && !isKnownTamuSubject(normalized);

  const suggestions = useMemo(
    () => (normalized.length >= 1 ? searchTamuSubjects(normalized, 14) : []),
    [normalized]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [normalized, open]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(subject: TamuSubject) {
    onChange(subject.code);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key === "ArrowDown" && suggestions.length > 0) {
      setOpen(true);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && suggestions[activeIndex]) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(normalizeSubjectCode(e.target.value));
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Subject (CSCE)"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && suggestions.length > 0}
        required={required}
        disabled={disabled}
        className={cn(
          "font-mono uppercase",
          unknown && "border-amber-500/60 focus-visible:ring-amber-500/30"
        )}
      />
      {resolvedName ? (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">{resolvedName}</p>
      ) : unknown ? (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
          Unknown code — keep typing or enter manually
        </p>
      ) : null}

      {open && suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-md"
        >
          {suggestions.map((subject, idx) => (
            <button
              key={subject.code}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={cn(
                "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/80",
                idx === activeIndex && "bg-muted/80"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(subject)}
            >
              <span className="w-12 shrink-0 font-mono font-semibold">{subject.code}</span>
              <span className="truncate text-muted-foreground">{subject.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
