import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { isPushPending, type VaultLink } from "@/db/queries/vault";
import { formatShortDate } from "@/lib/time";
import { VaultActions } from "./VaultActions";

/**
 * The series page's "Vault" card — the user-facing half of Obsidian sync.
 * PostAud.io is a cloud server and cannot write into a user's local vault
 * folder, so pressing Send only stamps `push_requested_at` here; the
 * Obsidian plugin is what actually writes files, the next time it's open.
 * The copy below is deliberately careful never to imply the files were just
 * written — only ever "queued" / "will arrive".
 *
 * Three states, driven entirely by `link` (from `getVaultLink`, Task 8):
 *  - `null`            → not linked yet, no Send button.
 *  - linked, idle       → label + last-sent + the Send button.
 *  - linked, `isPushPending(link)` → Send button replaced by queued status.
 * Only the Send/Unlink buttons need interactivity, so those live in the
 * small "use client" child (`VaultActions`) — this component itself stays a
 * server component, matching how `ExportCard` splits off the series page.
 */
export function VaultCard({ seriesId, link }: { seriesId: string; link: VaultLink | null }) {
  if (!link) {
    return (
      <Card className="px-[22px] py-5">
        <h3>Obsidian vault</h3>
        <p className="mt-1 text-[13px] text-muted">
          Connect this story to your vault to keep a Markdown copy in your notes.
        </p>
        <div className="mt-2">
          <Link href="/app/settings/tokens" className="text-[13px] font-medium">
            Set up the Obsidian plugin →
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="px-[22px] py-5">
      <h3>Obsidian vault</h3>
      <p className="mt-1 text-[13px] text-muted">Linked to {link.label}.</p>
      <p className="mt-0.5 text-[12.5px] text-faint">
        {/* `last_acked_at` is stamped by the untrusted plugin after it writes
            files locally, not by the server sending anything — "synced",
            not "sent". */}
        {link.last_acked_at ? `Last synced ${formatShortDate(link.last_acked_at)}` : "Never synced"}
      </p>
      <VaultActions seriesId={seriesId} pending={isPushPending(link)} />
    </Card>
  );
}
