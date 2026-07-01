/**
 * The wire's 4-point spark star — used consistently wherever the wires show a
 * star (releases banner, shipped notifications, the celebrate moment).
 * Fills with currentColor; set the color via className.
 */
export function SparkStar({
  size = 22,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2l1.9 6.3L20 10l-6.1 1.7L12 18l-1.9-6.3L4 10l6.1-1.7z" />
    </svg>
  );
}
