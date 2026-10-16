import HomeForm from "@/components/HomeForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Czydycha</h1>
      <p className="mt-3 mb-8 text-lg text-muted">
        Sprawdź, jaką część liczby wpłat i zebranej kwoty w Zbiórce na siepomaga.pl stanowią małe wpłaty.
      </p>
      <HomeForm />
    </main>
  );
}
