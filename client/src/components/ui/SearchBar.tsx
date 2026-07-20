// src/components/ui/SearchBar.tsx
// ===============================
// Purpose: A reusable search input with type-ahead autocomplete.
//
// What it does:
//   - Debounces user typing by 300ms before calling the suggest API
//   - Shows a dropdown of suggestions: matching restaurant names
//     (with image + cuisines + city) and matching cuisine types
//   - Lets the user click a suggestion OR navigate with the keyboard
//     (↑/↓ to move, Enter to select, Esc to close)
//   - On Enter with no suggestion selected, falls through to a
//     "search results" page so users can still type a freeform query
//   - Closes on outside click, on Escape, or after a selection
//
// Why a separate component:
//   The hero search bar (HereSection) and the in-page search bar
//   (SearchPage) used to be two separate inputs. Now they share
//   this one — same autocomplete, same keyboard nav, one source
//   of truth for the "type-ahead" behavior.
//
// Why a dedicated /api/restaurants/suggest endpoint (not /api/restaurants?search=...):
//   The list endpoint returns full restaurant docs, totals, and
//   pagination. The suggest endpoint is tight: only the fields
//   the dropdown needs (id, name, image, cuisines, city) plus a
//   small list of matching cuisines. Autocomplete runs on every
//   keystroke (debounced) — we want a sub-50ms response.
// ===============================

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Store, UtensilsCrossed, X, MapPin } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ============================================================
// TYPES
// ============================================================

// One suggestion can be either a restaurant or a cuisine. The
// discriminator `type` lets the dropdown render them with
// different icons + layouts.
export type Suggestion =
  | {
      type: "restaurant";
      _id: string;
      name: string;
      imageUrl: string;
      cuisines: string[];
      city: string;
    }
  | {
      type: "cuisine";
      name: string;
      count: number;
    };

// ============================================================
// PROPS
// ============================================================
export interface SearchBarProps {
  /** Initial value (e.g. from URL on /search/:text). */
  defaultValue?: string;

  /**
   * Visual variant.
   *   - "hero"   — white pill with rounded-full, used on the
   *               home page hero. The input has no border (the
   *               white pill is the border).
   *   - "inline" — bordered rounded input, used in the search
   *               results page. Looks like a normal form field.
   */
  variant?: "hero" | "inline";

  /**
   * Class for the OUTER wrapper. Use this to set width (e.g.
   * "w-full max-w-2xl") from the parent — keeps the component
   * layout-agnostic.
   */
  className?: string;

  /**
   * Class for the input element itself. The input is rendered
   * inside a relative wrapper, so this styles just the input.
   */
  inputClassName?: string;

  /**
   * Called when the user presses Enter with no suggestion
   * selected. If NOT provided, the default behavior is to
   * navigate to `/search/<encoded query>`.
   *
   * Use this to handle the submit in-place (e.g. the
   * SearchPage wants to update its own filter state instead
   * of navigating away). The handler receives the trimmed
   * query string.
   */
  onSubmitQuery?: (query: string) => void;

  /**
   * Optional: render a button next to the input (e.g. the hero
   * has a "Search" button). When provided, Enter inside the
   * input also submits the form.
   */
  showSubmitButton?: boolean;

  /** Optional callback fired when the user picks a suggestion. */
  onSelectSuggestion?: (s: Suggestion) => void;

