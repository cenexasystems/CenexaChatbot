import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – Cenexa Chatflow",
  description:
    "Privacy Policy for Cenexa Chatflow by Cenexa Systems. Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  const lastUpdated = "June 26, 2025";

  return (
    <main
      style={{
        fontFamily:
          "'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        minHeight: "100vh",
        color: "#e2e8f0",
        padding: "0",
        margin: "0",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* WhatsApp-style icon */}
        <div
          style={{
            width: "42px",
            height: "42px",
            background: "linear-gradient(135deg, #25D366, #128C7E)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 15px rgba(37,211,102,0.35)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#f1f5f9",
              letterSpacing: "-0.3px",
            }}
          >
            Cenexa Systems
          </div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>Cenexa Chatflow</div>
        </div>
      </header>

      {/* Hero */}
      <div
        style={{
          textAlign: "center",
          padding: "64px 24px 48px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "9999px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: "600",
            color: "#a5b4fc",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "20px",
          }}
        >
          <span>🔒</span> Privacy &amp; Data Policy
        </div>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: "800",
            background: "linear-gradient(135deg, #f1f5f9 0%, #a5b4fc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            margin: "0 0 16px",
            letterSpacing: "-1px",
            lineHeight: "1.1",
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "16px", margin: "0" }}>
          Last Updated: <strong style={{ color: "#cbd5e1" }}>{lastUpdated}</strong>
        </p>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: "780px",
          margin: "0 auto",
          padding: "0 24px 80px",
        }}
      >
        {/* Intro card */}
        <Section>
          <p style={bodyText}>
            Welcome to <strong style={{ color: "#a5b4fc" }}>Cenexa Chatflow</strong>{" "}
            (&quot;the Application&quot; or &quot;the App&quot;). This Privacy Policy describes how{" "}
            <strong style={{ color: "#f1f5f9" }}>Cenexa Systems</strong> (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;) collects, uses, shares, and protects information about
            you when you use our Cenexa Chatflow application and its associated dashboard.
          </p>
          <p style={bodyText}>
            By using the Application, you agree to the collection and use of information in accordance
            with this policy. This policy has been written to comply with Meta&apos;s Platform Terms,
            applicable data protection laws, and industry best practices.
          </p>
        </Section>

        <SectionTitle>1. About Cenexa Systems &amp; This Application</SectionTitle>
        <Section>
          <p style={bodyText}>
            <strong style={{ color: "#f1f5f9" }}>Cenexa Systems</strong> is a technology services
            business that builds and operates AI-powered automation tools.{" "}
            <strong style={{ color: "#a5b4fc" }}>Cenexa Chatflow</strong> is a business application
            that allows our clients to manage WhatsApp-based customer conversations through an
            AI-assisted dashboard. The App integrates with Meta&apos;s WhatsApp Business Platform API
            and uses Meta Login / Facebook Login to authenticate business operators.
          </p>
          <p style={bodyText}>
            This privacy policy applies to all users of the Application, including business operators
            who log in to manage conversations, and the end-customers who interact with the
            WhatsApp-powered AI agent.
          </p>
        </Section>

        <SectionTitle>2. Information We Collect</SectionTitle>
        <Section>
          <SubTitle>2.1 Information You Provide Directly</SubTitle>
          <ul style={listStyle}>
            <li>Business name, contact information, and account credentials upon registration</li>
            <li>
              Configuration data such as custom AI prompts, tags, and notes you add to conversations
            </li>
            <li>Messages you send through the dashboard to WhatsApp users</li>
            <li>Payment information (used only for verifying business subscriptions; stored securely)</li>
          </ul>

          <SubTitle>2.2 Information Collected from Meta Platform</SubTitle>
          <p style={bodyText}>
            When you connect your Meta / Facebook account or WhatsApp Business account to this App, we
            receive the following data from Meta&apos;s Platform APIs:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: "#e2e8f0" }}>WhatsApp messages:</strong> Content of messages
              exchanged between your business WhatsApp number and your customers via Cenexa Chatflow,
              including text, images, and documents, transmitted through Meta&apos;s WhatsApp Business Cloud API.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Sender information:</strong> WhatsApp phone numbers
              of customers who message your business.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Facebook / Meta user profile:</strong> Public
              profile information (name, email address, profile picture) if you use Facebook Login to
              authenticate as a dashboard operator.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>WhatsApp Business Account metadata:</strong>{" "}
              Business display name and phone number ID associated with your WhatsApp Business Account.
            </li>
          </ul>

          <SubTitle>2.3 Automatically Collected Information</SubTitle>
          <ul style={listStyle}>
            <li>Log data (IP address, browser type, pages visited, timestamps)</li>
            <li>Session cookies required for authentication and security</li>
            <li>Application usage data (features accessed, conversation volumes)</li>
          </ul>
        </Section>

        <SectionTitle>3. How We Use Your Information</SectionTitle>
        <Section>
          <p style={bodyText}>
            We use the information collected for the following purposes only:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: "#e2e8f0" }}>To provide the Service:</strong> Displaying
              WhatsApp conversations in the Cenexa Chatflow dashboard, enabling AI-assisted responses,
              and managing business-customer communication.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Authentication &amp; Security:</strong> Verifying
              the identity of dashboard operators and protecting accounts from unauthorised access.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>AI Agent Processing:</strong> Feeding conversation
              context to the AI model so it can generate relevant, context-aware automated responses on
              behalf of your business.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Customer Support &amp; Billing:</strong> Managing
              your business subscription, verifying payments, and responding to support requests.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Compliance &amp; Legal Obligations:</strong>{" "}
              Retaining records as required by applicable law.
            </li>
          </ul>
          <p style={bodyText}>
            <strong style={{ color: "#fbbf24" }}>We do not</strong> sell, rent, trade, or otherwise
            transfer Platform Data obtained from Meta to any third parties for advertising, profiling,
            or any purpose not described in this policy.
          </p>
        </Section>

        <SectionTitle>4. Meta Platform Data – Specific Disclosures</SectionTitle>
        <Section>
          <p style={bodyText}>
            In accordance with Meta&apos;s Platform Terms (Section 4 – Privacy Policy), we make the
            following specific disclosures regarding Platform Data received from Meta:
          </p>
          <ul style={listStyle}>
            <li>
              Platform Data is used <em>solely</em> to operate and improve Cenexa Chatflow
              for the business operator whose account the data belongs to.
            </li>
            <li>
              Platform Data is <strong style={{ color: "#e2e8f0" }}>not</strong> used to discriminate
              against users, make eligibility determinations, conduct surveillance, or build marketing
              profiles.
            </li>
            <li>
              Platform Data is <strong style={{ color: "#e2e8f0" }}>not</strong> shared with
              third-party advertisers.
            </li>
            <li>
              Platform Data is stored in secure cloud databases (Supabase / PostgreSQL) with
              encryption at rest and in transit.
            </li>
            <li>
              We retain Platform Data only for as long as is necessary to provide the Service, or as
              required by law. Upon account termination, data is deleted within 30 days.
            </li>
          </ul>
        </Section>

        <SectionTitle>5. Data Sharing &amp; Disclosure</SectionTitle>
        <Section>
          <p style={bodyText}>
            We do not sell your personal data. We may share information only in the following limited
            circumstances:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Service Providers:</strong> We use trusted
              third-party service providers (e.g., Supabase for database hosting, OpenAI / Google
              AI for AI processing, Vercel for hosting) solely to operate the Application. These
              providers are contractually obligated to handle data securely and only for the purposes
              we specify.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Legal Requirements:</strong> We may disclose
              information if required by law, court order, or governmental authority.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Protection of Rights:</strong> We may disclose
              information to protect the rights, property, or safety of Cenexa Systems, our users, or
              the public.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Business Transfer:</strong> In the event of a
              merger, acquisition, or sale of assets, user data may be transferred. We will notify you
              of any such change.
            </li>
          </ul>
        </Section>

        <SectionTitle>6. Data Security</SectionTitle>
        <Section>
          <p style={bodyText}>
            We implement industry-standard administrative, physical, and technical safeguards to
            protect your information, including:
          </p>
          <ul style={listStyle}>
            <li>TLS/HTTPS encryption for all data in transit</li>
            <li>Encryption at rest for stored data</li>
            <li>Role-based access controls limiting who can access data</li>
            <li>Regular security reviews and vulnerability assessments</li>
            <li>Secure session management with short-lived tokens</li>
          </ul>
          <p style={bodyText}>
            If you discover a security vulnerability, please report it immediately to{" "}
            <a href="mailto:cenexasystems@gmail.com" style={linkStyle}>
              cenexasystems@gmail.com
            </a>
            . We will promptly investigate and address any reported issues.
          </p>
        </Section>

        <SectionTitle>7. Your Rights &amp; Data Deletion</SectionTitle>
        <Section>
          <p style={bodyText}>
            You have the following rights regarding your personal data:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Access:</strong> Request a copy of the personal
              data we hold about you.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Correction:</strong> Request correction of
              inaccurate or incomplete data.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Deletion:</strong> Request deletion of your
              personal data and all Platform Data associated with your account. We will fulfil
              deletion requests within 30 days.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Portability:</strong> Request a machine-readable
              export of your data.
            </li>
            <li>
              <strong style={{ color: "#e2e8f0" }}>Objection:</strong> Object to certain types of
              data processing.
            </li>
          </ul>
          <p style={bodyText}>
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:cenexasystems@gmail.com" style={linkStyle}>
              cenexasystems@gmail.com
            </a>
            . Requests from Facebook users regarding Platform Data can also be submitted through
            Meta&apos;s data deletion request flow, which we honour within the required timeframe.
          </p>
        </Section>

        <SectionTitle>8. Cookies &amp; Tracking</SectionTitle>
        <Section>
          <p style={bodyText}>
            We use strictly necessary session cookies to keep you logged in to the dashboard. We do
            not use advertising cookies, cross-site tracking, or third-party analytics cookies. You can
            control cookies through your browser settings; however, disabling necessary cookies will
            prevent you from logging in to the dashboard.
          </p>
        </Section>

        <SectionTitle>9. Children&apos;s Privacy</SectionTitle>
        <Section>
          <p style={bodyText}>
            This Application is intended for use by business operators and is not directed at children
            under 13 years of age. We do not knowingly collect personal information from children. If
            we become aware that we have inadvertently collected information from a child under 13, we
            will delete it promptly.
          </p>
        </Section>

        <SectionTitle>10. International Data Transfers</SectionTitle>
        <Section>
          <p style={bodyText}>
            Your information may be transferred to and processed in countries other than your own. We
            ensure that any such transfers comply with applicable data protection laws, including
            through the use of appropriate safeguards such as standard contractual clauses where
            required.
          </p>
        </Section>

        <SectionTitle>11. Changes to This Policy</SectionTitle>
        <Section>
          <p style={bodyText}>
            We may update this Privacy Policy from time to time. We will notify registered users of
            material changes via email or a notice within the dashboard. The &quot;Last Updated&quot;
            date at the top of this page reflects the most recent revision. Continued use of the
            Application after changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <SectionTitle>12. Contact Us</SectionTitle>
        <Section>
          <p style={bodyText}>
            If you have any questions, concerns, or requests regarding this Privacy Policy or how we
            handle your data, please contact us:
          </p>
          <div
            style={{
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: "12px",
              padding: "24px 28px",
              marginTop: "12px",
            }}
          >
            <p style={{ margin: "0 0 8px", color: "#f1f5f9", fontWeight: "700", fontSize: "16px" }}>
              Cenexa Systems
            </p>
            <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: "14px" }}>
              📧{" "}
              <a href="mailto:cenexasystems@gmail.com" style={linkStyle}>
                cenexasystems@gmail.com
              </a>
            </p>
            <p style={{ margin: "0", color: "#94a3b8", fontSize: "14px" }}>
              🌐{" "}
              <a href="https://cenexasystems.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                cenexasystems.com
              </a>
            </p>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "24px",
          textAlign: "center",
          color: "#475569",
          fontSize: "13px",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        © {new Date().getFullYear()} Cenexa Systems. All rights reserved.{" "}
        <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span> This privacy policy is publicly
        accessible without authentication.
      </footer>
    </main>
  );
}

/* ── Small helper components ───────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "19px",
        fontWeight: "700",
        color: "#a5b4fc",
        margin: "40px 0 0",
        padding: "0 0 10px",
        borderBottom: "1px solid rgba(99,102,241,0.2)",
        letterSpacing: "-0.2px",
      }}
    >
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "15px",
        fontWeight: "600",
        color: "#cbd5e1",
        margin: "20px 0 8px",
      }}
    >
      {children}
    </h3>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "14px",
        padding: "24px 28px",
        marginTop: "12px",
      }}
    >
      {children}
    </div>
  );
}

const bodyText: React.CSSProperties = {
  color: "#94a3b8",
  lineHeight: "1.75",
  fontSize: "15px",
  margin: "0 0 14px",
};

const listStyle: React.CSSProperties = {
  color: "#94a3b8",
  lineHeight: "1.8",
  fontSize: "15px",
  paddingLeft: "22px",
  margin: "8px 0 14px",
};

const linkStyle: React.CSSProperties = {
  color: "#818cf8",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
