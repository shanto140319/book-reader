import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { UserMenu } from "@/components/app/UserMenu";
import { getCurrentUser } from "@/lib/auth";

export async function AppHeader() {
  const user = await getCurrentUser();

  return (
    <HeaderFrame>{user && <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />}</HeaderFrame>
  );
}

export function AppHeaderSkeleton() {
  return (
    <HeaderFrame>
      <span className="size-9 animate-pulse rounded-full bg-surface-2" />
    </HeaderFrame>
  );
}

function HeaderFrame({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/library" aria-label="Pata library">
          <Logo />
        </Link>
        {children}
      </div>
    </header>
  );
}
