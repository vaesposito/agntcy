import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LLM Wiki",
  description: "Status reports for AI-assisted engineering teams",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(geist.variable, geistMono.variable, lora.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={150}>
            <div className="mx-auto max-w-7xl px-6 py-8">
              <header className="mb-8 flex items-baseline justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
                <Link href="/" className="text-lg font-semibold tracking-tight">
                  LLM Wiki
                </Link>
                <ThemeToggle />
              </header>
              {children}
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
