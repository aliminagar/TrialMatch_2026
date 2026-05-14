// TODO: Root layout — see PROJECT_PLAN.docx Section 11.
export const metadata = { title: "TrialMatch AI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
