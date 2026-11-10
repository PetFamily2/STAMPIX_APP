import Svg, { Circle, Path } from 'react-native-svg';
import { resolveStampIcon } from '@/constants/stampIcons';

type MarkProps = {
  icon: string;
  color: string;
  paper: string;
  earned: boolean;
};

function stroke(earned: boolean, color: string, paper: string) {
  return {
    fill: earned ? color : 'none',
    stroke: earned ? 'none' : color,
    strokeWidth: earned ? 0 : 1.7,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    line: earned ? paper : color,
  };
}

export function ClassicStampGlyph({ icon, color, paper, earned }: MarkProps) {
  const id = resolveStampIcon(icon).id;
  const ink = stroke(earned, color, paper);
  return (
    <Svg viewBox="0 0 48 48" width="68%" height="68%">
      {id === 'coffee' ? (
        <>
          <Path
            d="M8 18h22v10.5A8.5 8.5 0 0 1 21.5 37h-5A8.5 8.5 0 0 1 8 28.5V18z"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Path
            d="M30 22h3.2a4.2 4.2 0 0 1 0 8.4H30"
            fill="none"
            stroke={ink.line}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M16 8c1.2 2.2 1.2 3.2 0 5.2M23 7.5c1.2 2.2 1.2 3.2 0 5.2"
            fill="none"
            stroke={ink.line}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {id === 'star' ? (
        <Path
          d="M24 5.5 29.2 17.8 42.4 18.8 32.2 27.4 35.4 40.2 24 33.2 12.6 40.2 15.8 27.4 5.6 18.8 18.8 17.8 24 5.5z"
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={ink.strokeWidth}
          strokeLinejoin="round"
        />
      ) : null}
      {id === 'food' ? (
        <>
          <Path
            d="M24 5 43 35.5Q24 46 5 35.5Z"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
            strokeLinejoin="round"
          />
          <Path
            d="M9 33.5Q24 41.5 39 33.5"
            fill="none"
            stroke={ink.line}
            strokeWidth={earned ? 2.4 : 1.8}
            strokeLinecap="round"
          />
          <Circle
            cx="20"
            cy="29"
            r="2"
            fill={earned ? paper : 'none'}
            stroke={earned ? 'none' : color}
            strokeWidth={1.4}
          />
          <Circle
            cx="29"
            cy="31"
            r="1.6"
            fill={earned ? paper : 'none'}
            stroke={earned ? 'none' : color}
            strokeWidth={1.4}
          />
        </>
      ) : null}
      {id === 'gift' ? (
        <>
          <Path
            d="M10 22h28v16H10z"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Path
            d="M8 16h32v6H8z"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Path
            d="M24 16v22M18 16c0-6 6-8 6 0M30 16c0-6-6-8-6 0"
            fill="none"
            stroke={ink.line}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {id === 'heart' ? (
        <Path
          d="M24 40C14 32 6 26 6 17.5 6 12 10 8 15.2 8c3.2 0 5.6 1.6 8.8 5.2C27.2 9.6 29.6 8 32.8 8 38 8 42 12 42 17.5 42 26 34 32 24 40z"
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={ink.strokeWidth}
          strokeLinejoin="round"
        />
      ) : null}
      {id === 'beauty' ? (
        <>
          <Circle
            cx="24"
            cy="24"
            r="5"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="24"
            cy="10"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="36"
            cy="18"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="32"
            cy="32"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="16"
            cy="32"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="12"
            cy="18"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
        </>
      ) : null}
      {id === 'fitness' ? (
        <Path
          d="M8 20h6v8H8zM34 20h6v8h-6zM14 22h20v4H14zM6 22h2v4H6zM40 22h2v4h-2z"
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={ink.strokeWidth}
          strokeLinejoin="round"
        />
      ) : null}
      {id === 'pets' ? (
        <>
          <Circle
            cx="16"
            cy="16"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="32"
            cy="16"
            r="4"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="12"
            cy="26"
            r="3.2"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Circle
            cx="36"
            cy="26"
            r="3.2"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
          <Path
            d="M18 28c0 8 12 8 12 0 0 6-12 6-12 0z"
            fill={ink.fill}
            stroke={ink.stroke}
            strokeWidth={ink.strokeWidth}
          />
        </>
      ) : null}
      {id === 'automotive' ? (
        <Path
          d="M8 28h32v6H8zM12 28l3-8h18l3 8M16 34a3 3 0 1 1 0 .1M32 34a3 3 0 1 1 0 .1"
          fill={ink.fill}
          stroke={earned ? paper : color}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {id === 'sparkles' ? (
        <Path
          d="M24 4 27.2 16.2 40 19.2 27.2 22.4 24 34.6 20.8 22.4 8 19.2 20.8 16.2 24 4zM36 28l1.4 4.2 4.2 1.4-4.2 1.4L36 39.2 34.6 35 30.4 33.6 34.6 32.2 36 28z"
          fill={ink.fill}
          stroke={ink.stroke}
          strokeWidth={ink.strokeWidth}
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
