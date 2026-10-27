import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Suggestion = { value: string; hint?: string };

/**
 * Text input with keyword-matching suggestions taken from existing data.
 * Matches on every whitespace-separated keyword the user types.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  className,
  emptyHint,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  maxLength?: number;
  className?: string;
  emptyHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const keywords = value.toLowerCase().split(/\s+/).filter(Boolean);
    const unique = new Map<string, Suggestion>();
    for (const item of suggestions) {
      if (!item.value.trim()) continue;
      if (!unique.has(item.value.toLowerCase())) unique.set(item.value.toLowerCase(), item);
    }
    const list = [...unique.values()];
    if (keywords.length === 0) return list.slice(0, 8);
    return list
      .filter((item) => {
        const haystack = `${item.value} ${item.hint ?? ""}`.toLowerCase();
        return keywords.every((word) => haystack.includes(word));
      })
      .slice(0, 8);
  }, [suggestions, value]);

  const showList = focused && matches.length > 0 && matches[0]?.value !== value;

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setHighlight(0);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(event) => {
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (current + 1) % matches.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === "Enter") {
            const picked = matches[highlight];
            if (picked) {
              event.preventDefault();
              onChange(picked.value);
              setFocused(false);
            }
          } else if (event.key === "Escape") {
            setFocused(false);
          }
        }}
      />
      {showList ? (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {matches.map((item, index) => (
            <li key={item.value}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  index === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.value);
                  setFocused(false);
                }}
              >
                <span className="truncate">{item.value}</span>
                {item.hint ? (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : emptyHint && focused ? (
        <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
      ) : null}
    </div>
  );
}
