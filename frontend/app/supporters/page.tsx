import type { Metadata } from "next";
import Link from "next/link";
import { AgntcyFooter } from "@/components/agntcy-footer";
import {
  TestimonialModalWall,
  type Testimonial as TestimonialCard,
} from "@/components/testimonial-modal-wall";
import {
  SupporterLogoWall,
  type Supporter,
} from "@/components/supporter-logo-wall";
import { withBase } from "@/lib/site";

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

const SUPPORTERS: Supporter[] = [
  { name: "Advensis", logo: "/agntcy/logos/advensis.png" },
  { name: "AG2", logo: "/agntcy/logos/ag2-logo.png" },
  { name: "AIPlotch", logo: "/agntcy/logos/plotch.png" },
  { name: "Aisera", logo: "/agntcy/logos/aisera.png" },
  { name: "Anon", logo: "/agntcy/logos/anon-logo.png" },
  { name: "AnyWeb", logo: "/agntcy/logos/anyweb.png" },
  { name: "ArcBlock", logo: "/agntcy/logos/arcblock.svg" },
  { name: "Arize AI", logo: "/agntcy/logos/arizeai.png" },
  { name: "Aviz Networks", logo: "/agntcy/logos/aviz.png" },
  { name: "Beam AI", logo: "/agntcy/logos/beam.png" },
  { name: "Boomi", logo: "/agntcy/logos/boomi-2.png" },
  { name: "BrowserBase", logo: "/agntcy/logos/browserbase.png" },
  { name: "Ciroos", logo: "/agntcy/logos/ciroos.png" },
  { name: "Comet", logo: "/agntcy/logos/comet.png" },
  { name: "CrewAI", logo: "/agntcy/logos/crewai-logo.png" },
  { name: "Dagger", logo: "/agntcy/logos/dagger.png" },
  { name: "Duo", logo: "/agntcy/logos/duo.svg" },
  { name: "Dynamiq", logo: "/agntcy/logos/dynamiq-logo.png" },
  { name: "Ema", logo: "/agntcy/logos/ema.png" },
  { name: "FabrixAI", logo: "/agntcy/logos/fabrix-ai.png" },
  { name: "Galileo", logo: "/agntcy/logos/galileo.png" },
  { name: "Glean", logo: "/agntcy/logos/glean.svg" },
  { name: "Haize Labs", logo: "/agntcy/logos/haize-labs-white.png" },
  { name: "HumanSecurity", logo: "/agntcy/logos/human-security.png" },
  { name: "Hyperbolic", logo: "/agntcy/logos/hyperbolic.png" },
  { name: "Infinitus", logo: "/agntcy/logos/infinitus.svg" },
  { name: "Infosys", logo: "/agntcy/logos/infosys.png" },
  { name: "Kibo", logo: "/agntcy/logos/kibo.svg" },
  { name: "Komodor", logo: "/agntcy/logos/komodor-logo.png" },
  { name: "LangChain", logo: "/agntcy/logos/langchain-updated.png" },
  { name: "Layer", logo: "/agntcy/logos/layerlogo.png" },
  { name: "Letta", logo: "/agntcy/logos/letta.svg" },
  { name: "Lightning AI", logo: "/agntcy/logos/lightningai.png" },
  { name: "LlamaIndex", logo: "/agntcy/logos/llamaindex.png" },
  { name: "Lleverage", logo: "/agntcy/logos/lleverage.png" },
  { name: "Lobby", logo: "/agntcy/logos/lobby.png" },
  { name: "Meet Lloyd", logo: "/agntcy/logos/meetloyd.png" },
  { name: "Mem0", logo: "/agntcy/logos/mem0.png" },
  { name: "MongoDB", logo: "/agntcy/logos/mongodb-logo.png" },
  { name: "Motleycrew", logo: "/agntcy/logos/motleycrew.png" },
  { name: "Mozilla", logo: "/agntcy/logos/mozilla.png" },
  { name: "Naptha AI", logo: "/agntcy/logos/naptha-ai.png" },
  { name: "Netcloud", logo: "/agntcy/logos/netcloud.svg" },
  { name: "Nurix AI", logo: "/agntcy/logos/nurix-ai.svg" },
  { name: "Onetrust", logo: "/agntcy/logos/onetrust.png" },
  { name: "Opaque", logo: "/agntcy/logos/opaque.png" },
  { name: "Orium", logo: "/agntcy/logos/orium.png" },
  { name: "Ory", logo: "/agntcy/logos/ory.png" },
  { name: "Pattern Agentic AI", logo: "/agntcy/logos/patternagenticai.png" },
  { name: "Pensar", logo: "/agntcy/logos/pensar.png" },
  { name: "Permit", logo: "/agntcy/logos/permit-logo-variant3.png" },
  { name: "Persistent", logo: "/agntcy/logos/persistent.png" },
  { name: "Presidio", logo: "/agntcy/logos/presidio.png" },
  { name: "PydanticAI", logo: "/agntcy/logos/pydantic.png" },
  { name: "Redis", logo: "/agntcy/logos/redis.png" },
  { name: "SciEncephalon AI", logo: "/agntcy/logos/sciencephalonai.png" },
  { name: "Skreens", logo: "/agntcy/logos/skreens.svg" },
  { name: "Skyfire", logo: "/agntcy/logos/skyfire.png" },
  { name: "SmythOS", logo: "/agntcy/logos/smythos.png" },
  { name: "Snaplogic", logo: "/agntcy/logos/snaplogic.png" },
  { name: "Softserve", logo: "/agntcy/logos/softserve.svg" },
  { name: "Superbo", logo: "/agntcy/logos/superbo.png" },
  { name: "Supertab", logo: "/agntcy/logos/supertab.png" },
  { name: "Swirl AI", logo: "/agntcy/logos/swirl-ai.png" },
  { name: "Traceloop", logo: "/agntcy/logos/traceloop.png" },
  { name: "Tykio", logo: "/agntcy/logos/tykio.png" },
  { name: "Ushur", logo: "/agntcy/logos/ushur.svg" },
  { name: "Valtech", logo: "/agntcy/logos/valtech.png" },
  { name: "Vijil", logo: "/agntcy/logos/vijil.png" },
  { name: "VoAgents", logo: "/agntcy/logos/voagents.png" },
  { name: "VoltAgent", logo: "/agntcy/logos/voltagent.png" },
  { name: "Wayfound", logo: "/agntcy/logos/wayfound.png" },
  { name: "Weaviate", logo: "/agntcy/logos/weaviate-wh.png" },
  { name: "Yallma3", logo: "/agntcy/logos/yallma3.png" },
  { name: "Yokai", logo: "/agntcy/logos/yokai.png" },
  { name: "Zep", logo: "/agntcy/logos/zep.png" },
];

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

