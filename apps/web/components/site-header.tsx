import { Bookmark, Github } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/trebeljahr/better-bookmarks";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Bookmark className="size-5" />
          <span>Better Bookmarks</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/press">Press</Link>
          </Button>
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
  );
}
