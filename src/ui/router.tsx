// A tiny hash router: #/fighter/ufc-joshua-van and so on.

import { useSyncExternalStore, type ReactNode, type MouseEvent } from "react";

function current(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/home";
}

function sub(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const raw = useSyncExternalStore(sub, current, () => "/home");
  const [path, q] = raw.split("?");
  return { path, parts: path.split("/").filter(Boolean), query: new URLSearchParams(q ?? "") };
}

export function go(path: string): void {
  if (current() === path) return;
  window.location.hash = path;
  const main = document.querySelector(".main");
  if (main) main.scrollTop = 0;
}

export function Link({ to, children, className, title }: { to: string; children: ReactNode; className?: string; title?: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
  return (
    <a href={`#${to}`} onClick={onClick} className={className} title={title}>
      {children}
    </a>
  );
}