const TESTIMONIAL_CARDS: TestimonialCard[] = TESTIMONIALS.map((t) => ({
  ...t,
  logo: COMPANY_LOGOS[t.company],
}));

export default function SupportersPage() {
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
              src={withBase("/agntcy/logo.svg")}
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
            Our Supporters
          </h1>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg 3xl:mt-7 3xl:max-w-4xl 3xl:text-2xl">
            The open, interoperable Internet of Agents isn&apos;t a nice to have,
            it&apos;s a must have. These {SUPPORTERS.length} organizations stand
            with AGNTCY — building bridges, not walls.
          </p>

          <SupporterLogoWall supporters={SUPPORTERS} />

          <section className="mt-20 3xl:mt-28">
            <h2 className="max-w-4xl text-3xl font-light leading-tight text-[#fbaf45] md:text-4xl lg:text-5xl 3xl:max-w-5xl 3xl:text-6xl">
              They say about us
            </h2>

            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg 3xl:mt-7 3xl:max-w-4xl 3xl:text-2xl">
              What our partners and supporters say about AGNTCY and the Internet
              of Agents. Select a card to read the full quote.
            </p>

            <TestimonialModalWall testimonials={TESTIMONIAL_CARDS} />
          </section>
        </main>
        <AgntcyFooter />
      </div>
    </div>
  );
}
