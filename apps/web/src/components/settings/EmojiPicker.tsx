import {
  Suspense,
  lazy,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import type { EmojiClickData, EmojiStyle, Theme } from "emoji-picker-react";
import { cn } from "@/lib/utils";
import { LUCIDE_ICON_MAP, PersonaIcon } from "@/components/ui/PersonaIcon";

const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICON_MAP);
const Picker = lazy(() => import("emoji-picker-react"));
const NATIVE_EMOJI_STYLE = "native" as EmojiStyle;
const AUTO_THEME = "auto" as Theme;

type PickerTab = "emoji" | "icons";

// =============================================================================
// EmojiPicker component
// =============================================================================

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  id?: string;
}

export function EmojiPicker({ value, onChange, id }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PickerTab>("emoji");
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
    (icon: string) => {
      onChange(icon);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleEmojiSelect = useCallback(
    (emojiData: EmojiClickData) => {
      handleSelect(emojiData.emoji);
    },
    [handleSelect]
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        id={id}
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
        <PersonaIcon icon={value} size="sm" />
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-2 w-[22rem] origin-top-left overflow-hidden rounded-xl border border-border/50 bg-card shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-150"
          )}
        >
          {/* Category tabs */}
          <div className="flex border-b border-border/50">
            <button
              type="button"
              onClick={() => setActiveTab("emoji")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                activeTab === "emoji"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Emoji
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("icons")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                activeTab === "icons"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Icons
            </button>
          </div>

          {/* Icon / Emoji grid */}
          {activeTab === "emoji" ? (
            <div className="bg-card p-2">
              <Suspense
                fallback={
                  <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
                    Loading emoji picker...
                  </div>
                }
              >
                <Picker
                  onEmojiClick={handleEmojiSelect}
                  autoFocusSearch={false}
                  emojiStyle={NATIVE_EMOJI_STYLE}
                  lazyLoadEmojis
                  previewConfig={{ showPreview: false }}
                  searchPlaceholder="Search emoji"
                  skinTonesDisabled={false}
                  theme={AUTO_THEME}
                  width="100%"
                  height={360}
                />
              </Suspense>
            </div>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 p-2">
              {LUCIDE_ICON_NAMES.map((name) => {
                const LucideComp = LUCIDE_ICON_MAP[name];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelect(name)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-all",
                      "hover:scale-110 hover:bg-primary/10",
                      name === value &&
                        "bg-primary/15 ring-1 ring-primary/30"
                    )}
                    aria-label={`Select ${name} icon`}
                  >
                    <LucideComp className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
