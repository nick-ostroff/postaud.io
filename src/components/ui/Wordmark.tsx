export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`serif ${className}`}>
      post<b className="font-semibold text-green-deep">aud</b>.io
    </span>
  );
}
