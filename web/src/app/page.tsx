"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredParticipant } from "@/lib/participant";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const p = getStoredParticipant();
    if (p) router.replace("/dashboard");
    else router.replace("/login");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <p className="text-stone-600">Redirecting…</p>
    </div>
  );
}
