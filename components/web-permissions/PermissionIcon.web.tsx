export function PermissionIcon({
  name,
}: {
  name: 'camera' | 'location' | 'install' | 'bell';
}) {
  const stroked = name === 'install' || name === 'bell';
  const path =
    name === 'camera'
      ? 'M4 8h3l2-2h6l2 2h3v10H4V8zm8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
      : name === 'location'
        ? 'M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10zm0-8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'
        : name === 'bell'
          ? 'M6 16h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v3.8L6 16zm4 2a2 2 0 0 0 4 0'
          : 'M12 3v10m0 0 4-4m-4 4-4-4M5 21h14';
  return (
    <svg
      className="permission-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={stroked ? 'none' : 'currentColor'}
      stroke={stroked ? 'currentColor' : 'none'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}
