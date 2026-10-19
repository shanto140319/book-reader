/**
 * Scrolls only the nearest `[data-sidebar-scroll]` container so `el` is visible.
 * (Element.scrollIntoView also scrolls every ancestor, which could pull the
 * off-screen phone drawer into view.)
 */
export function revealInSidebar(el: HTMLElement, mode: "nearest" | "center" = "nearest") {
  const container = el.closest<HTMLElement>("[data-sidebar-scroll]");
  if (!container) return;
  const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  const bottom = top + el.offsetHeight;
  const margin = 16;

  if (mode === "center") container.scrollTop = top - (container.clientHeight - el.offsetHeight) / 2;
  else if (top < container.scrollTop + margin) container.scrollTop = top - margin;
  else if (bottom > container.scrollTop + container.clientHeight - margin)
    container.scrollTop = bottom - container.clientHeight + margin;
}
