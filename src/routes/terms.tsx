import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Conversion Lab" },
      { name: "description", content: "Terms of use for the Conversion Lab platform." },
      { property: "og:title", content: "Terms of Use — Conversion Lab" },
      { property: "og:description", content: "Terms of use for the Conversion Lab platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Link to="/" className="text-sm text-primary hover:underline">← Back</Link>
        <h1 className="mt-4 text-3xl font-display font-semibold tracking-tight">Terms of Use</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: June 13, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-lg font-semibold">1. Acceptance</h2>
            <p>By creating an account or using Conversion Lab, you agree to these Terms. If you do not agree, do not use the service.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">2. Accounts</h2>
            <p>You are responsible for safeguarding your credentials and for activity under your account. Accounts are invitation-based and intended for use by your organization's authorized team members.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">3. Acceptable use</h2>
            <p>Do not use the service to violate any law, infringe rights, send unsolicited bulk communications, attempt to bypass security, or interfere with other customers.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">4. Content</h2>
            <p>You retain ownership of the CRM data you enter. You grant us a limited license to host, process, and display it solely to operate the service for you.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">5. Termination</h2>
            <p>You may delete your account at any time from <strong>Profile → Delete account</strong>. We may suspend accounts that violate these Terms.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold">6. Disclaimer</h2>
            <p>The service is provided "as is" without warranties of any kind. We are not liable for indirect or consequential damages to the extent permitted by law.</p>
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
