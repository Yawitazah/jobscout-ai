"use client";

interface Props {
  score: number;
  size?: number;
}

function scoreColor(score: number): string {
  if (score >= 85) return "#1F7A4D"; // green
  if (score >= 70) return "#1A2B4C"; // brand blue
  if (score >= 55) return "#B45309"; // amber
  return "#A52A2A"; // red
}

export function MatchScoreRing({ score, size = 80 }: Props) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute text-lg font-bold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}
