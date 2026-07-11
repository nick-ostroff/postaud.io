import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function DashboardHome() {
  return (
    <div>
      <div className="mb-[22px] flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px]">Home</h1>
          <div className="mt-[3px] text-[13.5px] text-muted">
            Your workspace — one place for every story.
          </div>
        </div>
        <Button variant="primary">＋ New series</Button>
      </div>

      <Card className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <div className="serif text-xl">No series yet — create your first</div>
        <p className="max-w-sm text-[13.5px] text-muted">
          A series is one person&apos;s story. Set it up once and Anna runs the interviews from here.
        </p>
        <Button variant="primary" size="big" className="mt-2">
          ＋ New series
        </Button>
      </Card>
    </div>
  );
}
