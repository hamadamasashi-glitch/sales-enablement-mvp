import { calculateScore } from '../src/scorecards/scoring.util';

describe('calculateScore', () => {
  it('computes weighted score and weak tags', () => {
    const result = calculateScore(
      [
        { criterionKey: 'agenda_setting', score: 3 },
        { criterionKey: 'pain_discovery', score: 4 },
        { criterionKey: 'next_action_agreement', score: 2 }
      ],
      [
        { criterionKey: 'agenda_setting', category: 'Discovery', weight: 10 },
        { criterionKey: 'pain_discovery', category: 'Discovery', weight: 20 },
        { criterionKey: 'next_action_agreement', category: 'Close', weight: 15 }
      ]
    );

    expect(result.totalScore).toBeCloseTo(62.22, 1);
    expect(result.weakTags).toContain('closing');
    expect(result.categoryScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Discovery' }),
        expect.objectContaining({ category: 'Close' })
      ])
    );
  });
});
