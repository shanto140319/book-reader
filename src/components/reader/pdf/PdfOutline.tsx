"use client";

import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { revealInSidebar } from "@/lib/reader/scroll";

type OutlineNode = {
  id: string; // position in the tree, e.g. "2.0.1"
  title: string;
  page: number | null; // null when the link doesn't point to a page in this file
  bold: boolean;
  italic: boolean;
  items: OutlineNode[];
};

/** One entry in reading order, with the titles of the chapters it sits inside. */
type FlatEntry = { node: OutlineNode; depth: number; parents: string[] };

type Props = {
  pdf: PDFDocumentProxy;
  currentPage: number;
  numPages: number;
  onSelect: (page: number) => void;
  onShowPages: () => void;
};

/** Search box appears once the contents are long enough to need it. */
const SEARCH_THRESHOLD = 8;

/** The PDF's built-in table of contents (bookmarks), with the current chapter highlighted. */
export function PdfOutline({ pdf, currentPage, numPages, onSelect, onShowPages }: Props) {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  // Chapters you opened or closed yourself; the rest follow "open the path to the current chapter".
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    resolveOutline(pdf).then((nodes) => !cancelled && setOutline(nodes));
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const flat = useMemo(() => flatten(outline ?? []), [outline]);

  // Current entry = the last one (in reading order) that starts on or before the current page.
  const activeIndex = useMemo(() => {
    let found = -1;
    flat.forEach((e, i) => {
      if (e.node.page !== null && e.node.page <= currentPage) found = i;
    });
    return found;
  }, [flat, currentPage]);
  const active = activeIndex >= 0 ? flat[activeIndex] : null;
  const activeId = active?.node.id ?? null;
  const activeTop = activeId ? Number(activeId.split(".")[0]) : -1; // index of its top-level chapter

  // Page range of the current entry: from its page up to the page before the next entry starts.
  const chapter = useMemo(() => {
    if (!active || active.node.page === null) return null;
    const start = active.node.page;
    const next = flat.slice(activeIndex + 1).find((e) => e.node.page !== null && e.node.page > start);
    const end = Math.max(start, (next?.node.page ?? numPages + 1) - 1);
    return { start, end };
  }, [active, activeIndex, flat, numPages]);

  // Bring the current chapter into view when the list first appears.
  const scrolledOnce = useRef(false);
  useEffect(() => {
    if (!outline || scrolledOnce.current) return;
    scrolledOnce.current = true;
    if (activeRef.current) revealInSidebar(activeRef.current, "center");
  }, [outline]);

  if (outline === null) return <OutlineSkeleton />;
  if (outline.length === 0) return <NoOutline onShowPages={onShowPages} />;

  const expandable = flat.filter((e) => e.node.items.length > 0).map((e) => e.node.id);
  const isOpen = (id: string) => toggled[id] ?? (activeId !== null && activeId.startsWith(`${id}.`));
  const anyOpen = expandable.some(isOpen);
  const toggle = (id: string) => setToggled((t) => ({ ...t, [id]: !isOpen(id) }));
  const q = query.trim().toLowerCase();

  const rowProps = (node: OutlineNode, depth: number) => ({
    node,
    depth,
    active: node.id === activeId,
    read: depth === 0 && Number(node.id) < activeTop,
    open: isOpen(node.id),
    onToggle: () => toggle(node.id),
    onSelect,
    activeRef,
  });

  const renderChildren = (nodes: OutlineNode[], depth: number) => (
    // thin guide line shows which chapter these sections belong to
    <ul className="mb-1 ml-[18px] border-l border-border pl-1.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <Row {...rowProps(node, depth)} />
          {isOpen(node.id) && node.items.length > 0 && renderChildren(node.items, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="pb-6">
      {chapter && active && (
        <button
          type="button"
          onClick={() => activeRef.current && revealInSidebar(activeRef.current, "center")}
          className="mx-3 mb-3 mt-1 block w-[calc(100%-1.5rem)] rounded-2xl border border-border bg-bg/70 p-3.5 text-left transition hover:border-accent/40"
        >
          <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            <span className="size-1.5 rounded-full bg-accent" />
            Now reading
          </span>
          {active.parents.length > 0 && (
            <span className="mt-1.5 block truncate text-[11px] text-subtle">{active.parents.join(" › ")}</span>
          )}
          <span className="mt-0.5 line-clamp-2 block text-[14px] font-semibold leading-snug tracking-[-0.005em]">
            {active.node.title}
          </span>
          <ChapterProgress page={currentPage} start={chapter.start} end={chapter.end} />
        </button>
      )}

      {(flat.length > SEARCH_THRESHOLD || expandable.length > 0) && (
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface/95 px-3 pb-2 pt-1 backdrop-blur">
          {flat.length > SEARCH_THRESHOLD ? (
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-bg px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-ring">
              <Search className="size-3.5 shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="Search contents"
                aria-label="Search contents"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-subtle hover:text-ink">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          ) : (
            <span className="flex-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-subtle">
              {outline.length} {outline.length === 1 ? "chapter" : "chapters"}
            </span>
          )}
          {expandable.length > 0 && !q && (
            <button
              type="button"
              onClick={() => setToggled(Object.fromEntries(expandable.map((id) => [id, !anyOpen])))}
              aria-label={anyOpen ? "Collapse all" : "Expand all"}
              title={anyOpen ? "Collapse all" : "Expand all"}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              {anyOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
            </button>
          )}
        </div>
      )}

      {q ? (
        <SearchResults entries={flat} query={q} activeId={activeId} onSelect={onSelect} />
      ) : (
        <nav aria-label="Table of contents" className="px-2">
          <ol>
            {outline.map((node, i) => {
              const state = i < activeTop ? "read" : i === activeTop ? "current" : "upcoming";
              return (
                <li key={node.id} className="relative pl-6">
                  {/* reading timeline: a dot per chapter, joined by a line that fills in as you read */}
                  {i < outline.length - 1 && (
                    <span
                      aria-hidden
                      className={`absolute bottom-[-17px] left-[11px] top-[17px] w-px ${i < activeTop ? "bg-accent/50" : "bg-border"}`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={`absolute left-[7px] top-[13px] size-[9px] rounded-full ${
                      state === "read"
                        ? "bg-accent/70"
                        : state === "current"
                          ? "bg-accent ring-4 ring-accent/20"
                          : "border-[1.5px] border-subtle/60 bg-surface"
                    }`}
                  />
                  <Row {...rowProps(node, 0)} />
                  {isOpen(node.id) && node.items.length > 0 && renderChildren(node.items, 1)}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}

type RowProps = {
  node: OutlineNode;
  depth: number;
  active: boolean;
  read: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: (page: number) => void;
  activeRef: React.RefObject<HTMLButtonElement | null>;
};

function Row({ node, depth, active, read, open, onToggle, onSelect, activeRef }: RowProps) {
  const top = depth === 0;
  return (
    <div className="flex items-start">
      <button
        type="button"
        ref={active ? activeRef : undefined}
        disabled={node.page === null}
        onClick={() => node.page !== null && onSelect(node.page)}
        aria-current={active ? "location" : undefined}
        className={`group/row relative flex min-w-0 flex-1 items-end gap-1.5 rounded-lg px-2 text-left transition disabled:cursor-default ${
          top ? "py-2" : "py-1.5"
        } ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}
      >
        {/* accent bar marks the current section inside a chapter */}
        {active && !top && <span aria-hidden className="absolute -left-[8px] inset-y-1.5 w-0.5 rounded-full bg-accent" />}
        <span
          className={`line-clamp-2 min-w-0 leading-snug ${top ? "text-[13.5px] font-medium" : "text-[13px]"} ${
            active
              ? "font-medium text-accent"
              : read
                ? "text-muted group-hover/row:text-ink"
                : top
                  ? "text-ink"
                  : "text-muted group-hover/row:text-ink"
          } ${node.bold && !top ? "font-medium" : ""} ${node.italic ? "italic" : ""}`}
        >
          {node.title}
        </span>
        {node.page !== null && (
          <>
            {/* dotted leader, like a printed table of contents */}
            <span aria-hidden className="mb-[5px] min-w-3 flex-1 border-b border-dotted border-subtle/40" />
            <span className={`shrink-0 text-[11.5px] tabular-nums ${active ? "font-medium text-accent" : "text-subtle"}`}>
              {node.page}
            </span>
          </>
        )}
      </button>
      {node.items.length > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${node.title}` : `Expand ${node.title}`}
          aria-expanded={open}
          className={`grid size-7 shrink-0 place-items-center rounded-md text-subtle transition hover:bg-surface-2 hover:text-ink ${
            top ? "mt-[5px]" : "mt-0.5"
          }`}
        >
          <ChevronRight className={`size-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </button>
      ) : (
        <span className="w-7 shrink-0" />
      )}
    </div>
  );
}

function ChapterProgress({ page, start, end }: { page: number; start: number; end: number }) {
  const length = end - start + 1;
  const into = Math.min(Math.max(page - start + 1, 1), length);
  const left = length - into;
  return (
    <span className="mt-3 block">
      <span className="block h-1 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${(into / length) * 100}%` }}
        />
      </span>
      <span className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
        <span>
          Page {into} of {length}
        </span>
        <span>{left === 0 ? "Last page" : `${left} ${left === 1 ? "page" : "pages"} left`}</span>
      </span>
    </span>
  );
}

function SearchResults({
  entries,
  query,
  activeId,
  onSelect,
}: {
  entries: FlatEntry[];
  query: string;
  activeId: string | null;
  onSelect: (page: number) => void;
}) {
  const results = entries.filter((e) => e.node.title.toLowerCase().includes(query));
  if (results.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-muted">No chapters match &ldquo;{query}&rdquo;</p>;
  }
  return (
    <ul className="px-2">
      {results.map(({ node, parents }) => {
        const at = node.title.toLowerCase().indexOf(query);
        const active = node.id === activeId;
        return (
          <li key={node.id}>
            <button
              type="button"
              disabled={node.page === null}
              onClick={() => node.page !== null && onSelect(node.page)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                active ? "bg-accent-soft" : "hover:bg-surface-2"
              }`}
            >
              <span className="min-w-0 flex-1">
                {parents.length > 0 && <span className="block truncate text-[11px] text-subtle">{parents.join(" › ")}</span>}
                <span className="line-clamp-2 text-[13px] leading-snug">
                  {node.title.slice(0, at)}
                  <mark className="rounded-sm bg-accent-soft px-0.5 text-accent">{node.title.slice(at, at + query.length)}</mark>
                  {node.title.slice(at + query.length)}
                </span>
              </span>
              {node.page !== null && <span className="pt-px text-[11.5px] tabular-nums text-subtle">{node.page}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OutlineSkeleton() {
  return (
    <div className="space-y-4 px-4 py-3" aria-busy>
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      {[70, 85, 60, 90, 75, 65].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="size-2 rounded-full bg-surface-2" />
          <div className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

function NoOutline({ onShowPages }: { onShowPages: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <ListTree className="size-5" strokeWidth={1.8} />
      </span>
      <p className="mt-4 text-[15px] font-semibold">No table of contents</p>
      <p className="mt-1 max-w-[15rem] text-xs leading-relaxed text-muted">
        This PDF doesn&apos;t include chapter links. You can still jump around using page previews.
      </p>
      <button
        type="button"
        onClick={onShowPages}
        className="mt-5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-bg transition hover:opacity-90"
      >
        Browse pages
      </button>
    </div>
  );
}

function flatten(nodes: OutlineNode[], depth = 0, parents: string[] = []): FlatEntry[] {
  return nodes.flatMap((node) => [
    { node, depth, parents },
    ...flatten(node.items, depth + 1, [...parents, node.title]),
  ]);
}

/** Reads the outline and turns each entry's link target into a page number. */
async function resolveOutline(pdf: PDFDocumentProxy): Promise<OutlineNode[]> {
  const outline = await pdf.getOutline();
  if (!outline) return [];

  async function pageOf(dest: string | unknown[] | null): Promise<number | null> {
    try {
      // A destination is either a name (look it up) or an explicit array whose first item is the page.
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      const ref = explicit?.[0];
      if (ref == null) return null;
      const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0]);
      return index + 1;
    } catch {
      return null;
    }
  }

  type RawItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];
  const walk = (items: RawItem[], parentId: string): Promise<OutlineNode[]> =>
    Promise.all(
      items.map(async (item, i) => {
        const id = parentId ? `${parentId}.${i}` : String(i);
        return {
          id,
          title: item.title?.trim() || "Untitled",
          page: item.dest ? await pageOf(item.dest) : null,
          bold: Boolean(item.bold),
          italic: Boolean(item.italic),
          items: await walk(item.items ?? [], id),
        };
      }),
    );

  return walk(outline, "");
}
