'use client';

import Link from "next/link";

export function NavBar() {
  return (
    <nav className="border-b border-border/60 bg-card/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-12 items-center justify-between">
          {/* Brand */}
          <Link
            href="/"
            className="text-lg font-semibold text-foreground hover:text-primary transition-colors duration-200"
          >
            Email Workflow
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-6">
            <Link
              href="/inbox"
              className="text-muted-foreground hover:text-foreground font-medium transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all after:duration-200 hover:after:w-full"
            >
              Inbox
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
