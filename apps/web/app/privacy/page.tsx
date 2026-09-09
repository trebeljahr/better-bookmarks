import { Bookmark, Github } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/trebeljahr/better-bookmarks";

export const metadata: Metadata = {
  title: "Privacy · Better Bookmarks",
  description:
    "What Better Bookmarks stores, what it sends over the network, and what it does not.",
};

export default function PrivacyPage() {
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
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <header className="mb-10">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Privacy</h1>
            <p className="mt-4 text-muted-foreground">
              The short version: your bookmarks stay in your browser. The extension does not send
              them anywhere. There are two optional network features you can turn on, and one
              analytics tool on this marketing site — details below.
            </p>
          </header>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Where your bookmarks live</h2>
            <p className="leading-7">
              Everything the extension knows about your bookmarks — URLs, titles, tags, ratings,
              notes, and connections between bookmarks — is stored locally in your browser, in
              IndexedDB and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-sm">chrome.storage</code>. Nothing
              is uploaded to a Better Bookmarks server, because there is no Better Bookmarks server.
            </p>
            <p className="leading-7">
              Chrome&apos;s own sync propagates the underlying bookmark tree across the devices
              you&apos;re signed into. That&apos;s a Chrome feature, not something this extension
              initiates or can see the traffic of.
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Network calls the extension can make
            </h2>
            <p className="leading-7">
              Both of these are opt-in and can be turned off at any time in the extension&apos;s
              Options page.
            </p>

            <div className="mt-4 space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Dead-link checking (opt-in)</h3>
                <p className="mt-2 leading-7">
                  When enabled, the extension periodically sends an HTTP{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">HEAD</code> request to each
                  bookmarked URL to see whether it still resolves. The request goes to the host of
                  the URL you bookmarked and no one else. Only the URL is sent — no titles, tags,
                  notes, or ratings ever leave your browser through this path.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold">Metadata enrichment (opt-in)</h3>
                <p className="mt-2 leading-7">
                  When enabled, the extension fetches bookmarked pages to parse{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">&lt;title&gt;</code>,{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">og:*</code> tags, and{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">
                    meta[name=description]
                  </code>
                  , and computes a reading-time estimate. The request goes to the host of the URL
                  you bookmarked. Nothing from your own bookmark data is sent along with it.
                </p>
              </div>
            </div>

            <p className="leading-7">
              Both live under <strong>Options</strong> in the extension. Toggle them off and the
              extension makes no network calls to the bookmarked hosts at all.
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">This marketing site</h2>
            <p className="leading-7">
              The{" "}
              <Link className="underline underline-offset-4" href="/">
                better-bookmarks marketing site
              </Link>{" "}
              uses <strong>self-hosted Plausible</strong> for basic traffic analytics. It is
              cookieless, does not fingerprint visitors, and the instance is hosted in the EU. No
              personal data is collected — Plausible sees only aggregated page views and referrers.
            </p>
            <p className="leading-7">
              No Google Analytics. No Meta pixel. No Segment, Mixpanel, PostHog, Amplitude, Vercel
              Analytics, Hotjar, or any other third-party tracker. No third-party cookies. No ad
              networks.
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">What&apos;s not here</h2>
            <ul className="list-disc space-y-2 pl-6 leading-7">
              <li>No account. Nothing to sign up for. No email collected.</li>
              <li>No crash-reporting SDK (no Sentry, no Bugsnag).</li>
              <li>No product analytics SDK inside the extension.</li>
              <li>No server-side storage of your bookmarks — there is no server.</li>
            </ul>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Checking for yourself</h2>
            <p className="leading-7">
              The extension is open source under the MIT license. A more detailed, code-linked audit
              of every outbound network call lives in{" "}
              <a
                className="underline underline-offset-4"
                href="https://github.com/trebeljahr/better-bookmarks/blob/master/docs/PRIVACY.md"
                target="_blank"
                rel="noreferrer"
              >
                docs/PRIVACY.md
              </a>{" "}
              in the repository. If you find a call this page fails to mention, please open an
              issue.
            </p>
          </section>

          <p className="mt-10 text-sm text-muted-foreground">Last updated: 2026-09-09.</p>
        </article>
      </main>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bookmark className="size-4" />
            <span>Better Bookmarks · MIT · © 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
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
        </div>
      </footer>
    </div>
  );
}
