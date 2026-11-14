// JSON-LD for search engines and AI answer engines. Everything here mirrors text that is already on the site.
export const DESCRIPTION = "Qorvena is an appointment management web app. Save your appointments, get an email confirmation when you book, and receive an email reminder before they start.";

const TEAM = [
  ["Vinzon, Reven P.", "Project Leader"],
  ["Jabeguero Jude Simon D.", "Team Member"],
  ["Moreño Jorie F. Jr.", "Team Member"],
  ["Medina John Federick J.", "Team Member"],
  ["Caraan Rovic A.", "Team Member"]
];

export function structuredData(url) {
  const abs = (p) => (url ? `${url}${p}` : undefined);
  const home = url ? `${url}/` : undefined;
  const clean = (o) => JSON.parse(JSON.stringify(o)); // drops fields that are undefined (no site address known)
  return clean({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": url ? `${url}/#website` : "#website",
        name: "Qorvena",
        alternateName: "QORVENA",
        url: home,
        description: DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": url ? `${url}/#organization` : "#organization" }
      },
      {
        "@type": "Organization",
        "@id": url ? `${url}/#organization` : "#organization",
        name: "Qorvena",
        url: home,
        logo: { "@type": "ImageObject", url: abs("/icon-512.png"), width: 512, height: 512 },
        image: abs("/og-image.png"),
        description: "Qorvena is an original coined name inspired by the Latin word Vena, meaning vein. It connects appointment requests, scheduling processes and automated notifications in one centralized platform.",
        member: TEAM.map(([name, jobTitle]) => ({ "@type": "Person", name, jobTitle }))
      },
      {
        "@type": "WebApplication",
        "@id": url ? `${url}/#app` : "#app",
        name: "Qorvena",
        url: home,
        description: DESCRIPTION,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Appointment management",
        operatingSystem: "Any (web browser on desktop or mobile)",
        browserRequirements: "Requires JavaScript",
        inLanguage: "en",
        image: abs("/og-image.png"),
        featureList: [
          "Save appointments with a date and a time",
          "Email confirmation as soon as an appointment is booked",
          "Email reminder before an appointment starts",
          "Choose how long before the appointment to be reminded",
          "Calendar file included with appointment emails",
          "Private list of appointments for every account",
          "Password reset by email code",
          "Light and dark mode on mobile and desktop"
        ],
        creator: { "@id": url ? `${url}/#organization` : "#organization" },
        isPartOf: { "@id": url ? `${url}/#website` : "#website" }
      }
    ]
  });
}
