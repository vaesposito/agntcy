"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

function getScrollParent(node: HTMLElement | null): HTMLElement | Window {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return window;
}

export function BackToTop({ threshold = 500 }: { threshold?: number }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const scrollerRef = useRef<HTMLElement | Window | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scroller = getScrollParent(anchorRef.current);
    scrollerRef.current = scroller;

    const getTop = () =>
      scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;

    const onScroll = () => setVisible(getTop() > threshold);

    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const handleClick = () => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <span ref={anchorRef} aria-hidden className="hidden" />
      <button
        type="button"
        onClick={handleClick}
        aria-label="Back to top"
        className={`fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#187adc] bg-[#187adc] text-white shadow-[0px_8px_24px_rgba(24,122,220,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#3b91e6] hover:bg-[#3b91e6] hover:shadow-[0px_12px_36px_rgba(24,122,220,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5fd3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142b] 3xl:bottom-10 3xl:right-10 3xl:h-16 3xl:w-16 ${
          visible
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0"
        }`}
      >
        <ArrowUp className="h-5 w-5 3xl:h-7 3xl:w-7" />
      </button>
    </>
  );
}
