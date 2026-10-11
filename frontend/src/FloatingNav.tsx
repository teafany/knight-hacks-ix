import { useEffect, useRef, useState } from "react";
import { X, type LucideIcon } from "lucide-react";

type NavItem = {
  page: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
};

export default function FloatingNav({
  activePage,
  items,
}: {
  activePage: string;
  items: NavItem[];
}) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const open = hovered || expanded;
  const close = () => {
    setHovered(false);
    setExpanded(false);
  };

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setHovered(false);
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <nav
      ref={navRef}
      className={`app-nav ${open ? "is-open" : ""}`}
      aria-label="Primary navigation"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => {
        // Keep navigation available while a keyboard user is inside it.
        if (!navRef.current?.contains(document.activeElement)) setHovered(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          close();
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="app-nav-inner">
        <button
          ref={toggleRef}
          type="button"
          className="app-nav-toggle"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="workspace-navigation-links"
          onClick={() => {
            if (open) close();
            else setExpanded(true);
          }}
        >
          {open ? <X aria-hidden="true" /> : <span className="app-nav-dot" />}
        </button>
        <div
          id="workspace-navigation-links"
          className="app-nav-links"
          hidden={!open}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                className={`app-nav-link ${activePage === item.page ? "active" : ""}`}
                key={item.page}
                aria-current={activePage === item.page ? "page" : undefined}
                onClick={() => {
                  close();
                  item.onClick();
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
