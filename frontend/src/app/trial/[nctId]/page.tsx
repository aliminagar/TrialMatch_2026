// TODO: Trial detail page — see PROJECT_PLAN.docx Section 11.6.
export default function TrialPage({ params }: { params: { nctId: string } }) {
  return <main><h1>{params.nctId}</h1></main>;
}
