"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useLayoutStore } from "@/store";
import { PillButton } from "@/components/ui/PillButton";
import {
  TEMPLATES,
  TEMPLATE_SECTIONS,
  templateSizeCaption,
  type TemplateCard,
  type TemplateCategory,
} from "@/lib/layout/templates";

/**
 * Template picker (redesign plan Phase 9 — figma "Publisher - select a
 * template"): Filters panel (search + categories + sort) beside the Template
 * Explorer's carousel rows; selecting a card opens the configuration drawer
 * (dimensions, orientation, margins, bleed) whose Create Document starts a
 * fresh publication from the choice and lands in the editor.
 */

function TemplateThumb({ t, selected }: { t: TemplateCard; selected: boolean }) {
  const landscape = t.orientation === "landscape";
  return (
    <div
      className={`flex h-[150px] items-center justify-center rounded-t-[6px] ${
        selected ? "bg-[#fff1f1]" : "bg-[#f4f4f4]"
      }`}
    >
      <div
        className={`border bg-white shadow-[0_1px_3px_rgba(0,0,0,.14)] ${
          selected ? "border-brand" : "border-[#d0d0d0]"
        }`}
        style={landscape ? { width: 84, height: 60 } : { width: 60, height: 84 }}
      />
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const startFromTemplate = useLayoutStore((s) => s.startFromTemplate);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [sort, setSort] = useState<"name" | "size">("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // drawer state, seeded from the selected card and freely editable
  const selected = TEMPLATES.find((t) => t.id === selectedId) ?? null;
  const [config, setConfig] = useState({ w: 8.5, h: 11, orientation: "portrait" as "portrait" | "landscape", margin: 0.5, bleed: 0.125 });

  const pick = (t: TemplateCard) => {
    setSelectedId(t.id);
    setConfig({ w: t.w, h: t.h, orientation: t.orientation, margin: t.margin, bleed: t.bleed });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = TEMPLATES.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : a.w * a.h - b.w * b.h,
    );
  }, [query, category, sort]);

  const create = () => {
    if (!selected) return;
    startFromTemplate({
      name: selected.category === "blank" ? "Untitled publication" : selected.name,
      w: config.w,
      h: config.h,
      orientation: config.orientation,
      margin: config.margin,
      bleed: config.bleed,
    });
    router.push("/layout");
  };

  const catBtn = (id: TemplateCategory | "all", label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setCategory(id)}
      aria-pressed={category === id}
      data-testid={`tpl-cat-${id}`}
      className={`block w-full cursor-pointer rounded-[6px] px-3 py-[7px] text-left text-[12px] ${
        category === id ? "bg-brand-tint font-semibold text-brand" : "text-[#444] hover:bg-[#f2f2f2]"
      }`}
    >
      {label}
    </button>
  );

  const numField = (
    label: string,
    key: "w" | "h" | "margin",
    testId: string,
  ) => (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">{label}</span>
      <input
        type="number"
        step="0.125"
        min="0"
        value={config[key]}
        onChange={(e) => setConfig((c) => ({ ...c, [key]: Number(e.target.value) || 0 }))}
        data-testid={testId}
        className="w-full rounded-[4px] border border-[#cccccc] px-2 py-[6px] text-[12px] text-[#111] outline-none focus:border-info"
      />
    </label>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4 bg-[#ededed] p-4">
      {/* Filters */}
      <div className="flex w-[280px] shrink-0 flex-col gap-3 self-start rounded-[4px] border border-[#dddddd] bg-white p-4">
        <div className="text-[14px] font-bold text-[#111]">Filters</div>
        <div className="flex items-center gap-2 rounded-[6px] border border-[#cccccc] px-2 py-[6px]">
          <Search size={14} strokeWidth={1.9} className="shrink-0 text-[#9a9a9a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            data-testid="tpl-search"
            className="w-full text-[12px] text-[#111] outline-none"
          />
        </div>
        <div>
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
            Copy & Print Products
          </div>
          {catBtn("all", "All templates")}
          {catBtn("booklets", "Booklets")}
          {catBtn("flyers", "Flyers")}
          {catBtn("blank", "Blank Sizes")}
        </div>
        <div>
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
            Sort By
          </div>
          {(["name", "size"] as const).map((id) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 px-1 py-[3px] text-[12px] text-[#444]">
              <input
                type="radio"
                name="tpl-sort"
                checked={sort === id}
                onChange={() => setSort(id)}
                data-testid={`tpl-sort-${id}`}
              />
              {id === "name" ? "Name A–Z" : "Size"}
            </label>
          ))}
        </div>
      </div>

      {/* Template Explorer */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[4px] border border-[#dddddd] bg-white p-5">
        <div className="text-[17px] font-bold text-[#111]">Template Explorer</div>
        {TEMPLATE_SECTIONS.map(({ category: cat, label }) => {
          const cards = visible.filter((t) => t.category === cat);
          if (!cards.length) return null;
          return (
            <div key={cat}>
              <div className="pb-2 text-[12px] font-semibold text-[#4d4d4f]">{label}</div>
              <div className="flex flex-wrap gap-3">
                {cards.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pick(t)}
                    aria-pressed={selectedId === t.id}
                    data-testid={`tpl-card-${t.id}`}
                    className={`w-[156px] cursor-pointer rounded-[6px] border text-left ${
                      selectedId === t.id
                        ? "border-brand bg-[#fff1f1]"
                        : "border-[#dddddd] bg-white hover:border-[#b8b8b8]"
                    }`}
                  >
                    <TemplateThumb t={t} selected={selectedId === t.id} />
                    <div className="px-2 py-2">
                      <div className="truncate text-[11.5px] font-semibold text-[#333]">{t.name}</div>
                      <div className="text-[10px] text-[#8f8f8f]">{templateSizeCaption(t)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="text-[12px] text-[#8f8f8f]">No templates match — clear the search or filters.</div>
        )}
      </div>

      {/* Configuration drawer */}
      {selected && (
        <div
          data-testid="tpl-drawer"
          className="flex w-[300px] shrink-0 flex-col gap-4 self-start rounded-[4px] border border-[#dddddd] bg-white p-4"
        >
          <div>
            <div className="text-[13px] font-bold text-[#111]">{selected.name}</div>
            <div className="text-[10.5px] text-[#8f8f8f]">{templateSizeCaption(selected)}</div>
          </div>
          <div>
            <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
              Page dimensions
            </div>
            <div className="flex gap-2">
              {numField("Width (in)", "w", "tpl-w")}
              {numField("Height (in)", "h", "tpl-h")}
            </div>
          </div>
          <div>
            <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
              Orientation
            </div>
            <div className="flex gap-2">
              <PillButton
                size="sm"
                variant={config.orientation === "portrait" ? "primary" : "secondary"}
                aria-pressed={config.orientation === "portrait"}
                data-testid="tpl-portrait"
                onClick={() => setConfig((c) => ({ ...c, orientation: "portrait" }))}
              >
                Portrait
              </PillButton>
              <PillButton
                size="sm"
                variant={config.orientation === "landscape" ? "primary" : "secondary"}
                aria-pressed={config.orientation === "landscape"}
                data-testid="tpl-landscape"
                onClick={() => setConfig((c) => ({ ...c, orientation: "landscape" }))}
              >
                Landscape
              </PillButton>
            </div>
          </div>
          <div>
            <div className="pb-1 text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
              Margins (inches)
            </div>
            <div className="flex gap-2">{numField("All sides", "margin", "tpl-margin")}</div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[.04em] text-[#757575]">
              Bleed
            </span>
            <select
              value={String(config.bleed)}
              onChange={(e) => setConfig((c) => ({ ...c, bleed: Number(e.target.value) }))}
              data-testid="tpl-bleed"
              className="w-full rounded-[4px] border border-[#cccccc] px-2 py-[6px] text-[12px] text-[#111] outline-none"
            >
              <option value="0">None</option>
              <option value="0.125">0.125 in</option>
              <option value="0.25">0.25 in</option>
            </select>
          </label>
          <PillButton variant="primary" data-testid="tpl-create" onClick={create} className="w-full">
            Create Document
          </PillButton>
        </div>
      )}
    </div>
  );
}
