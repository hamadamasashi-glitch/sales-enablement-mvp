const WEAK_TAG_MAP: Record<string, string> = {
  agenda_setting: 'planning',
  pain_discovery: 'discovery',
  value_mapping: 'value_mapping',
  proposal_clarity: 'communication',
  objection_handling: 'objection',
  next_action_agreement: 'closing',
  crm_hygiene: 'crm_hygiene'
};

export interface ScorecardItemInput {
  criterionKey: string;
  score: number;
  comment?: string;
}

export interface TemplateCriterionInput {
  criterionKey: string;
  category: string;
  weight: number;
}

export interface CalculatedScore {
  totalScore: number;
  weakTags: string[];
  categoryScores: Array<{ category: string; score: number }>;
}

export function resolveWeakTag(criterionKey: string): string {
  return WEAK_TAG_MAP[criterionKey] ?? criterionKey;
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(5, score));
}

export function calculateScore(
  items: ScorecardItemInput[],
  templateCriteria: TemplateCriterionInput[]
): CalculatedScore {
  if (items.length === 0 || templateCriteria.length === 0) {
    return {
      totalScore: 0,
      weakTags: [],
      categoryScores: []
    };
  }

  const itemMap = new Map(items.map((item) => [item.criterionKey, item]));

  let weightedTotal = 0;
  let totalWeight = 0;

  const categoryAcc = new Map<string, { weightedScoreSum: number; weightSum: number }>();

  for (const criterion of templateCriteria) {
    const item = itemMap.get(criterion.criterionKey);
    if (!item) {
      continue;
    }

    const weight = Math.max(0, criterion.weight);
    const score = clampScore(item.score);

    weightedTotal += (score / 5) * weight;
    totalWeight += weight;

    const previous = categoryAcc.get(criterion.category) ?? { weightedScoreSum: 0, weightSum: 0 };
    previous.weightedScoreSum += score * weight;
    previous.weightSum += weight;
    categoryAcc.set(criterion.category, previous);
  }

  const totalScore = totalWeight === 0 ? 0 : Number(((weightedTotal / totalWeight) * 100).toFixed(2));

  const categoryScores = Array.from(categoryAcc.entries())
    .map(([category, values]) => ({
      category,
      score: values.weightSum === 0 ? 0 : Number((values.weightedScoreSum / values.weightSum).toFixed(2))
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const weakTags = Array.from(
    new Set(
      items
        .filter((item) => clampScore(item.score) <= 2)
        .map((item) => resolveWeakTag(item.criterionKey))
    )
  );

  return {
    totalScore,
    weakTags,
    categoryScores
  };
}
