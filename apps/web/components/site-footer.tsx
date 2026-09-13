import { Bookmark, Github } from "lucide-react";
import Link from "next/link";

const REPO_URL = "https://github.com/trebeljahr/better-bookmarks";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bookmark className="size-4" />
          <span>Better Bookmarks &middot; MIT &middot; &copy; 2026</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/imprint" className="hover:text-foreground">
            Imprint
          </Link>
          <Link href="/press" className="hover:text-foreground">
            Press
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 hover:text-foreground"
          >
            <Github className="size-4" />
            github.com/trebeljahr/better-bookmarks
          </a>
        </div>
      </div>
    </footer>
  );
}
