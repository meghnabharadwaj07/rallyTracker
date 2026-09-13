"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function RouteNameEditor({
  routeId,
  initialName,
}: {
  routeId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);

  const handleBlur = async () => {
    if (name === initialName || !name.trim()) return;
    await fetch(`/api/routes/${routeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete route "${initialName}"? This cannot be undone.`)) return;
    await fetch(`/api/routes/${routeId}`, { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <Link href="/admin" className="text-sm text-gray-500 hover:underline">
        &larr; All routes
      </Link>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-lg font-semibold"
      />
      <button
        onClick={handleDelete}
        className="text-sm text-red-600 hover:underline"
      >
        Delete route
      </button>
    </div>
  );
}
