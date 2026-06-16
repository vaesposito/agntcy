import type { Metadata } from "next";
import Link from "next/link";
import { Quote } from "lucide-react";
import { AgntcyFooter } from "@/components/agntcy-footer";

export const metadata: Metadata = {
  title: "Supporters — AGNTCY",
  description:
    "What our partners and supporters say about AGNTCY and the Internet of Agents.",
};

const NAV_LINKS = [
  { label: "Documentation", href: "#" },
  { label: "Articles", href: "/articles" },
  { label: "Supporters", href: "/supporters" },
  { label: "YouTube", href: "#" },
  { label: "Github", href: "https://github.com" },
];

type Testimonial = {
  name: string;
  title: string;
  company: string;
  quote: string;
};

const COMPANY_LOGOS: Record<string, string> = {
  Glean: "/agntcy/logos/glean.svg",
  Traceloop: "/agntcy/logos/traceloop.png",
  Komodor: "/agntcy/logos/komodor.png",
  AG2: "/agntcy/logos/ag2.png",
  Dynamiq: "/agntcy/logos/dynamiq.png",
  "Haize Labs": "/agntcy/logos/haize-labs.png",
  "Aviz Networks": "/agntcy/logos/aviz-networks.png",
  Boomi: "/agntcy/logos/boomi.png",
  Weaviate: "/agntcy/logos/weaviate.png",
  CrewAI: "/agntcy/logos/crewai.png",
  Dagger: "/agntcy/logos/dagger.png",
  Skyfire: "/agntcy/logos/skyfire.png",
  Ema: "/agntcy/logos/ema.png",
  "Yokai Network": "/agntcy/logos/yokai-network.png",
};

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Arvind Jain",
    title: "Founder & CEO",
    company: "Glean",
    quote:
      "Networks of agents are breaking down the silos that have long limited enterprise software, unlocking the potential of agents to transform how we work... At Glean, we're committed to open source and open standards as the foundation for this future — building agents that reason and act over enterprise knowledge, grounded in context and extensible by design. We're proud to help drive this vision forward as part of AGNTCY.",
  },
  {
    name: "Nir Gazit",
    title: "Co-founder & CEO",
    company: "Traceloop",
    quote:
      "As agents move from prototypes to production, observability becomes mission-critical. At Traceloop, we're building OpenTelemetry-native infrastructure to monitor, evaluate, and debug agent behavior in real time—across any stack. AGNTCY's push for open standards aligns perfectly with our mission to make agentic systems reliable, transparent, and production-ready.",
  },
  {
    name: "Itiel Shwartz",
    title: "Co-Founder & CTO",
    company: "Komodor",
    quote:
      "At Komodor, we understand that the complexity of modern systems demands more than just reactive solutions—it requires proactive, collaborative frameworks. The AGNTCY's commitment to open standards and inter-agent collaboration aligns perfectly with our mission to enhance system reliability and observability... ensuring that multi-agent systems operate seamlessly and transparently at scale.",
  },
  {
    name: "Qingyun Wu",
    title: "Founder & CEO",
    company: "AG2",
    quote:
      "Internet of Agents represents the next evolution of AI — a paradigm shift for seamless agent collaboration across boundaries. Open protocols like AGNTCY's are essential for this future, and AG2 proudly supports this initiative... We remain committed to advancing open standards that democratize agent technology.",
  },
  {
    name: "Vitalii Duk",
    title: "CEO & Founder",
    company: "Dynamiq",
    quote:
      "As experts in agentic AI... we recognize at Dynamiq the importance of standards that ensure interoperability between AI agents. The AGNTCY collective plays a crucial role in bringing together open-source supporters and agentic AI leaders to define, promote, and implement such protocols, accelerating innovation in the AI industry. We are excited to join the collective and contribute to its standardization initiatives.",
  },
  {
    name: "Leonard Tang",
    title: "Co-Founder & CEO",
    company: "Haize Labs",
    quote:
      "The world aspires to create agents that coordinate, reason, and generalize across tasks and contexts. The salient, unsolved obstacle towards this dream is trust and transparency. The AGNTCY project enables this trust through shared protocols, infrastructure, and evaluation standards. Haize Labs resolutely supports AGNTCY... to close the last-mile gap in agentic trust.",
  },
  {
    name: "Thomas Scheibe",
    title: "CPO",
    company: "Aviz Networks",
    quote:
      "Aviz Networks empowers enterprises to create open, AI-driven, vendor-neutral networks that deliver greater choice, control, cost savings, and standardization. We're excited to partner with AGNTCY in setting new standards for AI-powered networking solutions.",
  },
  {
    name: "Matt McLarty",
    title: "CTO",
    company: "Boomi",
    quote:
      "Agent interoperability is a fundamental concern for our industry, and it will affect every organization as we enter the agentic age. AGNTCY is bringing experts from all backgrounds and specializations to create common ground across agent platforms and lower the barrier of entry for companies to get in the agent game.",
  },
  {
    name: "Bob van Luijt",
    title: "Co-Founder & CEO",
    company: "Weaviate",
    quote:
      "Weaviate's AI Native database empowers both developers and enterprises to build next generation agentic applications. Built on open source and community roots, we are excited to partner with AGNTCY to advance foundational technologies and establish standards that will streamline the creation of cutting-edge AI applications.",
  },
  {
    name: "João Moura",
    title: "CEO & Founder",
    company: "CrewAI",
    quote:
      "CrewAI is excited to support AGNTCY in advancing the future of agentic systems. As the agentic landscape rapidly evolves, interoperability has become a top priority. Establishing strong community standards will be important to realizing the full potential of scalable, enterprise-grade AI agents.",
  },
  {
    name: "Sam Alba",
    title: "Co-Founder",
    company: "Dagger",
    quote:
      "As AI agents become integral to software development, platform teams face a new layer of complexity that existing CI/CD and automation systems were not designed to handle... We support AGNTCY's push for open protocols because interoperability is essential at this new scale. A fragmented approach will not scale. Unified, observable automation will.",
  },
  {
    name: "Craig DeWitt",
    title: "Co-Founder",
    company: "Skyfire",
    quote:
      "Payments and KYA identity will be native to every AI agent interaction. We are excited to join AGNTCY and help drive the development and adoption of the infrastructure the AI economy needs to thrive.",
  },
  {
    name: "Surojit Chatterjee",
    title: "CEO",
    company: "Ema",
    quote:
      "Agents are transforming how the world works—and open, collaborative systems are essential to realizing their full potential. At Ema, our pre-built AI Employees and specialized agents are powering agentic business automation across the enterprise. We're proud to join AGNTCY in advancing a shared vision: intelligent, interoperable agents driving global transformation.",
  },
  {
    name: "Chaitanya",
    title: "Founder & CEO",
    company: "Yokai Network",
    quote:
      "At Yokai, we're building the foundational infrastructure for the emerging agentic era, where verifiable identity, seamless discovery, and secure communication are essential. By joining AGNTCY, we're committing to an open ecosystem where autonomous agents can collaborate securely across organizational boundaries.",
  },
];

