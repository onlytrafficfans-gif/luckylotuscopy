export const LEGAL_EFFECTIVE_DATE = "September 11, 2026";
export const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms of Service",
    sections: [
      [
        "Agreement",
        "These Terms govern your access to and use of Lucky Lotus, including its app-building, collaboration, deployment, and AI-routing services. By creating an account or using the service, you agree to these Terms and the Privacy Policy.",
      ],
      [
        "Eligibility and accounts",
        "You must be legally able to enter this agreement and provide accurate account information. You are responsible for activity under your account, securing your credentials, and promptly reporting suspected unauthorized access.",
      ],
      [
        "Your content and projects",
        "You retain ownership of content and code you submit or create. You grant Lucky Lotus a limited license to host, process, transmit, and display that material only as needed to operate, secure, and improve the service. You represent that you have the rights needed for anything you submit.",
      ],
      [
        "AI services and BYOK",
        "Lucky Lotus may send prompts, project context, and requested files to AI providers you connect. Provider terms and charges apply directly to your accounts. AI output may be inaccurate, insecure, or unsuitable; you must review and test output before deployment or reliance. Model availability and routing may change.",
      ],
      [
        "Acceptable use",
        "You may not use Lucky Lotus to violate law, infringe rights, distribute malware, bypass security controls, interfere with the service, or facilitate abuse. The Acceptable Use Policy is part of these Terms.",
      ],
      [
        "Service changes and availability",
        "We may modify features, model mappings, limits, or availability to maintain security and quality. We do not guarantee uninterrupted operation or that a particular third-party model or provider will remain available.",
      ],
      [
        "Fees and third parties",
        "Lucky Lotus billing, if introduced, will be disclosed separately before a charge. You remain responsible for fees charged by connected AI, hosting, database, source-control, or app-store providers.",
      ],
      [
        "Termination",
        "You may stop using the service at any time. We may restrict or terminate access for material breach, security risk, unlawful conduct, or harm to the service or others. Rights that by nature should survive termination will survive.",
      ],
      [
        "Disclaimers and liability",
        "The service is provided as available. To the extent permitted by law, Lucky Lotus disclaims implied warranties and is not liable for indirect, incidental, special, consequential, or lost-profit damages. Our aggregate liability will not exceed the amount you paid Lucky Lotus in the twelve months before the claim. Some jurisdictions do not allow every limitation.",
      ],
      [
        "Disputes and contact",
        "Applicable law and dispute venue depend on the operator location shown in your service communications and mandatory consumer law. Before filing a claim, contact us at support@luckylotus.app so we can try to resolve it.",
      ],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      [
        "What we collect",
        "We collect account details, authentication records, project content, messages, configuration choices, collaboration records, deployment metadata, security events, and AI usage measurements. We receive only the credentials you intentionally connect.",
      ],
      [
        "API keys and secrets",
        "Connected API keys are encrypted at rest and used only by server-side systems to make the provider requests you initiate. Saved keys are not returned to the browser, included in analytics, or intentionally written to application logs. You can replace or remove a key in Settings.",
      ],
      [
        "How we use data",
        "We use data to provide and secure the service, authenticate users, save projects, execute requested builds, route AI requests, measure actual usage, troubleshoot failures, prevent abuse, and comply with law. We do not sell personal information.",
      ],
      [
        "AI providers and subprocessors",
        "When you request AI work, relevant prompts, project context, and files are transmitted to the connected provider, such as Anthropic or OpenRouter. Their processing is governed by their terms and privacy policies. Hosting, database, analytics, source-control, and deployment providers process data as needed to deliver connected features.",
      ],
      [
        "Usage and capacity",
        "Lotus stores normalized token counts, model and provider identifiers, latency, routing outcomes, validation results, and provider-supplied request cost when available. Lotus does not fabricate provider balances. Usage records do not contain saved API keys.",
      ],
      [
        "Retention and deletion",
        "We retain account and project data while your account is active and as needed for security, legal compliance, backups, and dispute resolution. Removing a provider deletes its stored credential. You may request account deletion by contacting support@luckylotus.app.",
      ],
      [
        "Security",
        "We use access controls, encryption in transit, encrypted secret storage, scoped authorization, and rate limits. No system is perfectly secure; protect your account password and provider credentials.",
      ],
      [
        "Your choices and rights",
        "Depending on your location, you may have rights to access, correct, delete, restrict, or export personal data and to appeal a privacy decision. Contact support@luckylotus.app. We will verify requests before acting.",
      ],
      [
        "Children",
        "Lucky Lotus is not directed to children under 13, or the higher minimum age required in their jurisdiction, and we do not knowingly collect their personal information.",
      ],
      [
        "International processing and changes",
        "Data may be processed where our service providers operate, subject to applicable safeguards. We may update this policy and will post the effective date and provide additional notice when required.",
      ],
    ],
  },
  cookies: {
    title: "Cookie Policy",
    sections: [
      [
        "How Lucky Lotus uses browser storage",
        "Lucky Lotus uses essential cookies for secure authentication, session continuity, abuse prevention, and user preferences. These are required for the signed-in service to function.",
      ],
      [
        "Analytics",
        "Production pages may use privacy-conscious product analytics to understand page and feature usage. Analytics must not receive API keys, passwords, project secrets, or credential fields. The analytics provider may use browser storage according to its published documentation and your browser settings.",
      ],
      [
        "No key storage in the browser",
        "Provider API keys are never stored in localStorage or other client-readable persistent storage. After submission, the browser receives only masked connection status.",
      ],
      [
        "Controls",
        "You can block or delete cookies in your browser, but blocking essential cookies will prevent sign-in and authenticated features. Where consent is legally required for non-essential storage, Lucky Lotus will request it before use.",
      ],
    ],
  },
  acceptable: {
    title: "Acceptable Use Policy",
    sections: [
      [
        "Safe and lawful use",
        "Use Lucky Lotus only for lawful projects and content you are authorized to process. Respect intellectual property, privacy, publicity, contractual, and platform rights.",
      ],
      [
        "Prohibited conduct",
        "Do not create or distribute malware, credential theft, phishing, unlawful surveillance, exploitation, harassment, non-consensual intimate content, child sexual abuse material, or instructions intended to facilitate serious wrongdoing.",
      ],
      [
        "Platform integrity",
        "Do not probe or bypass access controls, overwhelm provider or Lotus infrastructure, scrape private data, conceal abusive automation, resell unauthorized access, or use compromised credentials. Security research requires prior written authorization.",
      ],
      [
        "Enforcement",
        "We may block a request, limit features, preserve evidence, or suspend an account when reasonably necessary to protect users, providers, the public, or the service. We may report conduct when legally required.",
      ],
    ],
  },
  ai: {
    title: "AI & BYOK Data Notice",
    sections: [
      [
        "Your provider accounts",
        "BYOK means AI requests use provider credentials you supply. Provider usage limits, retention settings, pricing, and terms remain controlled by your provider account. Lucky Lotus does not create provider credit or promise that a model is available to your account.",
      ],
      [
        "Intelligent routing",
        "Auto mode deterministically classifies task complexity and selects the least expensive connected model expected to complete the task reliably. High-risk architecture, authentication, migration, security, and destructive operations cannot be silently weakened by Save Tokens.",
      ],
      [
        "Fallback and escalation",
        "Lotus may escalate to a stronger model after failures or validation problems and may use a same-quality fallback during provider disruption. A material quality downgrade for a complex task requires notice. Model display names are stable Lotus aliases; underlying provider model IDs can change.",
      ],
      [
        "Data sent per request",
        "A request may include your instruction, relevant project specification, and selected project files. Lotus redacts recognized secrets before model submission, but you should not place credentials in prompts or source files.",
      ],
      [
        "Usage records",
        "Lotus records actual token counts returned by providers, routing outcomes, and provider-supplied cost when available. Capacity values derived from credits or prices are clearly labeled estimates. AI output requires human review before production use.",
      ],
    ],
  },
} as const;
export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;