  /** Auto-focus the input on mount. */
  autoFocus?: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================
// 300ms is the sweet spot for autocomplete: fast enough to feel
// instant, slow enough to skip the API for users who type a
// burst of characters in <300ms. Tweak DEBOUNCE_MS here and the
// delay changes everywhere this component is used.
const DEBOUNCE_MS = 300;

// We require at least this many characters before firing a
// suggest query. Single-char queries match too many things and
// produce unhelpful dropdowns.
const MIN_QUERY_LENGTH = 2;

// Hard cap on how many items the dropdown shows. The server
// caps at 10, but we clamp again on the client so a future
// server change can't break the layout.
const MAX_DROPDOWN_ITEMS = 8;

// ============================================================
// COMPONENT
// ============================================================
export const SearchBar = ({
  defaultValue = "",
  variant = "hero",
  className,
  inputClassName,
  onSubmitQuery,
  showSubmitButton = false,
  onSelectSuggestion,
  autoFocus = false,
}: SearchBarProps) => {
  const navigate = useNavigate();

  // ----- Local state -----
  // `query` is what the user sees in the input. We keep it
  // separate from `debouncedQuery` so the input updates
  // instantly on every keystroke while the API call is
  // debounced.
  const [query, setQuery] = useState<string>(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // `open` is the dropdown visibility. We track this separately
  // from `suggestions.length` because we also want to show the
  // dropdown while loading and when the API returned zero.
  const [open, setOpen] = useState<boolean>(false);
  // `activeIndex` is the keyboard-cursor position in the
  // dropdown. -1 = no active item. We use this for arrow keys
  // and to decide which suggestion Enter selects.
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // ----- Dropdown position (for the portal) -----
  // We render the dropdown as a React portal attached to
  // document.body, so it escapes any parent stacking context
  // (the hero's `z-20` content, the search page's sticky
  // toolbar, etc.). The portal needs an EXPLICIT position
  // because it has no DOM ancestry to position itself against.
  // We compute that position from the input's bounding rect
  // and update it on scroll / resize.
  //
  // `null` = position not yet computed (first render after
  // the dropdown opens). We gate the portal on this so the
  // dropdown doesn't flash at (0, 0).
  const [dropdownPos, setDropdownPos] = useState<
    { top: number; left: number; width: number } | null
  >(null);

  // ----- Refs -----
  // The debounce timer. We hold it in a ref (not state) so
  // changing it doesn't trigger a re-render, AND so the
  // cleanup function in useEffect can reach the latest value.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The container div. Used by the click-outside listener to
  // detect clicks that didn't land on the search bar.
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The input element. Used to refocus after Escape and to
  // scroll the active suggestion into view.
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The current in-flight request. We use AbortController to
  // cancel stale requests when the user types again before the
  // previous one finished. Without this, a slow request could
  // overwrite a newer response (race condition).
  const abortRef = useRef<AbortController | null>(null);
  // Ref to the portaled dropdown div. The click-outside handler
  // uses this to allow clicks INSIDE the dropdown (the dropdown
  // is portaled to document.body, so it's NOT a descendant of
  // containerRef — without this ref, the outside-click logic
  // would close the dropdown the moment the user clicks a row).
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // ============================================================
  // Debounced suggest fetch
  // ============================================================
  // Watches `query`. On change:
  //   1. Cancel any pending debounce timer.
  //   2. Cancel any in-flight request.
  //   3. If query is too short, clear suggestions + close.
  //   4. Otherwise, set a 300ms timer. When it fires, fire the
  //      API call.
  // Cleanup on unmount / query change cancels both the timer
  // and the in-flight request.
  useEffect(() => {
    // Always cancel the previous timer when query changes
    // (including initial mount). This is the heart of the
    // debounce: only the LAST query within a 300ms window
    // survives.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    // Show the dropdown immediately with a loading spinner so
    // the user gets feedback that "something is happening".
    // We do this BEFORE the debounce fires — otherwise a user
    // who pauses for 300ms sees a brief flicker where the
    // dropdown closes and reopens.
    setOpen(true);
    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await api.get("/restaurants/suggest", {
          params: { q: trimmed, limit: MAX_DROPDOWN_ITEMS },
          signal: controller.signal,
        });
        // Server wraps data in { statusCode, data, message }.
        // We accept either shape (raw array OR { suggestions: ... })
        // for forward compat.
        const payload = res.data?.data;
        const list: Suggestion[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.suggestions)
          ? payload.suggestions
          : [];
        setSuggestions(list);
        setActiveIndex(-1);  // reset cursor after a new fetch
      } catch (err: any) {
        // AbortError is expected when a newer request supersedes
        // this one — we silently ignore it. Anything else (network
        // down, 500) we just clear suggestions; the user can
        // still type Enter to do a full search.
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
          setSuggestions([]);
        }
      } finally {
        // Only clear loading if this is still the active request.
        // If a newer request superseded us, the newer one's
        // finally block will set loading=false when it completes.
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      // Cleanup: cancel the pending timer on unmount or when
      // query changes again. Aborting the controller also
      // happens above, but we re-do it here for clarity.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  // ============================================================
  // Dropdown position tracking (for the portal)
  // ============================================================
  // The dropdown is portaled to document.body, so it has no
  // DOM ancestor to position itself against. We compute its
  // position from the input's bounding rect, then re-compute
  // on every scroll and resize so it stays glued to the input
  // while the user scrolls the page or rotates their phone.
  //
  // The 8-pixel `+ 8` offset is the visual "gap" between the
  // input and the dropdown — it matches the `mt-2` (0.5rem =
  // 8px) we used before the portal refactor.
  const updateDropdownPos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      // Clear the position when the dropdown closes so it
      // doesn't briefly appear at the old coords on next open.
      setDropdownPos(null);
      return;
    }
    // Compute the initial position synchronously so the
    // dropdown opens at the right place on the very first
    // frame (no flash at (0, 0)).
    updateDropdownPos();
    // `capture: true` so we catch scroll events on ANY
    // ancestor, not just window. The hero doesn't currently
    // scroll internally, but future layouts might.
    window.addEventListener("scroll", updateDropdownPos, true);
    window.addEventListener("resize", updateDropdownPos);
    return () => {
      window.removeEventListener("scroll", updateDropdownPos, true);
      window.removeEventListener("resize", updateDropdownPos);
    };
  }, [open, updateDropdownPos]);

