import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/track" className="text-lg font-semibold text-gray-900">
          RallyTracker
        </Link>
        <SignOutButton />
      </header>
      <main className="flex-1 bg-gray-50 p-6">{children}</main>
    </div>
  );
}
