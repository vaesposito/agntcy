import type { Metadata } from "next";
import { SquareArrowOutUpRight } from "lucide-react";
import { AgntcyFooter } from "@/components/agntcy-footer";
import { TscLogos } from "@/components/tsc-logos";
import { BackToTop } from "@/components/back-to-top";
import { withBase } from "@/lib/site";

export const metadata: Metadata = {
  title: "AGNTCY — Building the Internet of Agents",
  description:
    "AGNTCY delivers an open-source stack enabling AI agents to collaborate across vendors and frameworks through discovery, identity, messaging, and observability.",
};

const NAV_LINKS = [
  { label: "Documentation", href: "https://docs.agntcy.org/" },
  { label: "Articles", href: "/articles" },
  { label: "Supporters", href: "/supporters" },
  {
    label: "YouTube",
    href: "https://www.youtube.com/playlist?list=PL49BrgsjXg5qVeRVqlX9O74W02q3c8fow",
  },
  { label: "Github", href: "https://github.com/agntcy" },
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
      <div className="mx-auto w-full max-w-[1512px] 3xl:max-w-[2040px] 4xl:max-w-[2560px]">
      <img
        src={withBase("/agntcy/banner-stripes.svg")}
        width={1258}
        height={26}
        alt=""
        aria-hidden
        className="block h-auto w-[70%] select-none"
      />

      <header className="flex justify-end px-8 py-6 md:px-[90px] md:py-8 lg:pl-[200px] lg:pr-[150px] 3xl:pl-[260px] 3xl:pr-[200px] 3xl:py-12">
        <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-white md:gap-x-8 md:text-base 3xl:gap-x-10 3xl:text-xl">
          {NAV_LINKS.map((link) => {
            const internal = link.href.startsWith("/");
            return (
              <a
                key={link.label}
                href={internal ? withBase(link.href) : link.href}
                {...(internal
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
                className="cursor-pointer bg-[linear-gradient(#fbaf45,#fbaf45)] bg-[length:0%_2px] bg-[position:0_100%] bg-no-repeat pb-1 text-white transition-[color,background-size] duration-200 hover:bg-[length:100%_2px] hover:text-[#fbaf45]"
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </header>

      <main className="px-8 pb-20 pt-6 md:px-[90px] md:pt-12 lg:pl-[200px] lg:pr-[150px] 3xl:pl-[260px] 3xl:pr-[200px] 3xl:pt-16 3xl:pb-28">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 3xl:gap-x-8">
          <img
            src={withBase("/agntcy/logo.svg")}
            width={513}
            height={116}
            alt="AGNTCY"
            className="h-14 w-auto md:h-16 lg:h-20 3xl:h-28"
          />
          <div className="flex items-center gap-2 text-xs text-white md:text-sm 3xl:text-lg">
            <span>part of</span>
            <img
              src={withBase("/agntcy/linux-foundation.svg")}
              width={321}
              height={19}
              alt="Linux Foundation"
              className="h-4 w-auto md:h-5 3xl:h-7"
            />
          </div>
        </div>

        <h1 className="mt-8 max-w-4xl text-3xl font-light leading-tight text-[#fbaf45] md:text-4xl lg:text-5xl 3xl:mt-12 3xl:max-w-5xl 3xl:text-6xl">
          Building the Internet of Agents (IoA)
        </h1>

        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg 3xl:mt-7 3xl:max-w-4xl 3xl:text-2xl">
          AGNTCY delivers an open-source stack enabling AI agents to collaborate
          across vendors and frameworks through discovery, identity, messaging,
          and observability.
        </p>

        <div className="mt-7 flex flex-wrap gap-3 3xl:mt-10 3xl:gap-4">
          <a
            href="https://github.com/agntcy"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#187adc] bg-[#00142b] px-4 py-2 text-xs text-[#e8e9ea] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3b91e6] hover:bg-[#187adc]/10 hover:shadow-[0px_8px_24px_rgba(24,122,220,0.35)] md:px-5 md:py-2.5 md:text-sm 3xl:gap-2 3xl:px-7 3xl:py-3.5 3xl:text-lg"
          >
            Github
            <img
              src={withBase("/agntcy/github.svg")}
              width={22}
              height={21}
              alt=""
              aria-hidden
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110 md:h-4 md:w-4 3xl:h-5 3xl:w-5"
            />
          </a>
          <a
            href="https://join.slack.com/t/agntcy/shared_invite/zt-3hb4p7bo0-5H2otGjxGt9OQ1g5jzK_GQ"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#187adc] bg-[#00142b] px-4 py-2 text-xs text-[#e8e9ea] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3b91e6] hover:bg-[#187adc]/10 hover:shadow-[0px_8px_24px_rgba(24,122,220,0.35)] md:px-5 md:py-2.5 md:text-sm 3xl:gap-2 3xl:px-7 3xl:py-3.5 3xl:text-lg"
          >
            Join us on Slack
            <img
              src={withBase("/agntcy/slack.svg")}
              width={20}
              height={20}
              alt=""
              aria-hidden
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110 md:h-4 md:w-4 3xl:h-5 3xl:w-5"
            />
          </a>
          <a
            href="https://docs.agntcy.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#187adc] px-4 py-2 text-xs text-[#e8e9ea] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2b8ae8] hover:shadow-[0px_8px_24px_rgba(24,122,220,0.5)] md:px-5 md:py-2.5 md:text-sm 3xl:gap-2 3xl:px-7 3xl:py-3.5 3xl:text-lg"
          >
            Learn more
            <img
              src={withBase("/agntcy/arrow-forward.svg")}
              width={18}
              height={18}
              alt=""
              aria-hidden
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 md:h-4 md:w-4 3xl:h-5 3xl:w-5"
            />
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 3xl:mt-16 3xl:gap-7">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="group relative cursor-pointer rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 text-center shadow-[0px_4px_30px_#0d274d] transition-shadow duration-300 hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:rounded-[28px] 3xl:p-8"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100"
              />
              <SquareArrowOutUpRight
                aria-hidden
                className="absolute right-4 top-4 h-4 w-4 text-[#e8e9ea] opacity-0 transition-opacity duration-300 group-hover:opacity-100 3xl:right-5 3xl:top-5 3xl:h-5 3xl:w-5"
              />
              <div className="flex justify-center">
                <img
                  src={withBase(card.icon)}
                  width={card.iconWidth}
                  height={card.iconHeight}
                  alt=""
                  aria-hidden
                  className="h-6 w-auto 3xl:h-8"
                />
              </div>
              <h2 className="mt-4 text-base font-bold text-[#e8e9ea] 3xl:mt-6 3xl:text-xl">
                {card.title}
              </h2>
              <p className="mt-2.5 text-xs leading-relaxed text-[#e8e9ea] 3xl:mt-4 3xl:text-base">
                {card.body}
              </p>
            </article>
          ))}
        </div>

        <section className="mt-16 3xl:mt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fbaf45] 3xl:text-base">
            Technical Steering Committee
          </p>
          <TscLogos />
        </section>
      </main>
      <AgntcyFooter />
      </div>
      <BackToTop />
    </div>
  );
}
