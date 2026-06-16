import type { Metadata } from "next";
import Link from "next/link";
import { AgntcyFooter } from "@/components/agntcy-footer";
import { ArticleGrid, type Article } from "@/components/article-grid";
import { BackToTop } from "@/components/back-to-top";
import { withBase } from "@/lib/site";

export const metadata: Metadata = {
  title: "Articles — AGNTCY",
  description:
    "Read the latest articles, blog posts, and technical writing from AGNTCY and the Internet of Agents community.",
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

const ARTICLES: Article[] = [
  {
    source: "Technical Blog",
    title: "Now you’re thinking with Agents",
    href: "https://blogs.agntcy.org/technical/agents/a2a/2026/06/08/thinking-with-agents.html",
    date: "2026-06-08",
    excerpt:
      "There is a moment in Portal when the game clicks. You stop trying to find a way around the obstacle and you realise you can just connect two surfaces with a…",
  },
  {
    source: "Technical Blog",
    title: "lazydir: A Terminal UI for Browsing Agent Directory",
    href: "https://blogs.agntcy.org/technical/2026/05/20/lazydir-v0.0.1.html",
    date: "2026-05-20",
    excerpt:
      "The tooling around Agent Directory has evolved through several layers. The dirctl CLI provides full programmatic control, and the Directory MCP server enables…",
  },
  {
    source: "Technical Blog",
    title: "SLIM MVP: Multicluster Customer Remediation with AI Agents",
    href: "https://blogs.agntcy.org/technical/2026/04/21/mvp-ai-agents-multicluster.html",
    date: "2026-04-21",
    excerpt:
      "This post walks through a multicluster customer-remediation scenario built on SLIM. A customer cluster stays private, a cloud-hosted troubleshooting agent…",
  },
  {
    source: "Technical Blog",
    title: "SLIM for Observability and Remediation: Beyond Agentic AI",
    href: "https://blogs.agntcy.org/technical/2026/04/02/transporting-opentelemetry-over-slim.html",
    date: "2026-04-02",
    excerpt:
      "SLIM (Secure Low-Latency Interactive Messaging) was designed as the transport layer for agentic AI protocols like A2A (Agent-to-Agent). While SLIM was built…",
  },
  {
    source: "Technical Blog",
    title: "SlimRPC Multicast: One Call, Every Agent",
    href: "https://blogs.agntcy.org/technical/slim/agents/2026/03/31/slimrpc-multicast.html",
    date: "2026-03-31",
    excerpt:
      "Standard RPC is point-to-point: one client talks to one server. But agentic AI workloads rarely fit that mold. A coordinator agent might need to fan out a task…",
  },
  {
    source: "Technical Blog",
    title: "Announcing slim-a2a-go 0.1.0: Native A2A over SLIM for Go",
    href: "https://blogs.agntcy.org/agents/go/slim/a2a/announcements/2026/03/24/slim-a2a-go-release.html",
    date: "2026-03-24",
    excerpt:
      "We’re excited to announce the initial release of slim-a2a-go (v0.1.0): a Go library that lets any A2A agent communicate over SLIM instead of HTTP or gRPC — in…",
  },
  {
    source: "Technical Blog",
    title:
      "Write Once, Run Everywhere: Why Rust + UniFFI is the Future of Multi-Language Libraries",
    href: "https://blogs.agntcy.org/technical/2026/03/13/rust-uniffi-multilanguage-strategy.html",
    date: "2026-03-13",
    excerpt:
      "Imagine writing your core business logic once and having it automatically available in Python, Swift, Kotlin, Ruby, and Go. No rewrites, no version drift, no…",
  },
  {
    source: "Technical Blog",
    title:
      "Directory Federation Hands-On: SPIRE and SPIFFE in a Local Kind Environment",
    href: "https://blogs.agntcy.org/technical/security/directory/2026/02/25/directory-federation.html",
    date: "2026-02-25",
    excerpt:
      "Agent Directory is a secure, scalable, decentralized service that holds agent records. The software allows users to publish and discover agent records across…",
  },
  {
    source: "Technical Blog",
    title: "Directory MCP Server: Bringing AI Agent Discovery to Your IDE",
    href: "https://blogs.agntcy.org/technical/2026/02/19/directory-mcp-server.html",
    date: "2026-02-19",
    excerpt:
      "The Model Context Protocol (MCP) has emerged as a powerful standard for connecting AI assistants with external tools and data sources. In this post, we’ll…",
  },
  {
    source: "Technical Blog",
    title:
      "Agent Directory v1.0: Distributed Announce and Discovery of Multi-Agentic-Systems",
    href: "https://blogs.agntcy.org/technical/2026/02/19/dir-v1.html",
    date: "2026-02-19",
    excerpt:
      "As AI systems evolve from isolated models into interconnected networks of specialized agents, several challenges emerge: How do agents find each other?…",
  },
  {
    source: "Outshift Blog",
    title: "AI observability in multi-agent systems using OpenTelemetry",
    href: "https://outshift.cisco.com/blog/ai-observability-multi-agent-systems-opentelemetry",
    date: "2025-09-22",
    excerpt:
      "Microsoft, Splunk work with AGNTCY to introduce new semantic conventions into OpenTelemetry.",
  },
  {
    source: "Outshift Blog",
    title:
      "AGNTCY project donated to Linux Foundation with major industry backing",
    href: "https://outshift.cisco.com/blog/agntcy-donated-to-linux-foundation",
    date: "2025-07-29",
    excerpt:
      "Cisco, Dell Technologies, Google Cloud, Oracle and Red Hat join as formative members, alongside 75+ companies supporting AGNTCY.",
  },
  {
    source: "Outshift Blog",
    title: "The 4 phases for successful development of multi-agent software",
    href: "https://outshift.cisco.com/blog/four-phases-for-development-of-multi-agent-apps",
    date: "2025-03-04",
    excerpt:
      "How to build multi-agent systems — four phases from idea to deployment.",
  },
  {
    source: "Outshift Blog",
    title:
      "Webex and AGNTCY: How this healthcare booking multi-agent system showcases enterprise innovation",
    href: "https://outshift.cisco.com/blog/webex-agntcy-multi-agent-systems",
    date: "2025-10-15",
    excerpt:
      "Building a multi-agent system for a healthcare contact center.",
  },
  {
    source: "Outshift Blog",
    title:
      "How SoftServe used AGNTCY to implement a multi-agent intelligence system for video monitoring",
    href: "https://outshift.cisco.com/blog/how-softserve-used-agntcy-multi-agent-intelligence-video-monitoring",
    date: "2025-11-14",
    excerpt:
      "See how SoftServe overcame intelligent video monitoring challenges with scalable, modular, real-time solutions.",
  },
  {
    source: "Outshift Blog",
    title:
      "Hands-on with CAIPE: Building an open source, multi-agent system for platform engineering",
    href: "https://outshift.cisco.com/blog/caipe-building-open-source-multi-agent-systems-for-platform-engineering",
    date: "2025-09-05",
    excerpt:
      "How the open source Community AI Platform Engineering (CAIPE) project leverages AGNTCY components.",
  },
  {
    source: "Outshift Blog",
    title:
      "Building multi-agentic systems with AGNTCY's Application SDK and reference application",
    href: "https://outshift.cisco.com/blog/multi-agentic-systems-agntcy-application-sdk-reference-application",
    date: "2025-07-23",
    excerpt:
      "The Sock Shop for the Internet of Agents — reference application and SDK showcasing AGNTCY.",
  },
  {
    source: "External Articles",
    title: "Why We Need a New Internet for AI",
    href: "https://partners.wsj.com/cisco/building-the-internet-of-agents/why-we-need-a-new-internet-for-ai",
    date: "2025-03-09",
    excerpt:
      "WSJ for Business: Vijoy Pandey on reshaping the internet to support AI-native, agent-based systems.",
  },
  {
    source: "External Articles",
    title:
      "A standard, open framework for building AI agents is coming from Cisco, LangChain and Galileo",
    href: "https://venturebeat.com/ai/a-standard-open-framework-for-building-ai-agents-is-coming-from-cisco-langchain-and-galileo/",
    date: "2025-03-06",
    excerpt:
      "VentureBeat: a new open-source stack for agentic AI — built for devs, backed by experts.",
  },
  {
    source: "External Articles",
    title: "AGNTCY: Building the Future of Multi-Agentic Systems",
    href: "https://www.galileo.ai/blog/agntcy-open-collective-multi-agent-standardization",
    date: "2025-03-05",
    excerpt:
      "Galileo: why Galileo joined AGNTCY to help standardize agentic AI for developers.",
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
                  target="_blank"
                  rel="noopener noreferrer"
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
            AGNTCY and the Internet of Agents community — from the engineering
            Technical Blog and the Outshift Blog, in one place.
          </p>

          <section className="mt-16 3xl:mt-24">
            <ArticleGrid articles={ARTICLES} />
          </section>
        </main>
        <AgntcyFooter />
      </div>
      <BackToTop />
    </div>
  );
}