  // ============================================================
  // Click-outside: close the dropdown
  // ============================================================
  // We attach a single window mousedown listener (not per-render
  // listener on every suggestion) and check whether the click
  // landed inside EITHER:
  //   - containerRef (the SearchBar wrapper) — clicks on the
  //     input itself shouldn't close the dropdown
  //   - dropdownRef (the portaled dropdown) — the dropdown is
  //     attached to document.body, NOT a descendant of the
  //     SearchBar, so without this second check the dropdown
  //     would close the moment the user clicks a row.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideContainer =
        containerRef.current && containerRef.current.contains(target);
      const insideDropdown =
        dropdownRef.current && dropdownRef.current.contains(target);
      if (!insideContainer && !insideDropdown) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // ============================================================
  // HANDLERS
  // ============================================================

  // Navigate when a suggestion is picked. We route differently
  // for restaurants vs cuisines:
  //   - restaurant → /restaurant/:id (full detail page)
  //   - cuisine    → /filterPage?cuisine=<name> (browse page
  //                   pre-filtered to that cuisine)
  //
  // After navigation, we close the dropdown and clear the
  // query so the input doesn't follow the user into the new
  // page (unless the caller wants it to, via onSelectSuggestion).
  const handleSelect = useCallback(
    (s: Suggestion) => {
      setOpen(false);
      setActiveIndex(-1);
      onSelectSuggestion?.(s);

      if (s.type === "restaurant") {
        // Clear the input — the destination page is a
        // restaurant detail, not a search results page. Showing
        // the query there would be confusing.
        setQuery("");
        navigate(`/restaurant/${s._id}`);
      } else {
        // For cuisines, keep the query visible briefly so the
        // user can see what they searched for. The filter page
        // reads ?cuisine=... and pre-fills the cuisine filter.
        navigate(`/filterPage?cuisine=${encodeURIComponent(s.name)}`);
      }
    },
    [navigate, onSelectSuggestion]
  );

