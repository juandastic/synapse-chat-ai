import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// Curated emoji categories for persona icons
// =============================================================================

const EMOJI_CATEGORIES = [
  {
    id: "people",
    label: "People",
    emojis: [
      "🧠", "🤖", "👤", "🧑‍💻", "👨‍🔬", "👩‍🎓", "🧙", "🧑‍🏫",
      "👨‍⚕️", "👩‍🍳", "🧑‍🎨", "👨‍🚀", "🥷", "🦸", "🧝", "🧑‍🔧",
      "😊", "😄", "😎", "🤓", "🧐", "🤔", "🤗", "😇",
      "🥰", "😈", "👻", "💀", "🎭", "👁️", "🗣️", "🫂",
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      "📚", "💡", "🔬", "🎯", "🔧", "💻", "📝", "🗂️",
      "🎨", "🎵", "🎬", "📷", "🔑", "💊", "🧪", "📡",
      "🏆", "🎓", "💼", "📊", "🗺️", "🧭", "⚙️", "🛡️",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "🌱", "🦉", "🐱", "🌊", "🌸", "🍃", "🐺", "🦋",
      "🌙", "☀️", "🌈", "🔥", "❄️", "🐉", "🦊", "🐻",
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    emojis: [
      "✨", "💜", "⭐", "🔮", "💬", "❤️", "♾️", "⚡",
      "🌀", "💎", "🫧", "☯️", "🎲", "🧿", "🪬", "💫",
    ],
  },
] as const;

// =============================================================================
// EmojiPicker component
// =============================================================================

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onChange(emoji);
      setIsOpen(false);
    },
    [onChange]
  );

  const currentCategory = EMOJI_CATEGORIES.find(
    (c) => c.id === activeCategory
  )!;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-lg border border-border/50 bg-card text-xl transition-all",
          "hover:border-primary/30 hover:bg-primary/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
          isOpen && "border-primary/30 ring-2 ring-ring/20"
        )}
        aria-label="Choose icon"
        aria-expanded={isOpen}
      >
        {value}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-2 w-72 origin-top-left rounded-xl border border-border/50 bg-card shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-150"
          )}
        >
          {/* Category tabs */}
          <div className="flex border-b border-border/50">
            {EMOJI_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  "flex-1 px-2 py-2 text-xs font-medium transition-colors",
                  activeCategory === category.id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {category.label}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2">
            {currentCategory.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-lg transition-all",
                  "hover:scale-110 hover:bg-primary/10",
                  emoji === value &&
                    "bg-primary/15 ring-1 ring-primary/30"
                )}
                aria-label={`Select ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
