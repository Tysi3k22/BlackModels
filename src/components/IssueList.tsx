import { useModel } from "../stores/modelStore";
import { severityClass } from "../lib/validate";

export default function IssueList() {
  const issues = useModel((s) => s.issues);

  if (issues.length === 0) {
    return (
      <p className="-mt-1 text-xs text-neutral-500">
        No constraint issues.
      </p>
    );
  }

  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((issue, i) => (
        <li key={i} className={`rounded px-2 py-0.5 text-xs ${severityClass(issue.severity)}`}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