  // Form submit handler. Three cases:
  //   1. A suggestion is active (user pressed ↓ then Enter) →
  //      select it.
  //   2. Otherwise, the query has content → either fire the
  //      onSubmitQuery callback (if provided) OR navigate to
  //      the default /search/:query page.
  //   3. Empty query → no-op.
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      handleSelect(suggestions[activeIndex]);
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    if (onSubmitQuery) {
      // In-place submit — caller handles navigation/state.
      onSubmitQuery(trimmed);
    } else {
      // Default: go to the full search results page.
      navigate(`/search/${encodeURIComponent(trimmed)}`);
    }
  };

  // Keyboard handler on the input. We only handle the keys
  // that affect the dropdown:
  //   ↓ / ↑ — move activeIndex through the suggestions
  //   Enter — handled by the form's onSubmit (we don't want
  //           to compete with the browser's default form submit)
  //   Esc   — close the dropdown + blur (or refocus, depending
  //           on UX; we close but keep focus so the user can
  //           keep typing)
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((prev) => {
        const next = prev + 1;
        // wrap at the end, OR stop at the last item — we
        // choose to stop (no wrap) because wrapping tends to
        // surprise users.
        return next >= suggestions.length ? prev : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < -1 ? -1 : next;   // -1 = no selection
      });
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  // Clear the input. Used by the small × button inside the
  // input. We also close the dropdown since the query is now
  // empty.
  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
    >
      <form
        onSubmit={handleSubmit}
        // Hero variant wraps input + button in a white pill.
        // Inline variant just renders the input (the caller
        // can put a button next to it).
        className={cn(
          variant === "hero" &&
            "flex items-stretch gap-2 bg-white rounded-full p-1",
          variant === "inline" && "relative"
        )}
        role="search"
      >
        {/* The relative wrapper holds both the input and the
            dropdown — the dropdown is positioned absolutely
            relative to this wrapper. */}
        <div className="relative flex-1 min-w-0">
          {/* Leading search icon — desktop & mobile */}
          <Search
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10",
              variant === "hero" ? "text-gray-500" : "text-gray-400"
            )}
          />

          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // Re-open the dropdown if we have suggestions or
              // are currently loading — but don't show it for
              // an empty input.
              if (
                (suggestions.length > 0 || loading) &&
                query.trim().length >= MIN_QUERY_LENGTH
              ) {
                setOpen(true);
              }
            }}
            placeholder="Search restaurants or cuisines…"
            className={cn(
              // Default: leave room for the leading icon
              "pl-9",
              // Trailing padding grows when the × / spinner is
              // visible, so the text doesn't slide under the
              // icon
              (loading || query) && "pr-9",
              variant === "hero" &&
                "border-none shadow-none focus-visible:ring-0 text-gray-800",
              inputClassName
            )}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-label="Search restaurants or cuisines"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="searchbar-suggestions"
          />

          {/* Trailing area: spinner when loading, × when not.
              Stacked in the same absolute position so the
              input's text doesn't shift. */}
          {loading && (
            <Loader2
              data-testid="searchbar-spinner"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin pointer-events-none"
            />
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Optional submit button — only for hero variant.
            Inline variant's caller provides its own button if
            needed. */}
        {showSubmitButton && (
          <button
            type="submit"
            className="bg-orange hover:bg-hoverOrange rounded-full px-6 text-white font-medium"
          >
            Search
          </button>
        )}
      </form>

      {/* ============== DROPDOWN (portaled) ============== */}
      {/* Rendered via createPortal to document.body so the
          dropdown escapes any parent stacking context. This
          matters because:
            - The hero content sits at z-20 (above the bg
              overlay) — without the portal, the dropdown
              would be trapped at z-20 and lose to the
              feature cards at z-30.
            - The search page's toolbar might use sticky
              positioning in the future, which would create
              its own stacking context trap.
          The portal also keeps the dropdown from being clipped
          by any parent's `overflow: hidden` — the HereSection
          wrapper has `overflow-hidden` to prevent the negative
          margin on the feature cards from leaking outside it.

          We also wrap in a `dropdownPos` check: the portal
          doesn't render until the position has been computed
          from the input's bounding rect, so the dropdown
          never flashes at (0, 0) on first open. */}
      {open &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            id="searchbar-suggestions"
            role="listbox"
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50"
          >
            {/* Loading state — show a small row with spinner
                while the debounced request is in flight. We
                show this only on the FIRST fetch (no
                suggestions yet). On subsequent fetches, we
                keep the old suggestions visible while the new
                ones load — feels less jumpy. */}
            {loading && suggestions.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            )}

            {/* Empty state — query has content, no errors, but
                the server returned 0 matches. */}
            {!loading && suggestions.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                No matches for{" "}
                <span className="font-semibold text-gray-700">
                  "{query.trim()}"
                </span>
              </div>
            )}

            {/* Suggestion list — capped at MAX_DROPDOWN_ITEMS
                on the client too, so a server change can't
                blow up our layout. */}
            {suggestions.length > 0 && (
              <ul className="max-h-80 overflow-y-auto py-1">
                {suggestions.slice(0, MAX_DROPDOWN_ITEMS).map((s, i) => (
                  <SuggestionRow
                    key={suggestionKey(s)}
                    suggestion={s}
                    active={i === activeIndex}
                    query={query}
                    onSelect={() => handleSelect(s)}
                    onHover={() => setActiveIndex(i)}
                  />
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

// ============================================================
// SUGGESTION ROW (sub-component)
// ============================================================
// Renders a single suggestion. Restaurants get an image +
// cuisines + city; cuisines get a UtensilsCrossed icon +
// match count. Highlight the active item with an orange-tinted
// background (matches the rest of the app's orange theme).
const SuggestionRow = ({
  suggestion,
  active,
  query,
  onSelect,
  onHover,
}: {
  suggestion: Suggestion;
  active: boolean;
  query: string;
  onSelect: () => void;
  onHover: () => void;
}) => {
  return (
    <li
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        // mousedown (not click) so the click-outside listener
        // doesn't fire and close the dropdown BEFORE our
        // onClick handler runs. The form's submit won't
        // trigger either since this is a <li>, not inside
        // the <form> onSubmit chain (well, technically the
        // form is a sibling — see comment above).
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
        active ? "bg-orange-50" : "hover:bg-gray-50"
      )}
    >
      {suggestion.type === "restaurant" ? (
        <>
          {/* Thumbnail — fallback to a generic Store icon if
              the restaurant has no imageUrl. */}
          {suggestion.imageUrl ? (
            <img
              src={suggestion.imageUrl}
              alt=""
              className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-gray-100"
            />
          ) : (
            <div className="w-10 h-10 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-orange-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {highlightMatch(suggestion.name, query)}
            </p>
            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
              {suggestion.cuisines.slice(0, 3).map((c, idx) => (
                <span key={c}>
                  {idx > 0 && <span className="text-gray-300 mr-1">·</span>}
                  {c}
                </span>
              ))}
              {suggestion.city && (
                <>
                  <span className="text-gray-300 mx-1">·</span>
                  <MapPin className="w-3 h-3 inline" />
                  {suggestion.city}
                </>
              )}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {highlightMatch(suggestion.name, query)}
            </p>
            <p className="text-xs text-gray-500 truncate">
              Cuisine · {suggestion.count} restaurant
              {suggestion.count === 1 ? "" : "s"}
            </p>
          </div>
        </>
      )}
    </li>
  );
};

// ============================================================
// HELPERS
// ============================================================

// Highlight the matched portion of the suggestion name. We
// wrap the match in <mark> so the user can see WHY this row
// appeared. The match is case-insensitive (we lowercase both
// sides). Non-matching portions are returned as plain text
// (so React doesn't try to render an array of strings).
function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

// Stable key for a suggestion, regardless of its type. The
// discriminator + name/id combo is unique enough for React's
// reconciliation.
function suggestionKey(s: Suggestion): string {
  return s.type === "restaurant" ? `r:${s._id}` : `c:${s.name}`;
}

export default SearchBar;
