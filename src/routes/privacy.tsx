import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Conversion Lab" },
      { name: "description", content: "How Conversion Lab collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — Conversion Lab" },
      { property: "og:description", content: "How Conversion Lab collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
        <h1 className="mt-4 text-3xl font-display font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: June 13, 2026</p>

        <div className="prose prose-invert mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-lg font-semibold">1. Overview</h2>
            <p>Conversion Lab ("we", "us") provides a sales training and lead-management platform. This policy explains what data we collect and how we use it.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">2. Information we collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> name, email, time zone, role.</li>
              <li><strong>CRM data you create:</strong> leads, call notes, outcomes, commissions, scheduled appointments.</li>
              <li><strong>Operational data:</strong> sign-in timestamps, basic usage logs.</li>
            </ul>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">3. How we use it</h2>
            <p>Solely to operate the service: authenticate you, run the dashboard, schedule calls, send booking confirmations, and provide your team with their pipeline. We do not sell your data and do not use it for advertising.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">4. Sharing</h2>
            <p>Data is shared only with the infrastructure providers we use to run the service (hosting, database, email delivery, Zoom for video calls). Each is bound by their own privacy and security commitments.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">5. Your rights</h2>
            <p>You can update your profile at any time and permanently delete your account from <strong>Profile → Delete account</strong>. Deletion removes your authentication record and personal profile; CRM records owned by your organization may be retained per your admin's policy.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">6. Security</h2>
            <p>Connections are TLS-encrypted. Database access is governed by row-level security policies so users only see data they are entitled to.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">7. Contact</h2>
            <p>Questions? Email <a className="text-primary hover:underline" href="mailto:support@conversionlab.company">support@conversionlab.company</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
