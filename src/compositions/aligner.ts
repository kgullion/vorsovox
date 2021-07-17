import { computed, ref, Ref } from "vue";
import { doubleMetaphone } from "double-metaphone";
import { glocalAlignSegments } from "../logic/align";

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

  // convert all trace indices back into corpus/segment indices
  const phoneTraces = computed(() =>
    phoneScores.value.map((segment, s) =>
      segment.traces.map((trace) =>
        trace
          .filter(({ i, j }) => i !== 0 && j !== 0)
          .map(({ i, j }) => ({
            s: s,
            t: corpusPhones.value[i - 1].t,
            w: segmentPhones.value[s][j - 1].w,
          }))
          // remove duplicates
          .filter(
            ({ s, t, w }, i, arr) =>
              i === 0 ||
              s !== arr[i - 1].s ||
              t !== arr[i - 1].t ||
              w !== arr[i - 1].w
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

  // annotate segments according to the corpus trace
  type Annotated = Word & { corpus?: string };
  const annotatedSegments = computed(() => {
    let annot = segments.value.map((segment) =>
      segment.map((word): Annotated => ({ ...word }))
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
    annotatedSegments,
  };
}
