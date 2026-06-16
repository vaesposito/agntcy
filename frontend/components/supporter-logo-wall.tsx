"use client";

import { useState } from "react";
import { withBase } from "@/lib/site";
import { urlForLogo } from "@/lib/company-urls";

export type Supporter = {
  name: string;
  logo: string;
  href?: string;
};

const CHIP_BASE =
  "relative flex h-20 items-center justify-center rounded-[16px] border border-[#0d274d] bg-[#00142b] px-5 shadow-[0px_4px_30px_#0d274d] 3xl:h-28 3xl:rounded-[22px] 3xl:px-7";

function SupporterChip({ supporter }: { supporter: Supporter }) {
  const [broken, setBroken] = useState(false);
  const href = supporter.href ?? urlForLogo(supporter.logo);

  const content = broken ? (
    <span className="text-center text-sm font-semibold tracking-tight text-white 3xl:text-lg">
      {supporter.name}
    </span>
  ) : (
    <img
      src={withBase(supporter.logo)}
      alt={`${supporter.name} logo`}
      loading="lazy"
      onError={() => setBroken(true)}
      className="max-h-9 w-auto max-w-full object-contain opacity-90 transition-opacity duration-300 group-hover:opacity-100 3xl:max-h-14"
    />
  );

  if (!href) {
    return <div className={CHIP_BASE}>{content}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={supporter.name}
      aria-label={`${supporter.name} — open website in a new tab`}
      className={`group ${CHIP_BASE} cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187adc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142b]`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[22px]"
      />
      {content}
    </a>
  );
}

export function SupporterLogoWall({ supporters }: { supporters: Supporter[] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:mt-8 3xl:gap-6">
      {supporters.map((s) => (
        <SupporterChip key={s.name} supporter={s} />
      ))}
    </div>
  );
}
