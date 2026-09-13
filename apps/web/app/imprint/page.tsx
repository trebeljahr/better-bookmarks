import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const CONTACT_EMAIL = "imprint+better-bookmarks@trebeljahr.com";

export const metadata: Metadata = {
  title: "Imprint · Better Bookmarks",
  description:
    "Legal notice and contact details for Better Bookmarks, including service provider information under German law.",
};

export default function ImprintPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <header className="mb-10">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Imprint</h1>
            <p className="mt-4 text-muted-foreground">
              Information pursuant to § 5 DDG (German Digital Services Act) and § 18 (2) MStV
              (Interstate Media Treaty). See also the{" "}
              <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
                Privacy page
              </Link>
              .
            </p>
          </header>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Service Provider</h2>
            <p className="leading-7">
              Rico Trebeljahr
              <br />
              c/o Block Services
              <br />
              Stuttgarter Str. 106
              <br />
              70736 Fellbach
              <br />
              Germany
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Contact</h2>
            <p className="leading-7">
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Person Responsible for Content (§ 18 (2) MStV)
            </h2>
            <p className="leading-7">
              Rico Trebeljahr
              <br />
              c/o Block Services
              <br />
              Stuttgarter Str. 106
              <br />
              70736 Fellbach
              <br />
              Germany
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Liability for Content</h2>
            <p className="leading-7">
              As a service provider, I am responsible for my own content on these pages in
              accordance with § 7 (1) DDG and general laws. However, pursuant to §§ 8 to 10 DDG, I
              am not obligated as a service provider to monitor transmitted or stored third-party
              information or to investigate circumstances that indicate illegal activity.
            </p>
            <p className="leading-7">
              Obligations to remove or block the use of information under general laws remain
              unaffected. Liability in this regard is only possible from the point in time at which
              a specific legal violation becomes known. Upon becoming aware of such violations, I
              will remove this content immediately.
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Liability for Links</h2>
            <p className="leading-7">
              This site contains links to external websites of third parties over whose content I
              have no influence. Therefore, I cannot assume any liability for these third-party
              contents. The respective provider or operator of the pages is always responsible for
              the content of the linked pages.
            </p>
          </section>

          <section className="space-y-4 py-6">
            <h2 className="text-2xl font-semibold tracking-tight">Copyright</h2>
            <p className="leading-7">
              The content and works created by the site operator on these pages are subject to
              German copyright law. Duplication, processing, distribution, and any kind of use
              outside the limits of copyright require the written consent of the respective author
              or creator.
            </p>
          </section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
