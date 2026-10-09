// Short "Problem / Why it matters / Implementation" explanation for a feature.
export default function FeatureNote({ feature, defaultOpen = true }) {
  return (
    <details open={defaultOpen} className="mt-4 rounded-md border border-indigo-100 bg-indigo-50 p-3 text-sm text-slate-700" data-testid="feature-note">
      <summary className="cursor-pointer font-medium text-indigo-900">About this feature: {feature.title}</summary>
      <dl className="mt-2 space-y-2">
        <div><dt className="font-semibold text-slate-900">Problem</dt><dd>{feature.problem}</dd></div>
        <div><dt className="font-semibold text-slate-900">Why it matters</dt><dd>{feature.why}</dd></div>
        <div><dt className="font-semibold text-slate-900">How it works here</dt><dd>{feature.implementation}</dd></div>
      </dl>
    </details>
  );
}
