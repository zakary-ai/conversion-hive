import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Conversion Lab" },
      { name: "description", content: "Get help with Conversion Lab. Contact our support team." },
      { property: "og:title", content: "Support — Conversion Lab" },
      { property: "og:description", content: "Get help with Conversion Lab. Contact our support team." },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
        <h1 className="mt-4 text-3xl font-display font-semibold tracking-tight">Support</h1>
        <p className="mt-2 text-sm text-muted-foreground">We're here to help.</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-lg font-semibold">Contact us</h2>
            <p>
              For any questions, issues, or feedback about Conversion Lab, email us at{" "}
              <a className="text-primary hover:underline" href="mailto:conversionlabb@gmail.com">
                conversionlabb@gmail.com
              </a>
              . We typically reply within 1–2 business days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Common topics</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account access and sign-in issues</li>
              <li>Managing leads, calls, and commissions</li>
              <li>Scheduling and Zoom integration</li>
              <li>Billing and subscription questions</li>
              <li>Deleting your account or data</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Policies</h2>
            <p>
              See our{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>{" "}
              and{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
