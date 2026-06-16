"use client";

import { useEffect, useState } from "react";

export type SectionTab = {
  label: string;
  href: string;
};

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [activeId, setActiveId] = useState(
    tabs[0]?.href.replace("#", "") ?? "",
  );
  const [topOffset, setTopOffset] = useState(0);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setTopOffset(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const ids = tabs.map((t) => t.href.replace("#", ""));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [tabs]);

  return (
    <div
      style={{ top: topOffset }}
      className="sticky z-20 mt-8 -mx-8 border-b border-[#0d274d] bg-[#00142b] px-8 py-4 md:-mx-[90px] md:px-[90px] lg:-ml-[200px] lg:-mr-[150px] lg:pl-[200px] lg:pr-[150px] 3xl:-ml-[260px] 3xl:-mr-[200px] 3xl:mt-10 3xl:py-5 3xl:pl-[260px] 3xl:pr-[200px]"
    >
      <nav
        aria-label="Jump to section"
        className="inline-flex items-center rounded-full border border-[#0d274d] bg-[#0d274d]/30 p-1 3xl:p-1.5"
      >
        {tabs.map((tab) => {
          const id = tab.href.replace("#", "");
          const isActive = id === activeId;
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "true" : undefined}
              onClick={() => setActiveId(id)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 md:px-4 md:text-sm 3xl:px-5 3xl:py-2 3xl:text-lg ${
                isActive
                  ? "bg-[#187adc] text-white shadow-[0px_2px_12px_rgba(24,122,220,0.45)]"
                  : "text-white/70 hover:text-[#fbaf45]"
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
