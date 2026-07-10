import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LifeBuoy } from "lucide-react";

export function SupportButton({ className }: { className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link to="/app/support">
        <LifeBuoy className="h-4 w-4 mr-1.5" />
        Support
      </Link>
    </Button>
  );
}
