"use client";
import { useQuery } from "@tanstack/react-query";
import { PublicNav, PublicFooter } from "@/components/shell/PublicNav";
import { SimTag } from "@/components/ui";
import { n, NONE } from "@/lib/format";
import { t } from "@/lib/i18n";

export default function Impact() {
  const { data } = useQuery({ queryKey: ["public-impact"], queryFn: () => fetch("/api/public/impact").then((r) => (r.ok ? r.json() : null)) });
  const rows = [
    ["Waste processed", data ? `${n(data.waste_processed_kg / 1000, 1)} t` : NONE, "Weighed on the hub scale"],
    ["Energy generated", data ? `${n(data.energy_kwh)} kWh` : NONE, "Plant meter readings"],
    ["CO₂e avoided", data ? `${n(data.co2_avoided_kg / 1000, 1)} t` : NONE, "Grid power displaced plus landfill methane avoided"],
    ["Energy prediction accuracy", data?.prediction_accuracy != null ? `${n(data.prediction_accuracy, 1)}%` : NONE, "100 minus the average error between predicted and metered kWh"],
  ] as const;
  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h1 className="font-serif text-4xl font-medium text-ink">{t("What has been measured so far")}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-ink-2"><SimTag />{t("These figures come from the demo network's simulated meters. They are recalculated each time you open the page.")}</p>

        <table className="mt-10 w-full">
          <tbody>
            {rows.map(([label, value, source]) => (
              <tr key={label} className="border-y border-line align-baseline">
                <th scope="row" className="w-[34%] py-5 pr-4 text-left text-sm font-normal text-ink-2">{t(label)}</th>
                <td className="num py-5 pr-4 font-serif text-3xl font-medium text-ink">{value}</td>
                <td className="hidden py-5 text-sm text-ink-3 sm:table-cell">{t(source)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-16 font-serif text-2xl font-medium text-ink">{t("How the numbers are worked out")}</h2>
        <dl className="mt-5 max-w-2xl space-y-4 text-sm leading-relaxed text-ink-2">
          <div><dt className="font-medium text-ink">{t("Grid power displaced")}</dt><dd>{t("Useful energy times {f} kg CO₂ per kWh, an approximate Indian grid factor.", { f: data?.factors?.grid_kg_co2_per_kwh ?? 0.71 })}</dd></div>
          <div><dt className="font-medium text-ink">{t("Landfill methane avoided")}</dt><dd>{t("Organic kg kept out of landfill times {f} kg CO₂e per kg, a rounded IPCC first-order-decay figure for food waste.", { f: data?.factors?.landfill_kg_co2e_per_kg_organic ?? 0.45 })}</dd></div>
          <div><dt className="font-medium text-ink">{t("Transport")}</dt><dd>{t("0.85 kg CO₂ per km plus 6 kg for handling on each diesel truck trip. The Analytics screen subtracts this from the savings.")}</dd></div>
          <p>{t("The factors are constants in the API and are listed here so every number can be checked. Replace them with the official factors for your region before real use.")}</p>
        </dl>
      </div>
      <PublicFooter />
    </div>
  );
}
