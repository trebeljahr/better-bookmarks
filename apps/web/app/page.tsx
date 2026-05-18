import { Bookmark, Github, Link2, Sparkles, Tags } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REPO_URL = "https://github.com/trebeljahr/better-bookmarks";

const features = [
  {
    icon: Link2,
    title: "Bookmarks connect to each other",
    description:
      "Build a small graph of related pages. Following a thread of reading is more useful than a folder.",
  },
  {
    icon: Tags,
    title: "Tags, not folders",
    description:
      'Multi-category by default. A bookmark can be both "rust" and "compiler" without picking one.',
  },
  {
    icon: Sparkles,
    title: "Captures metadata that matters",
    description:
      "Reading time, content type, and a rating live next to each bookmark — so you can find things by what they are, not just where you saved them.",
  },
];

const faqs = [
  {
    q: "Where is my data stored?",
    a: "Locally, in your browser, via chrome.storage and IndexedDB. Nothing is uploaded to a server. Chrome's own sync handles cross-device propagation of the underlying bookmarks.",
  },
  {
    q: "Is it open source?",
    a: "Yes — MIT licensed. The full source lives on GitHub.",
  },
  {
    q: "Does it work in Firefox?",
    a: "Firefox support is planned. The extension is built with WXT, which targets cross-browser builds, so a Firefox build is on the roadmap.",
  },
  {
    q: "How do I export my bookmarks?",
    a: "The overview page has a JSON export — full data including tags, ratings, notes, and connections. JSON import is supported too.",
  },
];

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Bookmark className="size-5" />
            <span>Better Bookmarks</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <Github className="size-4" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Hero />
        <Why />
        <Screenshots />
        <Faq />
      </main>

      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.65_0.18_270/0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Chrome extension · open source
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            A better way to organize your Chrome bookmarks
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Tags, ratings, notes, and a small connection graph — layered on top of the bookmarks you
            already have. Stays in sync with the native Chrome tree so the omnibox keeps working.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <a href="#">Add to Chrome</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <Github className="size-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="border-t border-border/40 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for how bookmarks actually live in your head
          </h2>
          <p className="mt-4 text-muted-foreground">
            Three ideas the native bookmarks manager doesn&apos;t do well.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="bg-card/60">
              <CardHeader>
                <div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg border border-border/60 bg-background/50">
                  <f.icon className="size-5" />
                </div>
                <CardTitle>{f.title}</CardTitle>
                <CardDescription className="pt-2 leading-6">{f.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Screenshots() {
  return (
    <section className="border-t border-border/40 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            See it in your browser
          </h2>
          <p className="mt-4 text-muted-foreground">
            A quick tour of the popup, overview, and tag manager.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* TODO: replace with /screenshots/popup.png once captured */}
          <div className="aspect-[16/10] rounded-xl border border-dashed border-border/60 bg-card/40 p-6 flex items-center justify-center text-sm text-muted-foreground">
            Popup — quick capture with tag suggestions
          </div>
          {/* TODO: replace with /screenshots/overview.png once captured */}
          <div className="aspect-[16/10] rounded-xl border border-dashed border-border/60 bg-card/40 p-6 flex items-center justify-center text-sm text-muted-foreground">
            Overview — bulk select, filter, export
          </div>
          {/* TODO: replace with /screenshots/tags.png once captured */}
          <div className="aspect-[16/10] rounded-xl border border-dashed border-border/60 bg-card/40 p-6 flex items-center justify-center text-sm text-muted-foreground">
            Tags — rename, merge, delete
          </div>
          {/* TODO: replace with /screenshots/graph.png once captured */}
          <div className="aspect-[16/10] rounded-xl border border-dashed border-border/60 bg-card/40 p-6 flex items-center justify-center text-sm text-muted-foreground">
            Connections — link related bookmarks
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="border-t border-border/40 bg-background">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQ</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((item, idx) => (
            <AccordionItem key={item.q} value={`item-${idx}`}>
              <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="text-base leading-7">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bookmark className="size-4" />
          <span>Better Bookmarks · MIT · © 2026</span>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Github className="size-4" />
          github.com/trebeljahr/better-bookmarks
        </a>
      </div>
    </footer>
  );
}
