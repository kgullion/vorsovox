import { computed, ref, Ref } from "vue";
import type { ServerMessageResult } from "vosk-browser/dist/interfaces";
import { doubleMetaphone } from "double-metaphone";

// define bitset for edges
enum Edge {
  NONE = 0b000,
  INSERT = 0b001,
  DELETE = 0b010,
  MATCH = 0b100,
}
// create aligner refs
export function useAligner(
  corpus: Ref<string>,
  segments: Ref<ServerMessageResult["result"]["result"][]>
) {
  // prepare corpus
  const corpusTokens = computed(() => corpus.value.split(/\s+/));
  const corpusMetaphones = computed(() =>
    corpusTokens.value.map((token, t) => {
      const [primary, secondary] = doubleMetaphone(token);
      return { primary, secondary, t };
    })
  );
  const corpusPhones = computed(() =>
    corpusMetaphones.value.flatMap(({ primary, t }) =>
      Array.from(primary).map((phone) => ({ phone, t }))
    )
  );

  // prepare transcription
  const segmentMetaphones = computed(
    () =>
      segments.value.map((segment, s) =>
        segment.map(({ word }, w) => {
          const [primary, secondary] = doubleMetaphone(word);
          return { primary, secondary, s, w };
        })
      ) || []
  );
  const segmentPhones = computed(() =>
    segmentMetaphones.value.map((segment) =>
      segment.flatMap(({ primary, s, w }) =>
        Array.from(primary).map((phone) => ({ phone, s, w }))
      )
    )
  );

  // do alignment
  const matchReward = ref(1);
  const mismatchPenality = ref(-1);
  const deletePenality = ref(-1);
  const insertPenality = ref(-1);
  const phoneScores = computed(() =>
    segmentPhones.value.map((wordPhones) => {
      // To align each segment, a modified smith-waterman/needleman-wunsch is
      // used to perform a global alignment of each segment in the corpus while
      // penalizing starting in the middle of a segment. This forces alignment
      // to begin at the start of a segment but allows the segment to start in
      // the middle of the corpus.

      // initialize all scores and edges to zero (allowing for local alignment)
      let scores: number[][] = Array.from(
        Array(corpusPhones.value.length + 1),
        () => Array(wordPhones.length + 1).fill(0)
      );
      let edges: Edge[][] = Array.from(
        Array(corpusPhones.value.length + 1),
        () => Array(wordPhones.length + 1).fill(0)
      );

      // set penalities for not starting at the beginning of a segment
      for (let j = 1; j < wordPhones.length + 1; ++j)
        scores[0][j] = j * deletePenality.value;

      // score the alignment matrix
      for (let i = 1; i < corpusPhones.value.length + 1; ++i)
        for (let j = 1; j < wordPhones.length + 1; ++j) {
          // determine reward/penality for matching current metaphones
          const isMatch =
            corpusPhones.value[i - 1].phone === wordPhones[j - 1].phone;
          const reward = isMatch ? matchReward : mismatchPenality;
          // calculate score for each action
          const match = scores[i - 1][j - 1] + reward.value;
          const ins = scores[i - 1][j] + insertPenality.value;
          const del = scores[i][j - 1] + deletePenality.value;
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
      // TODO: it's better to do this in full trace in case of repeated phrase in corpus
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
        } else
          traces.push(
            path
              // .filter(({ i, j }) => i !== 0 && j !== 0)
              // .map(({ i, j }) => ({ i: i - 1, j: j - 1 }))
              .reverse()
          );
      }

      return { scores, edges, traces };
    })
  );
  // convert all trace indices into corpus/segment indices
  const phoneTraces = computed(() =>
    phoneScores.value.map((segment, s) =>
      segment.traces.map((trace) =>
        trace
          .filter(({ i, j }) => i !== 0 && j !== 0)
          .map(({ i, j }) => ({
            t: corpusPhones.value[i - 1].t,
            w: segmentPhones.value[s][j - 1].w,
            s: s,
          }))
          // remove duplicates
          .filter(
            ({ t, w }, k, arr) => t !== arr[k - 1]?.t || w !== arr[k - 1]?.w
          )
      )
    )
  );
  // minimum word count for a segment trace to be included
  const minWordCount = ref(3);
  const fullTrace = computed(() => {
    // mark current index into the corpus tokens
    let marker = Infinity;
    return (
      phoneTraces.value
        // assume the best take is the most recent and accumalate full trace
        .reduceRight((acc, trace, s) => {
          if (trace.length === 0) return acc;
          // find where current trace ends and the trace to the right begins
          let splitAt = trace[0].findIndex(({ t }) => t >= marker);
          if (splitAt < 0) splitAt = trace[0].length;
          // add current trace and update marker if minWordCount is met
          if (trace[0][splitAt - 1]?.w >= minWordCount.value - 1) {
            acc.push(trace[0].slice(0, splitAt).map((e) => ({ ...e, s })));
            marker = trace[0][0].t;
          }
          return acc;
        }, [] as { t: number; s: number; w: number }[][])
        .reverse()
    );
  });
  // compute start and end time for each segment
  const alignedSpans = computed((): [number, number][] =>
    fullTrace.value.map((segmentTrace) => {
      const segment = segments.value[segmentTrace[0].s];
      return [
        segment[segmentTrace[0].w].start,
        segment[segmentTrace[segmentTrace.length - 1].w].end,
      ];
    })
  );
  // annotate segments according to the corpus trace
  const annotatedTranscript = computed(() => {
    let annot = segments.value.map((segment) =>
      segment.map((word) => ({ ...word } as typeof word & { corpus?: string }))
    );
    fullTrace.value.forEach((seg) =>
      seg.forEach(({ t, s, w }) => (annot[s][w].corpus = corpusTokens.value[t]))
    );
    return annot;
  });

  return {
    corpusTokens,
    corpusMetaphones,
    segmentMetaphones,
    phoneScores,
    phoneTraces,
    minWordCount,
    fullTrace,
    alignedSpans,
    annotatedTranscript,
  };
}
