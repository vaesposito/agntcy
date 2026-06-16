"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Quote, X } from "lucide-react";
import { withBase } from "@/lib/site";

export type Testimonial = {
  name: string;
  title: string;
  company: string;
  quote: string;
  logo?: string;
  url?: string;
};

function CompanyLogo({
  logo,
  company,
  url,
  className,
  wordmarkClassName,
  imgClassName = "h-4 w-auto max-w-full object-contain 3xl:h-6",
}: {
  logo?: string;
  company: string;
  url?: string;
  className: string;
  wordmarkClassName: string;
  imgClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showWordmark = !logo || broken;
  const containerClass = showWordmark ? wordmarkClassName : className;
  const content = showWordmark ? (
    company
  ) : (
    <img
      src={withBase(logo)}
      alt={`${company} logo`}
      loading="lazy"
      onError={() => setBroken(true)}
      className={imgClassName}
    />
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={company}
        aria-label={`${company} — open website in a new tab`}
        className={`${containerClass} cursor-pointer transition-all duration-200 hover:scale-[1.04] ${showWordmark ? "hover:border-[#187adc] hover:text-[#fbaf45]" : "opacity-90 hover:opacity-100"}`}
      >
        {content}
      </a>
    );
  }

  return <span className={containerClass}>{content}</span>;
}

export function TestimonialModalWall({
  testimonials,
}: {
  testimonials: Testimonial[];
}) {
  const [active, setActive] = useState<Testimonial | null>(null);

  return (
    <DialogPrimitive.Root
      open={active !== null}
      onOpenChange={(open) => {
        if (!open) setActive(null);
      }}
    >
      <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3 3xl:mt-16 3xl:gap-7">
        {testimonials.map((t) => (
          <div
            key={`${t.name}-${t.company}`}
            className="group relative mb-5 break-inside-avoid rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 shadow-[0px_4px_30px_#0d274d] transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:mb-7 3xl:rounded-[28px] 3xl:p-8"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[28px]"
            />
            <button
              type="button"
              onClick={() => setActive(t)}
              aria-label={`Read the full testimonial from ${t.name}, ${t.title} at ${t.company}`}
              className="block w-full cursor-pointer rounded-[12px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187adc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142b]"
            >
              <Quote
                aria-hidden
                className="h-6 w-6 text-[#fbaf45] 3xl:h-8 3xl:w-8"
              />
              <p className="mt-4 line-clamp-6 text-sm leading-relaxed text-[#e8e9ea] 3xl:mt-6 3xl:text-lg">
                {t.quote}
              </p>
              <span className="mt-3 inline-block text-xs font-semibold text-[#187adc] transition-colors duration-200 group-hover:text-[#fbaf45] 3xl:text-base">
                Read more
              </span>
            </button>
            <div className="mt-5 border-t border-[#0d274d] pt-4 3xl:mt-7 3xl:pt-5">
              <CompanyLogo
                logo={t.logo}
                company={t.company}
                url={t.url}
                className="inline-flex h-12 max-w-[220px] items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-3.5 3xl:h-16 3xl:max-w-[300px] 3xl:px-5"
                wordmarkClassName="inline-flex h-12 items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-4 text-base font-semibold tracking-tight text-white 3xl:h-16 3xl:text-xl"
                imgClassName="h-7 w-auto max-w-full object-contain 3xl:h-10"
              />
              <p className="mt-3 text-sm font-bold text-white 3xl:mt-4 3xl:text-lg">
                {t.name}
              </p>
              <p className="mt-0.5 text-xs text-[#187adc] 3xl:text-base">
                {t.title}, {t.company}
              </p>
            </div>
          </div>
        ))}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-0 overflow-y-auto rounded-[24px] border border-[#0d274d] bg-[#00142b] p-7 text-[#e8e9ea] shadow-[0px_8px_60px_rgba(24,122,220,0.45)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 md:p-10 3xl:max-w-4xl 3xl:rounded-[32px] 3xl:p-14">
          {active && (
            <>
              <Quote
                aria-hidden
                className="h-9 w-9 text-[#fbaf45] 3xl:h-12 3xl:w-12"
              />
              <DialogPrimitive.Title className="sr-only">
                Testimonial from {active.name}, {active.title} at {active.company}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <p className="mt-5 text-lg leading-relaxed text-[#e8e9ea] md:text-xl md:leading-relaxed 3xl:mt-8 3xl:text-3xl 3xl:leading-relaxed">
                  {active.quote}
                </p>
              </DialogPrimitive.Description>
              <div className="mt-7 flex items-center gap-4 border-t border-[#0d274d] pt-6 3xl:mt-10 3xl:gap-6 3xl:pt-9">
                <CompanyLogo
                  logo={active.logo}
                  company={active.company}
                  url={active.url}
                  className="inline-flex h-10 max-w-[200px] items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-3 3xl:h-14 3xl:max-w-[280px] 3xl:px-4"
                  wordmarkClassName="inline-flex h-10 items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-4 text-base font-semibold tracking-tight text-white 3xl:h-14 3xl:text-xl"
                />
                <div>
                  <p className="text-base font-bold text-white 3xl:text-2xl">
                    {active.name}
                  </p>
                  <p className="mt-0.5 text-sm text-[#187adc] 3xl:text-lg">
                    {active.title}, {active.company}
                  </p>
                </div>
              </div>
            </>
          )}
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#0d274d] bg-[#0d274d]/40 text-[#e8e9ea] transition-colors duration-200 hover:border-[#187adc] hover:text-[#fbaf45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187adc] 3xl:right-7 3xl:top-7 3xl:h-12 3xl:w-12"
          >
            <X className="h-5 w-5 3xl:h-7 3xl:w-7" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
