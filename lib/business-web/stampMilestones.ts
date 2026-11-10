const FIRST_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 500, 750, 1000];
const LATER_STEPS = [150, 200, 250, 500, 750, 1000];
const MAX_MILESTONE = 1_000_000_000_000;

export type StampMilestone = {
  floor: number;
  target: number;
  remaining: number;
  progress: number;
};

function finiteStampCount(stamps: number) {
  return Number.isFinite(stamps) && stamps >= 0 && stamps <= MAX_MILESTONE;
}

function nextTarget(stamps: number) {
  for (const milestone of FIRST_MILESTONES) {
    if (stamps < milestone) {
      return milestone;
    }
  }
  let scale = 10;
  while (scale <= MAX_MILESTONE / 1000) {
    for (const step of LATER_STEPS) {
      const milestone = step * scale;
      if (stamps < milestone) {
        return milestone;
      }
    }
    scale *= 10;
  }
  return null;
}

function previousTarget(target: number) {
  const milestones = [...FIRST_MILESTONES];
  let scale = 10;
  while (scale <= MAX_MILESTONE / 1000) {
    for (const step of LATER_STEPS) {
      milestones.push(step * scale);
    }
    scale *= 10;
  }
  let floor = 0;
  for (const milestone of milestones) {
    if (milestone >= target) {
      break;
    }
    floor = milestone;
  }
  return floor;
}

export function nextStampMilestone(stamps: number): StampMilestone | null {
  if (!finiteStampCount(stamps)) {
    return null;
  }
  const target = nextTarget(stamps);
  if (target == null || target <= stamps) {
    return null;
  }
  const floor = previousTarget(target);
  const span = target - floor;
  if (span <= 0) {
    return null;
  }
  const remaining = target - stamps;
  return {
    floor,
    target,
    remaining,
    progress: Math.min(1, Math.max(0, (stamps - floor) / span)),
  };
}

export function stampMilestoneMessage(stamps: number) {
  const milestone = nextStampMilestone(stamps);
  if (!milestone) {
    return null;
  }
  const target = new Intl.NumberFormat('he-IL').format(milestone.target);
  if (milestone.remaining === 1) {
    return `עוד חותמת אחת להישג של ${target}!`;
  }
  const remaining = new Intl.NumberFormat('he-IL').format(milestone.remaining);
  return `עוד ${remaining} חותמות להישג של ${target}!`;
}
