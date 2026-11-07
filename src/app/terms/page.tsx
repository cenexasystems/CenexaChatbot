import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – Cenexa Chatflow",
  description:
    "Terms of Service for Cenexa Chatflow by Cenexa Systems. Read our terms and conditions for using the application.",
};

export default function TermsPage() {
  const lastUpdated = "June 26, 2025";

  return (
    <main
      style={{
        fontFamily:
          "'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "linear-gradient(135deg, #EFF7FC 0%, #FFFFFF 50%, #EFF7FC 100%)",
        minHeight: "100vh",
        color: "#17263B",
        padding: "0",
        margin: "0",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "rgba(255,255,255,0.92)",
          borderBottom: "1px solid #D7E4F0",
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            width: "42px",
            height: "42px",
            background: "linear-gradient(135deg, #0B3B8C, #078BCB)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 15px rgba(7,139,203,0.2)",
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
              color: "#17263B",
              letterSpacing: "-0.3px",
            }}
          >
            Cenexa Systems
          </div>
          <div style={{ fontSize: "13px", color: "#64748B" }}>Cenexa Chatflow</div>
        </div>
      </header>

      {/* Hero */}
      <div
        style={{
          textAlign: "center",
          padding: "64px 24px 48px",
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
            color: "#087DBB",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "20px",
          }}
        >
          <span>📄</span> Legal Agreement
        </div>
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: "800",
            background: "linear-gradient(135deg, #17263B 0%, #087DBB 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            margin: "0 0 16px",
            letterSpacing: "-1px",
            lineHeight: "1.1",
          }}
        >
          Terms of Service
        </h1>
        <p style={{ color: "#64748B", fontSize: "16px", margin: "0" }}>
          Last Updated: <strong style={{ color: "#475569" }}>{lastUpdated}</strong>
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
        {/* Intro */}
        <Section>
          <p style={bodyText}>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of{" "}
            <strong style={{ color: "#087DBB" }}>Cenexa Chatflow</strong>, a WhatsApp AI Agent
            application developed and operated by{" "}
            <strong style={{ color: "#17263B" }}>Cenexa Systems</strong> (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;). By accessing or using Cenexa Chatflow, you agree to
            be bound by these Terms. If you do not agree, please do not use the Application.
          </p>
        </Section>

        <SectionTitle>1. About Cenexa Chatflow</SectionTitle>
        <Section>
          <p style={bodyText}>
            Cenexa Chatflow is a business dashboard application that enables organisations to manage
            customer conversations via WhatsApp using AI-assisted automation. The Application
            integrates with Meta&apos;s WhatsApp Business Platform API and is intended for use by
            registered business operators (&quot;Users&quot;).
          </p>
          <p style={bodyText}>
            Cenexa Systems reserves the right to modify, suspend, or discontinue the Application at
            any time with reasonable notice.
          </p>
        </Section>

        <SectionTitle>2. Eligibility &amp; Account Registration</SectionTitle>
        <Section>
          <ul style={listStyle}>
            <li>
              You must be at least 18 years old and have the legal authority to enter into these Terms
              on behalf of yourself or your business.
            </li>
            <li>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activity that occurs under your account.
            </li>
            <li>
              You must provide accurate, current, and complete information during registration and keep
              it updated.
            </li>
            <li>
              You may not share your account access with unauthorised parties or use another
              User&apos;s account without permission.
            </li>
          </ul>
        </Section>

        <SectionTitle>3. Acceptable Use</SectionTitle>
        <Section>
          <p style={bodyText}>
            By using Cenexa Chatflow, you agree that you will <strong style={{ color: "#0B5BD3" }}>not</strong>:
          </p>
          <ul style={listStyle}>
            <li>Use the Application for any unlawful, fraudulent, or abusive purpose</li>
            <li>
              Send spam, unsolicited commercial messages, or bulk messages that violate
              Meta&apos;s WhatsApp Business Policy
            </li>
            <li>
              Use the Application to harass, threaten, or harm any individual or group
            </li>
            <li>
              Attempt to reverse-engineer, hack, or circumvent any security measures of the
              Application
            </li>
            <li>
              Use the Application to transmit malware, viruses, or any other malicious code
            </li>
            <li>
              Violate any applicable local, national, or international law or regulation
            </li>
            <li>
              Misrepresent your identity or your business when using the Application
            </li>
            <li>
              Use the Application in any way that could damage, overburden, or impair our servers or
              networks
            </li>
          </ul>
          <p style={bodyText}>
            Violation of these terms may result in immediate suspension or termination of your account
            without notice.
          </p>
        </Section>

        <SectionTitle>4. WhatsApp &amp; Meta Platform Compliance</SectionTitle>
        <Section>
          <p style={bodyText}>
            Your use of Cenexa Chatflow is subject to and must comply with:
          </p>
          <ul style={listStyle}>
            <li>
              <a
                href="https://www.whatsapp.com/legal/business-policy/"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                WhatsApp Business Policy
              </a>
            </li>
            <li>
              <a
                href="https://developers.facebook.com/terms/"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                Meta Platform Terms
              </a>
            </li>
            <li>Meta&apos;s Commerce Policies and any other applicable Meta policies</li>
          </ul>
          <p style={bodyText}>
            You are solely responsible for ensuring that all messages sent through Cenexa Chatflow
            comply with these policies. Cenexa Systems shall not be liable for any penalties,
            suspensions, or bans applied to your WhatsApp Business Account due to policy violations.
          </p>
        </Section>

        <SectionTitle>5. Subscription &amp; Payment</SectionTitle>
        <Section>
          <p style={bodyText}>
            Access to Cenexa Chatflow may require a paid subscription. By subscribing:
          </p>
          <ul style={listStyle}>
            <li>
              You authorise Cenexa Systems to charge the applicable fees for your chosen plan on the
              agreed billing cycle.
            </li>
            <li>
              All fees are non-refundable except where required by applicable law or as expressly
              stated in a separate agreement.
            </li>
            <li>
              We reserve the right to modify pricing with at least 14 days&apos; prior notice to
              active subscribers.
            </li>
            <li>
              Failure to pay may result in suspension of your account until payment is received.
            </li>
          </ul>
        </Section>

        <SectionTitle>6. Intellectual Property</SectionTitle>
        <Section>
          <p style={bodyText}>
            All content, features, design, code, and materials within Cenexa Chatflow — including but
            not limited to the dashboard interface, AI workflows, and branding — are the exclusive
            property of Cenexa Systems and are protected by applicable intellectual property laws.
          </p>
          <p style={bodyText}>
            You are granted a limited, non-exclusive, non-transferable licence to use the Application
            solely for your internal business purposes. You may not copy, reproduce, distribute,
            create derivative works from, or exploit any part of the Application without our prior
            written consent.
          </p>
          <p style={bodyText}>
            You retain ownership of all content and data you upload or generate through the
            Application. By using the Application, you grant Cenexa Systems a limited licence to
            process and display your content solely to provide the Service.
          </p>
        </Section>

        <SectionTitle>7. Data &amp; Privacy</SectionTitle>
        <Section>
          <p style={bodyText}>
            Your use of Cenexa Chatflow is also governed by our{" "}
            <a href="/privacy" style={linkStyle}>
              Privacy Policy
            </a>
            , which is incorporated into these Terms by reference. By using the Application, you
            consent to the collection and use of your data as described in the Privacy Policy.
          </p>
          <p style={bodyText}>
            You are responsible for ensuring that your use of the Application and any data you process
            through it complies with all applicable data protection laws, including but not limited to
            the General Data Protection Regulation (GDPR) and the Information Technology Act
            (India), as applicable.
          </p>
        </Section>

        <SectionTitle>8. Disclaimers &amp; Limitation of Liability</SectionTitle>
        <Section>
          <p style={bodyText}>
            <strong style={{ color: "#0B5BD3" }}>Disclaimer of Warranties.</strong> The Application is
            provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
            either express or implied, including but not limited to warranties of merchantability,
            fitness for a particular purpose, or non-infringement. We do not warrant that the
            Application will be uninterrupted, error-free, or free of harmful components.
          </p>
          <p style={bodyText}>
            <strong style={{ color: "#0B5BD3" }}>AI-Generated Responses.</strong> Cenexa Chatflow
            uses artificial intelligence to generate automated responses. These responses are
            generated automatically and may not always be accurate, appropriate, or complete. You are
            responsible for reviewing and supervising AI-generated messages sent to your customers.
            Cenexa Systems is not liable for any errors, omissions, or harm arising from AI-generated
            content.
          </p>
          <p style={bodyText}>
            <strong style={{ color: "#0B5BD3" }}>Limitation of Liability.</strong> To the maximum
            extent permitted by applicable law, Cenexa Systems shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits, revenue,
            data, or goodwill arising out of or in connection with your use of the Application, even
            if we have been advised of the possibility of such damages. Our total aggregate liability
            to you shall not exceed the amount you paid to us in the 3 months preceding the claim.
          </p>
        </Section>

        <SectionTitle>9. Indemnification</SectionTitle>
        <Section>
          <p style={bodyText}>
            You agree to indemnify, defend, and hold harmless Cenexa Systems, its officers,
            directors, employees, and agents from and against any claims, liabilities, damages,
            losses, and expenses (including reasonable legal fees) arising out of or in any way
            connected with:
          </p>
          <ul style={listStyle}>
            <li>Your use of the Application or violation of these Terms</li>
            <li>Your violation of any third-party rights, including Meta&apos;s platform policies</li>
            <li>Any content you transmit through the Application</li>
            <li>Your violation of any applicable law or regulation</li>
          </ul>
        </Section>

        <SectionTitle>10. Termination</SectionTitle>
        <Section>
          <p style={bodyText}>
            We reserve the right to suspend or terminate your access to Cenexa Chatflow at any time,
            with or without cause, with or without notice, including if we believe you have violated
            these Terms or any applicable law or third-party policy.
          </p>
          <p style={bodyText}>
            You may terminate your account at any time by contacting us at{" "}
            <a href="mailto:cenexasystems@gmail.com" style={linkStyle}>
              cenexasystems@gmail.com
            </a>
            . Upon termination, your right to use the Application will immediately cease, and we will
            handle your data in accordance with our Privacy Policy.
          </p>
        </Section>

        <SectionTitle>11. Changes to These Terms</SectionTitle>
        <Section>
          <p style={bodyText}>
            We may update these Terms from time to time. We will notify registered Users of material
            changes via email or a notice within the dashboard at least 7 days before the changes take
            effect. Your continued use of the Application after the effective date of the revised
            Terms constitutes your acceptance of the changes.
          </p>
        </Section>

        <SectionTitle>12. Governing Law</SectionTitle>
        <Section>
          <p style={bodyText}>
            These Terms shall be governed by and construed in accordance with the laws of India.
            Any disputes arising out of or in connection with these Terms shall be subject to the
            exclusive jurisdiction of the courts located in India.
          </p>
        </Section>

        <SectionTitle>13. Contact Us</SectionTitle>
        <Section>
          <p style={bodyText}>
            If you have any questions about these Terms of Service, please contact us:
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
            <p style={{ margin: "0 0 8px", color: "#17263B", fontWeight: "700", fontSize: "16px" }}>
              Cenexa Systems
            </p>
            <p style={{ margin: "0 0 6px", color: "#64748B", fontSize: "14px" }}>
              📧{" "}
              <a href="mailto:support@cenexasystems.com" style={linkStyle}>
                support@cenexasystems.com
              </a>
            </p>
            <p style={{ margin: "0 0 6px", color: "#64748B", fontSize: "14px" }}>
              🌐{" "}
              <a href="https://cenexasystems.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                cenexasystems.com
              </a>
            </p>
            <p style={{ margin: "0", color: "#64748B", fontSize: "14px" }}>
              📋{" "}
              <a href="/privacy" style={linkStyle}>
                View our Privacy Policy
              </a>
            </p>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #D7E4F0",
          padding: "24px",
          textAlign: "center",
          color: "#475569",
          fontSize: "13px",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        © {new Date().getFullYear()} Cenexa Systems. All rights reserved.{" "}
        <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
        <a href="/privacy" style={{ ...linkStyle, fontSize: "13px" }}>
          Privacy Policy
        </a>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
        This page is publicly accessible without authentication.
      </footer>
    </main>
  );
}

/* ── Helper components ─────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "19px",
        fontWeight: "700",
        color: "#087DBB",
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

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#F2F7FC",
        border: "1px solid #D7E4F0",
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
  color: "#64748B",
  lineHeight: "1.75",
  fontSize: "15px",
  margin: "0 0 14px",
};

const listStyle: React.CSSProperties = {
  color: "#64748B",
  lineHeight: "1.8",
  fontSize: "15px",
  paddingLeft: "22px",
  margin: "8px 0 14px",
};

const linkStyle: React.CSSProperties = {
  color: "#078BCB",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
