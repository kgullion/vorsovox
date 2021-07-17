// define bitset for edges
export enum Edge {
  NONE = 0b000,
  INSERT = 0b001,
  DELETE = 0b010,
  MATCH = 0b100,
}

export function glocalAlign<T>(
  globalSequence: T[],
  localSequence: T[],
  matchReward = 1,
  mismatchPenality = -1,
  deletePenality = -1,
  insertPenality = -1
) {
  // A modified smith-waterman/needleman-wunsch is used to perform a global
  // alignment of each segment in the corpus while penalizing starting in the
  // middle of a segment. This pushes alignment to begin at the start of a
  // segment but allows the segment to start in the middle of the corpus.

  // initialize all scores and edges to zero (allowing for local alignment)
  let scores: number[][] = Array.from(Array(globalSequence.length + 1), () =>
    Array(localSequence.length + 1).fill(0)
  );
  let edges: Edge[][] = Array.from(Array(globalSequence.length + 1), () =>
    Array(localSequence.length + 1).fill(0)
  );

  // set penalities for not starting at the beginning of a segment
  for (let j = 1; j < localSequence.length + 1; ++j)
    scores[0][j] = j * deletePenality;

  // score the alignment matrix
  for (let i = 1; i < globalSequence.length + 1; ++i)
    for (let j = 1; j < localSequence.length + 1; ++j) {
      // determine reward/penality for matching current metaphones
      const isMatch = globalSequence[i - 1] === localSequence[j - 1];
      const reward = isMatch ? matchReward : mismatchPenality;
      // calculate score for each action
      const match = scores[i - 1][j - 1] + reward;
      const ins = scores[i - 1][j] + insertPenality;
      const del = scores[i][j - 1] + deletePenality;
      const score = Math.max(match, ins, del);
      scores[i][j] = score;
      // determine edge type
      let edge = Edge.NONE;
      if (score === match) edge |= Edge.MATCH;
      if (score === ins) edge |= Edge.INSERT;
      if (score === del) edge |= Edge.DELETE;
      edges[i][j] = edge;
    }

  // get index of max score for last row of score matrix
  // TODO: should this check entire matrix instead? how would trace work?
  const j = scores[0].length - 1;
  let iMax = scores.reduce(
    (iMax, s, i, arr) => (s[j] >= arr[iMax][j] ? i : iMax),
    0
  );
  // trace path from max score to the beginning of the segment
  // TODO: better to do this in full trace in case of repeated phrase in corpus?
  let path;
  let traces = [];
  let stack = [[{ i: iMax, j: edges[0].length - 1 }]];
  // NOTE: to find multiple traces, remove elses and .slice(0) paths pushed onto stack
  while ((path = stack.pop())) {
    const { i, j } = path[path.length - 1];
    const edge = edges[i][j];
    if (edge & Edge.MATCH) {
      path.push({ i: i - 1, j: j - 1 });
      stack.push(path);
    } else if (edge & Edge.INSERT) {
      path.push({ i: i - 1, j });
      stack.push(path);
    } else if (edge & Edge.DELETE) {
      path.push({ i, j: j - 1 });
      stack.push(path);
    } else traces.push(path.reverse());
  }

  return { scores, edges, traces };
}

export function glocalAlignSegments<T>(
  corpus: T[],
  segments: T[][],
  matchReward = 1,
  mismatchPenality = -1,
  deletePenality = -1,
  insertPenality = -1
) {
  return segments.map((segment) =>
    glocalAlign(
      corpus,
      segment,
      matchReward,
      mismatchPenality,
      deletePenality,
      insertPenality
    )
  );
}
