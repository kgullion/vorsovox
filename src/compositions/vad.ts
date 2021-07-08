import vadUrl from "../worklets/vad-processor?url";

export async function createWorkletNode(
  ctx: BaseAudioContext,
  name: string,
  moduleUrl: string
) {
  // ensure audioWorklet has been loaded
  try {
    return new AudioWorkletNode(ctx, name);
  } catch (err) {
    await ctx.audioWorklet.addModule(moduleUrl);
    return new AudioWorkletNode(ctx, name);
  }
}

export const createVadNode = (ctx: BaseAudioContext) =>
  createWorkletNode(ctx, "vad-processor", vadUrl);

export async function envelope(audio: AudioBuffer) {
  const ctx = new OfflineAudioContext({
    length: audio.length,
    sampleRate: audio.sampleRate,
    numberOfChannels: 1,
  });

  // filter to vocal range
  const lo = ctx.createBiquadFilter();
  lo.type = "lowpass";
  lo.frequency.value = 3200;
  const hi = ctx.createBiquadFilter();
  hi.type = "highpass";
  hi.frequency.value = 120;

  // create vad node
  const vad = await createVadNode(ctx);

  // smooth output from vad node
  const hold = ctx.createBiquadFilter();
  hold.type = "lowpass";
  hold.frequency.value = 80;

  // hook everything up and render envelope
  const src = ctx.createBufferSource();
  src.buffer = audio;
  src
    .connect(lo)
    .connect(hi)
    .connect(vad)
    .connect(hold)
    .connect(ctx.destination);
  src.start();

  return await ctx.startRendering();
}

export async function segmentOnSilence(
  audioBuffer: AudioBuffer,
  minLength = 1
) {
  const vad = await envelope(audioBuffer);
  let silences: [number, number][] = [];

  // find silent sections at least minLength seconds long
  const pcm = vad.getChannelData(0);
  const pcmMin = (minLength * vad.sampleRate) | 0;
  let from = 0;
  let to = 0;
  for (let i = 0; i < pcm.length; ++i) {
    const val = pcm[i];
    if (val > 0 && to > from) {
      if (to - from >= pcmMin)
        silences.push([from / vad.sampleRate, to / vad.sampleRate]);
      from = i + 1;
    }
    to = i;
  }

  // merge close silences (separated by less than a tenth of a second)
  silences = silences.reduce((acc, [c, d]) => {
    if (!acc.length) return [[c, d]] as typeof silences;
    const [a, b] = acc[acc.length - 1];
    if (c - b < 0.1) acc[acc.length - 1][1] = d;
    else acc.push([c, d]);
    return acc;
  }, [] as typeof silences);

  // invert the silences to find signal sections
  let segments: [number, number][] = [];
  from = 0;
  for (let [to, next] of silences) {
    segments.push([from, to]);
    from = next;
  }
  if (from < vad.duration) segments.push([from, vad.duration]);

  // add padding to signal sections
  const padding = minLength / 2;
  const coerce = (x: number) =>
    0 <= x ? (x < vad.duration ? x : vad.duration) : 0;
  segments = segments
    .filter(([from, to]) => to !== from)
    .map(([from, to]) => [coerce(from - padding), coerce(to + padding)]);

  return { silences, segments };
}
