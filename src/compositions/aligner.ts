import { computed, ref, Ref } from "vue";
import { doubleMetaphone } from "double-metaphone";
import { isEqual } from "lodash";
import { Edge, glocalAlignSegments } from "../logic/align";
export function useSegmentAligner<Word extends { word: string }>(
  corpus: Ref<string>,
  segments: Ref<Word[][]>
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
    glocalAlignSegments(
      corpusPhones.value.map(({ phone }) => phone),
      segmentPhones.value.map((segment) => segment.map(({ phone }) => phone)),
      matchReward.value,
      mismatchPenality.value,
      deletePenality.value,
      insertPenality.value
    )
  );

  // minimum word count for a segment trace to be included
  const minWordCount = ref(3);

  const trace = computed(() => {
    let trace: { s: number; t: number; w: number }[] = [];
    if (!phoneScores.value.length) return trace;
    // I tracks current corpus phone during backtrack
    let corpusPhoneIdx = phoneScores.value[0].scores.length - 1;
    if (corpusPhoneIdx <= 0) return trace;
    for (let segmentIdx = phoneScores.value.length; segmentIdx--; ) {
      const { scores, edges } = phoneScores.value[segmentIdx];
      // j tracks segment phone
      let segmentPhoneIdx = 0;
      // find best match j for current corpus phone
      for (let j = scores[0].length; --j; )
        if (scores[corpusPhoneIdx][segmentPhoneIdx] < scores[corpusPhoneIdx][j])
          segmentPhoneIdx = j;
      // backtrack to beginning of segment
      let i = corpusPhoneIdx;
      let j = segmentPhoneIdx;
      let path = [];
      while (i > 1 && j > 1) {
        const edge = edges[i][j];
        if (edge & Edge.MATCH) i--, j--;
        else if (edge & Edge.INSERT) i--;
        else if (edge & Edge.DELETE) j--;
        else throw "edge not found";
        path.push([i, j]);
      }
      // ensure minimum corpus word count
      const corpusTokenIdxStart = corpusPhones.value[i - 1].t;
      const corpusTokenIdxEnd = corpusPhones.value[corpusPhoneIdx - 1].t;
      // console.log(
      //   segmentIdx,
      //   i,
      //   corpusPhoneIdx,
      //   corpusTokens.value
      //     .slice(corpusTokenIdxStart, corpusTokenIdxEnd + 1)
      //     .join(" "),
      //   j,
      //   segmentPhoneIdx,
      //   segments.value[segmentIdx].map(({ word }) => word).join(" ")
      // );
      if (corpusTokenIdxEnd - corpusTokenIdxStart >= minWordCount.value) {
        // mark the start/end of the alignment for current segment
        path
          .map(([i, j]) => [
            corpusPhones.value[i - 1].t,
            segmentPhones.value[segmentIdx][j - 1].w,
          ])
          .filter((point, i, arr) => !isEqual(point, arr[i - 1]))
          .forEach(([t, w]) => trace.push({ s: segmentIdx, t, w }));
        // move corpus pointer to previous phone
        corpusPhoneIdx = i - 1
      }
      // exit early if whole corpus is matched
      if (corpusPhoneIdx <= 0) break;
    }
    return trace.reverse();
  });

  // annotate segments according to the corpus trace
  type Annotated = Word & { corpus?: string };
  const annotatedSegments = computed(() => {
    let annot = segments.value.map((segment) =>
      segment.map((word): Annotated => ({ ...word }))
    );
    trace.value.forEach(
      ({ t, s, w }) => (annot[s][w].corpus = corpusTokens.value[t])
    );
    return annot;
  });

  return {
    corpusTokens,
    corpusMetaphones,
    segmentMetaphones,
    phoneScores,
    matchReward,
    mismatchPenality,
    deletePenality,
    insertPenality,
    minWordCount,
    annotatedSegments,
    trace,
  };
}
