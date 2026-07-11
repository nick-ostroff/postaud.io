import { Card } from "./Card";

/** Matches `.card.stat` (`.s-n`/`.s-l`) in postaudio-mockups.css. */
export function StatTile({ n, label }: { n: string; label: string }) {
  return (
    <Card className="px-[18px] py-4">
      <div className="serif text-[30px] leading-[1.1]">{n}</div>
      <div className="mt-[3px] text-xs text-muted">{label}</div>
    </Card>
  );
}
