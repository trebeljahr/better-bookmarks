import { Github, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPO_URL = "https://github.com/trebeljahr/better-bookmarks";
const PRESS_EMAIL = "hello@trebeljahr.com";

export const metadata: Metadata = {
  title: "Press — Better Bookmarks",
  description:
    "Fact sheet, boilerplate copy, feature list, FAQ and contact for journalists and editors covering Better Bookmarks.",
};

const factSheet: Array<[string, React.ReactNode]> = [
  ["Project", "Better Bookmarks"],
  [
    "Tagline",
    "Pinboard for the Chrome era — tags, not folders. One URL per page. Scales to twenty thousand.",
  ],
  [
    "URL",
    <a
      key="url"
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      github.com/trebeljahr/better-bookmarks
    </a>,
  ],
  [
    "Install",
    "Chrome Web Store (link pending submission — see launch checklist; until then, load unpacked from the GitHub release zip).",
  ],
  ["Maker", "Rico Trebeljahr — solo developer, no company"],
  ["Location", "Berlin, Germany"],
  ["Release", "2026 (public launch contingent on Chrome Web Store review)"],
  ["Price", "Free. No paid tier, ever. No account required."],
  ["License", "MIT (open source). LICENSE file shipped in repo root."],
  [
    "Platforms",
    "Chrome and Chromium-based browsers (Edge, Brave, Arc, Opera) at launch. Firefox build planned via the same WXT build path; ship to AMO post-launch.",
  ],
  [
    "Permissions",
    "storage, tabs, bookmarks, downloads, alarms, activeTab, sidePanel, contextMenus, host permissions for <all_urls>. Justified per-permission in the Chrome Web Store privacy form.",
  ],
  [
    "Data handling",
    "All bookmark data stored locally in IndexedDB and chrome.storage. Nothing transmitted to remote servers by the extension. Chrome's own sync handles cross-device propagation of the bookmark tree itself.",
  ],
  [
    "Corpus designed for",
    "20,000+ bookmarks. The maintainer's own corpus is in this range; design targets and IndexedDB inverted index are sized accordingly.",
  ],
  ["Stack", "Manifest V3, WXT, Vite, React 19, shadcn/ui, Tailwind v4, IndexedDB, Biome, Vitest."],
  [
    "Source of truth",
    "Chrome bookmarks tree for URL + title + folder. Better Bookmarks for tags, ratings, notes, connections, canonical URL, content type, last-read timestamp.",
  ],
  [
    "Press contact",
    <a
      key="mail"
      href={`mailto:${PRESS_EMAIL}`}
      className="underline underline-offset-4 hover:text-foreground"
    >
      {PRESS_EMAIL}
    </a>,
  ],
];

const descriptions = [
  {
    label: "Short",
    length: "~40 words",
    body: "Better Bookmarks is a Chrome extension that adds tags, ratings, notes, and a small connection graph to bookmarks — and aggressively deduplicates URLs by stripping tracking parameters. It syncs both ways with Chrome's native bookmark tree, so there is no lock-in. MIT licensed, free.",
  },
  {
    label: "Medium",
    length: "~80 words",
    body: "Better Bookmarks is a Chrome extension built around three convictions: bookmarks should be tagged, not foldered; two saves of the same article should not produce two bookmarks (tracking parameters are part of the problem, not part of the URL); and search should still feel instant at twenty thousand bookmarks. The extension layers tags, ratings, notes, and a connection graph onto the existing Chrome bookmark tree without replacing it — Chrome stays the source of truth, mobile sync keeps working, the omnibox keeps working.",
  },
  {
    label: "Long",
    length: "~150 words",
    body: "Better Bookmarks is a Chrome extension for people whose bookmark collections have outgrown folders. It treats every URL as a fingerprint, not a label: a per-domain canonicalisation pipeline strips tracking parameters (utm_*, ?t=42s on YouTube, ?s=20 on Twitter, ?fbclid, text fragments, and the long tail) so that two saves of the same article produce one bookmark, not two. Bookmarks carry tags, ratings, reading time, notes, and edges to other bookmarks. The extension is layered on top of Chrome's native bookmark tree rather than replacing it — Chrome remains the source of truth for URL, title, and folder, and changes on either side propagate to the other within a second. The search index lives in IndexedDB and is sized for the maintainer's own corpus of twenty thousand-plus bookmarks. Everything is stored locally; no account, no cloud server, no telemetry. MIT licensed, free.",
  },
];

const features: Array<{ title: string; body: string }> = [
  {
    title: "Tag-first organisation",
    body: "Bookmarks carry an unbounded set of tags. The Chrome folder a bookmark sits in becomes one of its tags automatically. Folders are a projection over tags, not the primary structure.",
  },
  {
    title: "Aggressive URL deduplication",
    body: "Per-domain canonicalisation strips tracking parameters (utm_*, ?t=42s, ?s=20, ?fbclid, #:~:text=…) so two saves of the same page do not produce two bookmarks. Re-runnable across the full corpus.",
  },
  {
    title: "Two-way Chrome sync",
    body: "Chrome stays the source of truth for URL, title, and folder. Bookmarks created in plain Chrome appear in the extension within ~1 s; bookmarks created in the extension appear in the Chrome bar within ~1 s. Loop prevention via an inFlight token mechanism. Documented in docs/CHROME_SYNC.md.",
  },
  {
    title: "Per-bookmark metadata",
    body: 'Rating, estimated reading time, content type, "have I read this", manual note. All optional; a bookmark with zero metadata is still a valid bookmark.',
  },
  {
    title: "Connection graph",
    body: 'Manual edges ("source for", "rebuts", "see also") plus auto-suggestions (shared canonical domain, shared tag intersection, text similarity). The graph is a help-me-find-things aid, not a writing surface.',
  },
  {
    title: "IndexedDB inverted index",
    body: "Designed for 20k+ bookmarks. Off-main-thread for heavy queries. Degrades gracefully when the index is stale.",
  },
  {
    title: "Search query language",
    body: "Bare words plus tag:foo, domain:example.com, is:unread, rating:>=7. Optional omnibox keyword (bb) hits the same query path.",
  },
  {
    title: "Import / export",
    body: "JSON round-trips losslessly. Netscape HTML import + export (Chrome / Firefox compatible). Goodreads HTML, Pocket CSV, raw URL list importers. Every export is portable; the extension cannot trap data.",
  },
  {
    title: "Optional opt-in enrichment",
    body: "Background fetch of og: tags, <title>, reading-time estimate. Off by default; the core flow stays deterministic and offline.",
  },
  {
    title: "Side panel + context menu + action badge",
    body: "Chrome MV3 surfaces — capture from the omnibox, the action button, the right-click menu, or the side panel.",
  },
  {
    title: "Dead-link checker",
    body: 'Background sweep flags bookmarks whose target now returns 404, with a one-click "archive" or "fix" path.',
  },
  {
    title: "Tag management UI",
    body: "Rename, merge, delete tags with confirmation; tag hierarchy with colours.",
  },
  {
    title: "MIT licensed",
    body: "Full source on GitHub. Issues and PRs welcome.",
  },
];

const hooks = [
  {
    title: "The URL canonicalisation pipeline",
    body: "Per-domain rules for YouTube, Twitter/X, Reddit, GitHub, Wikipedia, Amazon; rule-based stripping for utm_*, text fragments, fbclid, si, and the rest. Deterministic, re-runnable on the full corpus when rules tighten. Documented in docs/URL_NORMALIZATION.md.",
    audience: "Hacker News, Lobsters, /r/programming, /r/webdev",
  },
  {
    title: "Pinboard for the Chrome era",
    body: "Same first principles (tags, durable export, no cloud lock-in, single-developer project), built for the browser and the corpus size people actually have in 2026.",
    audience: "Pinboard refugees, /r/pinboard, slow-web blogs",
  },
  {
    title: "No lock-in by design",
    body: "The extension is a second store layered onto the native Chrome bookmarks tree. Uninstall it and every bookmark is still in Chrome, still on mobile, still in the omnibox. The architecture makes lock-in structurally impossible.",
    audience: "Privacy-leaning press, FOSS communities, anyone tired of SaaS-trap bookmark apps",
  },
  {
    title: "Solo project, open source, no business model",
    body: "MIT licence, no upsell, no paid tier, no telemetry. Built by one developer who has the problem himself.",
    audience: "Indie / FOSS coverage, Bluesky, Mastodon",
  },
];

const engineeringFacts = [
  "Stack: Manifest V3, WXT (build tooling), Vite, React 19, shadcn/ui, Tailwind v4, IndexedDB, Biome, Vitest. Recently migrated from Webpack to WXT/Vite and from MUI 5 / React 17 to shadcn/ui / React 19.",
  "Storage: IndexedDB for bookmarks, edges, tags, sync mapping table, inverted index. chrome.storage.local for settings and per-domain canonicalisation rules. chrome.storage.sync for the small cross-device settings only.",
  "Sync architecture: a service-worker sync service listens to the six Chrome bookmark events plus the extension's own change stream. An inFlight token mechanism prevents loops. Drift reconciliation runs on startup. Documented in docs/CHROME_SYNC.md.",
  "Canonicalisation: pure, deterministic, re-runnable. Per-domain strategies for YouTube, Twitter/X, Reddit, GitHub, Wikipedia, Amazon. Global rules for utm_*, text fragments, default ports, trailing slashes on /. Documented in docs/URL_NORMALIZATION.md. Fixture tests in Vitest.",
  "Search: inverted index in IndexedDB, ranking by recency × rating × tag-match weight. Background indexer triggered by bookmark:upserted events. Design target: queries return in < 50 ms on a 20k corpus.",
  "Build artifacts: pnpm zip produces a Chrome upload zip; pnpm zip:firefox produces a Firefox build via WXT's cross-browser targets.",
  "Repo layout: extension source in src/, marketing site in apps/web/ (Next.js), design docs in docs/.",
];

const faqs = [
  {
    q: "Is my bookmark data sent anywhere?",
    a: "No. Bookmarks live in your browser's IndexedDB and chrome.storage. The extension does not include a server. Chrome's own bookmark sync handles cross-device propagation of the bookmark tree itself — that is Google's existing sync, not anything new this extension adds.",
  },
  {
    q: "Does it replace Chrome's bookmarks?",
    a: "No. It adds a second store layered on top. Chrome's bookmark tree stays the source of truth for URL, title, and folder; the extension adds tags, rating, notes, and a connection graph. Uninstall the extension and your bookmarks are still in Chrome, still on mobile, still in the omnibox.",
  },
  {
    q: "Why tags instead of folders?",
    a: 'A bookmark about, say, diffusion models is "AI", "generative", "paper", and "read-later" all at once. Folders force a single answer. Tags let you carry every label that applies and pivot on any of them when searching.',
  },
  {
    q: "How does the duplicate detection work?",
    a: "Each bookmark has both an originalUrl (what you visited, preserved) and a canonicalUrl (the dedup key). The canonicaliser is a small pipeline of per-domain rules (YouTube ?t=, Twitter ?s=, etc.) plus global tracking-parameter stripping (utm_*, fbclid, ?si=…, text fragments). Saving the same canonical URL twice updates the existing bookmark rather than creating a new one. Full rule set: docs/URL_NORMALIZATION.md.",
  },
  {
    q: "Does it work in Firefox? Safari? Edge?",
    a: "Edge / Brave / Arc / Opera: yes, they accept Chrome extensions. Firefox: planned. The build system (WXT) already targets Firefox, but the Firefox build has not been validated for launch and is not yet on AMO. Safari: no — Safari uses a different extension format and is not planned.",
  },
  {
    q: "Will there be a paid tier?",
    a: "No.",
  },
  {
    q: "Is there a cloud sync server for the tags and notes?",
    a: "No. Chrome's native sync handles the bookmark tree (URL, title, folder). The extension's added metadata (tags, ratings, notes, connections) syncs only via Chrome's small chrome.storage.sync quota for the settings bits, and stays local in IndexedDB for the rest. Cross-device metadata sync of the full store is a v2 question and would be solved by exporting to a synced folder or a Gist, not by hosting a Better Bookmarks server.",
  },
  {
    q: "How do I migrate from Raindrop / Pocket / Pinboard / Goodreads?",
    a: "JSON import for the native format and a CSV importer for Pocket are shipped or in the import roadmap. Pinboard exports as JSON; Raindrop exports as HTML/CSV/JSON; both are supported via the JSON or Netscape HTML import paths. Goodreads ships its own HTML dump and has a dedicated importer. A raw URL list import also exists for the cases where nothing else lines up.",
  },
  {
    q: "Can I export everything?",
    a: "Yes. JSON round-trips losslessly. Netscape HTML export produces a file Chrome and Firefox import directly. Even if Better Bookmarks disappears, you keep everything.",
  },
  {
    q: "How big a bookmark collection can it handle?",
    a: "The design target is 20k+. The maintainer's own corpus is in that range. If your collection is meaningfully larger and you hit a wall, open a GitHub issue with a corpus-size note — the scale targets move as the maintainer's own collection moves.",
  },
  {
    q: "Does it do AI auto-tagging?",
    a: "No, not by default. An optional enrichment pass can be added later as an opt-in. The core flow stays deterministic and offline. Anyone who wants LLM tagging has thirty other options; this extension is the opposite of that.",
  },
  {
    q: "Where's the source?",
    a: "github.com/trebeljahr/better-bookmarks — MIT licensed.",
  },
];

const quotes = [
  "I have twenty thousand bookmarks. Every bookmark manager I tried either pretended that wasn't normal, or charged me for it. I built the one that doesn't.",
  "The URL canonicalisation pipeline is the part I am most proud of. It's a small set of deterministic rules, but it makes a real bookmark collection feel sane in a way no number of folders ever could.",
  "Chrome stays the source of truth. The extension is a second store layered on top — bookmarks created in plain Chrome show up here, bookmarks created here appear in the Chrome bar. Uninstall the extension and you've lost nothing. Lock-in is structurally impossible.",
  "It runs entirely on your device. There is no server. There is no account. Chrome already syncs your bookmark tree across devices; we don't need to re-invent that.",
];

const history = `Better Bookmarks started because Chrome bookmarks stopped scaling. I had twenty thousand of them — articles, papers, RFCs, talks, weird corners of the web I wanted to find again — sitting in a folder hierarchy that was simultaneously too deep and too flat. The omnibox was the only thing that ever found anything. Folders had become write-only.

I tried Pinboard, Raindrop, GoodLinks, Anybox. Pinboard is exactly right philosophically and exactly the wrong era visually for the people I wanted to share it with. Raindrop's free tier is crippled and the paid tier started slowing past five thousand entries. GoodLinks and Anybox are macOS-shaped and I do not live there.

The thing none of them had: Chrome stays the source of truth. Mobile sync keeps working. The omnibox keeps working. The bookmarks bar keeps working. Better Bookmarks adds what Chrome can't (tags, ratings, notes, connections, deterministic dedup), and it does it as a second store layered on top of the native one, synced both ways.

The URL canonicalisation came out of frustration with how many of those twenty thousand bookmarks were near-duplicates. I'd bookmarked the same paper from arxiv, from a tweet (with ?s=20), from a newsletter (with ?utm_source=…), from a Hacker News comment (with ?utm_medium=email). The fix is small, deterministic, and re-runnable: a rule set per domain plus a stripper for the tracking-param zoo, all documented in docs/URL_NORMALIZATION.md.

I am writing this for me, first. There are a handful of other people in the world who already have this many bookmarks and have already tried the same alternatives. This is for them too.`;

const boilerplate =
  "Better Bookmarks is a Chrome extension built by Rico Trebeljahr in Berlin. It adds tags, ratings, notes, and a connection graph to browser bookmarks, and deduplicates URLs aggressively by stripping tracking parameters and applying per-domain canonical rules. The extension layers on top of Chrome's native bookmark tree without replacing it, syncs both ways, runs entirely on-device, and is designed for collections of twenty thousand bookmarks and up. Free, MIT licensed, no account. Available on the Chrome Web Store; source at github.com/trebeljahr/better-bookmarks.";

export default function PressPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        <PressHero />
        <FactSheet />
        <OneSentence />
        <Descriptions />
        <History />
        <Hooks />
        <Features />
        <Engineering />
        <PressFaq />
        <Quotes />
        <Boilerplate />
        <Contact />
      </main>

      <SiteFooter />
    </div>
  );
}

