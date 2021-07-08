// vad-processor.js
class VadProcessor extends AudioWorkletProcessor {
  prev; // : number[][] | undefined;
  hold; // : number[][] | undefined;
  process(
    inputs, // : Float32Array[][],
    outputs // : Float32Array[][]
  ) {
    const I = inputs?.length ?? 0,
      J = inputs[0]?.length ?? 0,
      K = inputs[0][0]?.length ?? 0,
      iK = 1 / K;
    if (!(I && J && K)) return true;
    if (!this.prev) this.prev = Array(I).fill(Array(J).fill(0));
    if (!this.hold) this.hold = Array(I).fill(Array(J).fill(0));
    for (let i = I; i--; )
      for (let j = J; j--; ) {
        let diff = 0,
          max = 0,
          sum = 0,
          zpc = -2.5, // "expected" zpc for voice range
          sq = 0;
        for (let prev = this.prev[i][j], k = K; k--; ) {
          const val = inputs[i][j][k];
          max = Math.max(max, val, -val);
          sum += Math.abs(val);
          diff += Math.abs(val - prev);
          sq += val ** 2;
          zpc -= Math.sign(prev) ^ Math.sign(val);
          prev = val;
        }
        // no clue why but it works
        let vox = (2 * diff) / zpc + zpc / (4 * K);
        // bias towards activation
        const h = this.hold[i][j];
        const a = 0.001;
        if (vox < h) vox = (1 - a) * h + a * vox;
        else vox = (1 - a) * vox + a * h;
        this.hold[i][j] = vox;
        // rescale output
        vox = 1 - Math.exp(-vox / 2);
        sum /= K;
        if (sum < iK) vox = -sum;
        outputs[i][j].fill(vox > 0 ? 1 : -0.5);
      }
    return true;
  }
}

registerProcessor("vad-processor", VadProcessor);
