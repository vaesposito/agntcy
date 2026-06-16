import type { Metadata } from "next";
import { SquareArrowOutUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "AGNTCY — Building the Internet of Agents",
  description:
    "AGNTCY delivers an open-source stack enabling AI agents to collaborate across vendors and frameworks through discovery, identity, messaging, and observability.",
};

const NAV_LINKS = [
  { label: "Documentation", href: "#" },
  { label: "Articles", href: "#" },
  { label: "Supporters", href: "#" },
  { label: "YouTube", href: "#" },
  { label: "Github", href: "https://github.com" },
];

const CARDS = [
  {
    icon: "/agntcy/card-directory.svg",
    iconWidth: 24,
    iconHeight: 22,
    title: "Agent Directory Service",
    body: "Federated registry for cross-framework, cross-protocol, cross-registry, cross-framework agent discovery.",
  },
  {
    icon: "/agntcy/card-slim.svg",
    iconWidth: 24,
    iconHeight: 19,
    title: "SLIM",
    body: "A protocol that defines the standards and guidelines for secure and efficient network-level communication between AI agents.",
  },
  {
    icon: "/agntcy/card-observability.svg",
    iconWidth: 27,
    iconHeight: 24,
    title: "Observability",
    body: "Telemetry collectors, tools and services to enable multi-agent application observability and evaluation.",
  },
  {
    icon: "/agntcy/card-identity.svg",
    iconWidth: 27,
    iconHeight: 27,
    title: "Identity",
    body: "Solution to manage and verify the identities of Agents or Tools issued by any organization, ensuring secure and trustworthy interactions.",
  },
];

export default function AgntcyPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#00142b] font-sans text-[#e8e9ea]">
      <img
        src="/agntcy/banner-stripes.svg"
        width={1258}
        height={26}
        alt=""
        aria-hidden
        className="block h-auto w-[70%] select-none"
      />

      <header className="flex justify-end px-8 py-6 md:px-[90px] md:py-8 lg:pl-[200px] lg:pr-[150px]">
        <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-white md:gap-x-8 md:text-base">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="transition-opacity hover:opacity-70"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="px-8 pb-20 pt-6 md:px-[90px] md:pt-12 lg:pl-[200px] lg:pr-[150px]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <img
            src="/agntcy/logo.svg"
            width={513}
            height={116}
            alt="AGNTCY"
            className="h-14 w-auto md:h-16 lg:h-20"
          />
          <div className="flex items-center gap-2.5 text-sm text-white md:text-base">
            <span>part of</span>
            <img
              src="/agntcy/linux-foundation.svg"
              width={321}
              height={19}
              alt="Linux Foundation"
              className="h-5 w-auto md:h-6"
            />
          </div>
        </div>

        <h1 className="mt-8 max-w-4xl text-2xl font-light leading-tight text-[#fbaf45] md:text-3xl lg:text-4xl">
          Building the Internet of Agents (IoA)
        </h1>

        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg">
          AGNTCY delivers an open-source stack enabling AI agents to collaborate
          across vendors and frameworks through discovery, identity, messaging,
          and observability.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href="https://github.com"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#187adc] bg-[#00142b] px-4 py-2 text-xs text-[#e8e9ea] transition-colors hover:bg-[#0d274d] md:px-5 md:py-2.5 md:text-sm"
          >
            Github
            <img
              src="/agntcy/github.svg"
              width={22}
              height={21}
              alt=""
              aria-hidden
              className="h-3.5 w-3.5 md:h-4 md:w-4"
            />
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#187adc] px-4 py-2 text-xs text-[#e8e9ea] transition-colors hover:bg-[#1a6ec2] md:px-5 md:py-2.5 md:text-sm"
          >
            Learn more
            <img
              src="/agntcy/arrow-forward.svg"
              width={18}
              height={18}
              alt=""
              aria-hidden
              className="h-3.5 w-3.5 md:h-4 md:w-4"
            />
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="group relative cursor-pointer rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 text-center shadow-[0px_4px_30px_#0d274d] transition-shadow duration-300 hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100"
              />
              <SquareArrowOutUpRight
                aria-hidden
                className="absolute right-4 top-4 h-4 w-4 text-[#e8e9ea] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <div className="flex justify-center">
                <img
                  src={card.icon}
                  width={card.iconWidth}
                  height={card.iconHeight}
                  alt=""
                  aria-hidden
                  className="h-6 w-auto"
                />
              </div>
              <h2 className="mt-4 text-base font-bold text-[#e8e9ea]">
                {card.title}
              </h2>
              <p className="mt-2.5 text-xs leading-relaxed text-[#e8e9ea]">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