function PressHero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.65_0.18_270/0.18),transparent_70%)]"
      />
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <div className="flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            Press kit
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Better Bookmarks — Press Kit
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Single-page fact sheet for journalists, newsletter editors, and bloggers. Copy any text
            on this page verbatim where it helps. For interviews or longer features, mail{" "}
            <a
              href={`mailto:${PRESS_EMAIL}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {PRESS_EMAIL}
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <a href={`mailto:${PRESS_EMAIL}`}>
                <Mail className="size-4" />
                Contact press
              </a>
            </Button>
            <Button variant="outline" asChild>
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

function Section({
  id,
  title,
  subtitle,
  children,
  className,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`border-t border-border/40 bg-background ${className ?? ""}`.trim()}
    >
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          {subtitle ? (
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function FactSheet() {
  return (
    <Section
      id="fact-sheet"
      title="Fact sheet"
      subtitle="Numbers reflect the state of the extension at the time this page was written. When in doubt, mail hello@trebeljahr.com to confirm."
    >
      <Card className="bg-card/60">
        <CardContent className="p-0">
          <dl className="divide-y divide-border/40">
            {factSheet.map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-1 gap-1 px-6 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6"
              >
                <dt className="text-sm font-medium text-muted-foreground">{k}</dt>
                <dd className="text-sm leading-6">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </Section>
  );
}

function OneSentence() {
  return (
    <Section id="one-sentence" title="One sentence">
      <p className="text-lg leading-8">
        A Chrome extension that fixes the three things browser bookmarks get wrong: single-folder
        membership, tracking-parameter duplicates, and search that gives up past a few thousand
        entries.
      </p>
    </Section>
  );
}

function Descriptions() {
  return (
    <Section
      id="descriptions"
      title="Three description tiers"
      subtitle="Ready-to-copy paragraphs at three lengths."
    >
      <div className="grid gap-6">
        {descriptions.map((d) => (
          <Card key={d.label} className="bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-4">
                <span>{d.label}</span>
                <span className="text-xs font-normal text-muted-foreground">{d.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-7 text-foreground">{d.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function History() {
  return (
    <Section id="history" title="History — how it got built">
      <div className="space-y-4 text-base leading-7 text-foreground">
        {history.split("\n\n").map((paragraph, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static content
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}

function Hooks() {
  return (
    <Section id="hooks" title="Hooks" subtitle="Four framing angles, each with a suggested venue.">
      <div className="grid gap-6 sm:grid-cols-2">
        {hooks.map((h) => (
          <Card key={h.title} className="bg-card/60">
            <CardHeader>
              <CardTitle>{h.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-6">{h.body}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">For:</span> {h.audience}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function Features() {
  return (
    <Section
      id="features"
      title="Features"
      subtitle="Verbatim for press features and storefront use."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title} className="bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function Engineering() {
  return (
    <Section
      id="engineering"
      title="Engineering fact sheet"
      subtitle="For tech editors — stack, storage, sync, canonicalisation, search."
    >
      <ul className="space-y-3">
        {engineeringFacts.map((fact, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: static content
            key={i}
            className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm leading-6"
          >
            {fact}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PressFaq() {
  return (
    <Section id="faq" title="FAQ">
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((item, idx) => (
          <AccordionItem key={item.q} value={`faq-${idx}`}>
            <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
            <AccordionContent className="text-base leading-7">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

function Quotes() {
  return (
    <Section id="quotes" title="Quotes" subtitle="Attribute to Rico Trebeljahr.">
      <div className="space-y-4">
        {quotes.map((q, i) => (
          <blockquote
            // biome-ignore lint/suspicious/noArrayIndexKey: static content
            key={i}
            className="border-l-2 border-border/60 pl-4 text-base italic leading-7 text-foreground/90"
          >
            &ldquo;{q}&rdquo;
          </blockquote>
        ))}
      </div>
    </Section>
  );
}

function Boilerplate() {
  return (
    <Section
      id="boilerplate"
      title="Boilerplate about"
      subtitle="Drop-in paragraph for the end of an article."
    >
      <Card className="bg-card/60">
        <CardContent className="p-6">
          <p className="text-base leading-7">{boilerplate}</p>
        </CardContent>
      </Card>
    </Section>
  );
}

function Contact() {
  return (
    <Section id="contact" title="Press contact">
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm leading-6">
              <a
                href={`mailto:${PRESS_EMAIL}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {PRESS_EMAIL}
              </a>
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Response window: typically same-day during European business hours. For interviews or
              longer features, indicate format and outlet in the subject line; written Q&amp;A is
              usually fastest to turn around.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Elsewhere</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6">
            <p>
              <span className="text-muted-foreground">GitHub:</span>{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                trebeljahr/better-bookmarks
              </a>
            </p>
            <p>
              <span className="text-muted-foreground">Blog:</span>{" "}
              <a
                href="https://ricos.site"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                ricos.site
              </a>
            </p>
            <p className="text-muted-foreground">
              Bluesky and Mastodon (fosstodon.org) handles are being warmed at launch.
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Back to the homepage
        </Link>
      </p>
    </Section>
  );
}
