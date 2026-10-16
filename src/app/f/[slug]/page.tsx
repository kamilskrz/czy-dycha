import type { Metadata } from "next";
import { Suspense } from "react";
import FundraiserView from "@/components/FundraiserView";
import { getRuntime } from "@/server/runtime";

const GENERIC_TITLE = "Wpływ małych wpłat – Czydycha";

// Tytuł z Magazynu (bez zapytań do portalu); gdy Zbiórki nie ma albo baza nie działa, tytuł ogólny.
export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const fundraiser = getRuntime().store.fundraiserBySlug(slug);
    return { title: fundraiser ? `${fundraiser.title} – Czydycha` : GENERIC_TITLE };
  } catch {
    return { title: GENERIC_TITLE };
  }
}

async function Result({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FundraiserView slug={slug} />;
}

export default function FundraiserPage({ params }: PageProps<"/f/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <Suspense fallback={<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Wczytywanie…</h1>}>
        <Result params={params} />
      </Suspense>
    </main>
  );
}
