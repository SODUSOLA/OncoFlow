import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui/Card";

// Same precedent as apps/web's wallet top-up screen — a real placeholder that looks intentional
// rather than a broken/empty page, until there's actual content or data behind the nav item.
export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="max-w-sm text-sm text-gray-400">{description}</p>
    </Card>
  );
}
