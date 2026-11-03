/** Placeholder cards while the first page of jobs loads. */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <ul className="list" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="card skeleton-card" aria-hidden="true">
          <span className="skel skel-tag" />
          <span className="skel skel-title" />
          <span className="skel skel-title short" />
          <span className="skel skel-line short" />
        </li>
      ))}
    </ul>
  );
}