export default function SupportersPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#00142b] font-sans text-[#e8e9ea]">
      <div className="mx-auto w-full max-w-[1512px] 3xl:max-w-[2040px] 4xl:max-w-[2560px]">
        <img
          src="/agntcy/banner-stripes.svg"
          width={1258}
          height={26}
          alt=""
          aria-hidden
          className="block h-auto w-[70%] select-none"
        />

        <header className="flex justify-end px-8 py-6 md:px-[90px] md:py-8 lg:pl-[200px] lg:pr-[150px] 3xl:pl-[260px] 3xl:pr-[200px] 3xl:py-12">
          <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-white md:gap-x-8 md:text-base 3xl:gap-x-10 3xl:text-xl">
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className="cursor-pointer bg-[linear-gradient(#fbaf45,#fbaf45)] bg-[length:0%_2px] bg-[position:0_100%] bg-no-repeat pb-1 text-white transition-[color,background-size] duration-200 hover:bg-[length:100%_2px] hover:text-[#fbaf45]"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="cursor-pointer bg-[linear-gradient(#fbaf45,#fbaf45)] bg-[length:0%_2px] bg-[position:0_100%] bg-no-repeat pb-1 text-white transition-[color,background-size] duration-200 hover:bg-[length:100%_2px] hover:text-[#fbaf45]"
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>
        </header>

        <main className="px-8 pb-20 pt-6 md:px-[90px] md:pt-12 lg:pl-[200px] lg:pr-[150px] 3xl:pl-[260px] 3xl:pr-[200px] 3xl:pt-16 3xl:pb-28">
          <Link
            href="/agntcy"
            className="group inline-flex items-center gap-x-4 gap-y-2"
          >
            <img
              src="/agntcy/logo.svg"
              width={513}
              height={116}
              alt="AGNTCY — back to home"
              className="h-10 w-auto transition-transform duration-200 group-hover:-translate-y-0.5 md:h-12 lg:h-14 3xl:h-20"
            />
            <span className="text-xs text-white/70 transition-colors duration-200 group-hover:text-[#fbaf45] md:text-sm 3xl:text-lg">
              Home
            </span>
          </Link>

          <h1 className="mt-10 max-w-4xl text-3xl font-light leading-tight text-[#fbaf45] md:text-4xl lg:text-5xl 3xl:mt-14 3xl:max-w-5xl 3xl:text-6xl">
            They say about us
          </h1>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg 3xl:mt-7 3xl:max-w-4xl 3xl:text-2xl">
            What our partners and supporters say about AGNTCY and the Internet of
            Agents.
          </p>

          <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3 3xl:mt-16 3xl:gap-7">
            {TESTIMONIALS.map((t) => {
              const logo = COMPANY_LOGOS[t.company];
              return (
              <article
                key={`${t.name}-${t.company}`}
                className="group relative mb-5 break-inside-avoid rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 shadow-[0px_4px_30px_#0d274d] transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:mb-7 3xl:rounded-[28px] 3xl:p-8"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[28px]"
                />
                <Quote
                  aria-hidden
                  className="h-6 w-6 text-[#fbaf45] 3xl:h-8 3xl:w-8"
                />
                <p className="mt-4 text-sm leading-relaxed text-[#e8e9ea] 3xl:mt-6 3xl:text-lg">
                  {t.quote}
                </p>
                <div className="mt-5 border-t border-[#0d274d] pt-4 3xl:mt-7 3xl:pt-5">
                  {logo ? (
                    <span className="inline-flex h-8 max-w-[160px] items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-2.5 3xl:h-11 3xl:max-w-[220px] 3xl:px-3.5">
                      <img
                        src={logo}
                        alt={`${t.company} logo`}
                        loading="lazy"
                        className="h-4 w-auto max-w-full object-contain 3xl:h-6"
                      />
                    </span>
                  ) : (
                    <span className="inline-flex h-8 items-center rounded-md border border-[#0d274d] bg-[#0d274d]/40 px-3 text-sm font-semibold tracking-tight text-white 3xl:h-11 3xl:text-lg">
                      {t.company}
                    </span>
                  )}
                  <p className="mt-3 text-sm font-bold text-white 3xl:mt-4 3xl:text-lg">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[#187adc] 3xl:text-base">
                    {t.title}, {t.company}
                  </p>
                </div>
              </article>
              );
            })}
          </div>
        </main>
        <AgntcyFooter />
      </div>
    </div>
  );
}
