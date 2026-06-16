import type { Metadata } from "next";
import Link from "next/link";
import { SquareArrowOutUpRight, BookOpen } from "lucide-react";
import { AgntcyFooter } from "@/components/agntcy-footer";
import { withBase } from "@/lib/site";

export const metadata: Metadata = {
  title: "Articles — AGNTCY",
  description:
    "Read the latest articles, blog posts, and technical writing from AGNTCY and the Internet of Agents community.",
};

const NAV_LINKS = [
  { label: "Documentation", href: "#" },
  { label: "Articles", href: "/articles" },
  { label: "Supporters", href: "/supporters" },
  { label: "YouTube", href: "#" },
  { label: "Github", href: "https://github.com" },
];

type Article = {
  title: string;
  body: string;
  href: string;
};

const OUTSHIFT_ARTICLES: Article[] = [
  {
    title: "AI observability in multi-agent systems using OpenTelemetry",
    body: "Microsoft, Splunk work with AGNTCY to introduce new semantic conventions into OpenTelemetry.",
    href: "https://outshift.cisco.com/blog/ai-observability-multi-agent-systems-opentelemetry",
  },
  {
    title:
      "AGNTCY project donated to Linux Foundation with major industry backing",
    body: "Cisco, Dell Technologies, Google Cloud, Oracle and Red Hat join as formative members, alongside 75+ companies supporting AGNTCY.",
    href: "https://outshift.cisco.com/blog/agntcy-donated-to-linux-foundation",
  },
  {
    title: "The 4 phases for successful development of multi-agent software",
    body: "How to build multi-agent systems — four phases from idea to deployment.",
    href: "https://outshift.cisco.com/blog/four-phases-for-development-of-multi-agent-apps",
  },
  {
    title:
      "Webex and AGNTCY: How this healthcare booking multi-agent system showcases enterprise innovation",
    body: "Building a multi-agent system for a healthcare contact center.",
    href: "https://outshift.cisco.com/blog/webex-agntcy-multi-agent-systems",
  },
  {
    title:
      "How SoftServe used AGNTCY to implement a multi-agent intelligence system for video monitoring",
    body: "See how SoftServe overcame intelligent video monitoring challenges with scalable, modular, real-time solutions.",
    href: "https://outshift.cisco.com/blog/how-softserve-used-agntcy-multi-agent-intelligence-video-monitoring",
  },
  {
    title:
      "Hands-on with CAIPE: Building an open source, multi-agent system for platform engineering",
    body: "How the open source Community AI Platform Engineering (CAIPE) project leverages AGNTCY components.",
    href: "https://outshift.cisco.com/blog/caipe-building-open-source-multi-agent-systems-for-platform-engineering",
  },
  {
    title:
      "Building multi-agentic systems with AGNTCY's Application SDK and reference application",
    body: "The Sock Shop for the Internet of Agents — reference application and SDK showcasing AGNTCY.",
    href: "https://outshift.cisco.com/blog/multi-agentic-systems-agntcy-application-sdk-reference-application",
  },
];

export default function ArticlesPage() {
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
            Articles
          </h1>

          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-white md:text-base lg:text-lg 3xl:mt-7 3xl:max-w-4xl 3xl:text-2xl">
            Read the latest blog posts, deep dives, and technical writing from
            AGNTCY and the Internet of Agents community.
          </p>

          <a
            href="https://blogs.agntcy.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative mt-12 block cursor-pointer rounded-[20px] border border-[#0d274d] bg-[#00142b] p-7 shadow-[0px_4px_30px_#0d274d] transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:mt-16 3xl:rounded-[28px] 3xl:p-10"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[28px]"
            />
            <SquareArrowOutUpRight
              aria-hidden
              className="absolute right-6 top-6 h-5 w-5 text-[#e8e9ea] opacity-0 transition-opacity duration-300 group-hover:opacity-100 3xl:right-8 3xl:top-8 3xl:h-6 3xl:w-6"
            />
            <div className="flex items-center gap-4 3xl:gap-6">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-[#187adc] bg-[#187adc]/10 text-[#fbaf45] 3xl:h-16 3xl:w-16 3xl:rounded-[18px]">
                <BookOpen aria-hidden className="h-6 w-6 3xl:h-8 3xl:w-8" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-[#e8e9ea] md:text-2xl 3xl:text-3xl">
                  Technical Blog
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[#e8e9ea] md:text-base 3xl:mt-2.5 3xl:text-xl">
                  In-depth engineering posts on the AGNTCY stack — discovery,
                  identity, messaging, and observability for the Internet of
                  Agents.
                </p>
              </div>
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#187adc] transition-colors duration-200 group-hover:text-[#fbaf45] 3xl:mt-7 3xl:gap-2 3xl:text-lg">
              blogs.agntcy.org
            </span>
          </a>

          <section className="mt-16 3xl:mt-24">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fbaf45] 3xl:text-base">
              Outshift Blog
            </p>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 3xl:mt-8 3xl:gap-7">
              {OUTSHIFT_ARTICLES.map((article) => (
                <a
                  key={article.href}
                  href={article.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex cursor-pointer flex-col rounded-[20px] border border-[#0d274d] bg-[#00142b] p-6 shadow-[0px_4px_30px_#0d274d] transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] 3xl:rounded-[28px] 3xl:p-8"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[20px] p-px opacity-0 transition-opacity duration-300 [background:linear-gradient(135deg,#187adc,#5fd3ff)] [-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] group-hover:opacity-100 3xl:rounded-[28px]"
                  />
                  <SquareArrowOutUpRight
                    aria-hidden
                    className="absolute right-5 top-5 h-4 w-4 text-[#e8e9ea] opacity-0 transition-opacity duration-300 group-hover:opacity-100 3xl:right-6 3xl:top-6 3xl:h-5 3xl:w-5"
                  />
                  <h3 className="pr-6 text-base font-bold leading-snug text-[#e8e9ea] 3xl:text-xl">
                    {article.title}
                  </h3>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#e8e9ea] 3xl:mt-4 3xl:text-base">
                    {article.body}
                  </p>
                  <span className="mt-auto pt-4 text-xs font-semibold text-[#187adc] transition-colors duration-200 group-hover:text-[#fbaf45] 3xl:pt-6 3xl:text-base">
                    Read on Outshift
                  </span>
                </a>
              ))}
            </div>
          </section>
        </main>
        <AgntcyFooter />
      </div>
    </div>
  );
}
