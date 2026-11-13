class GameAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.offset = 0;
    this.port.onmessage = event => {
      if (!event.data?.samples) return;
      this.queue.push(event.data.samples);
      while (this.queue.length > 8) this.queue.shift();
    };
  }

  process(_, outputs) {
    const [left, right = left] = outputs[0];
    for (let i = 0; i < left.length; i++) {
      if (!this.current || this.offset >= this.current.length) {
        this.current = this.queue.shift() || null;
        this.offset = 0;
      }
      left[i] = this.current?.[this.offset] || 0;
      right[i] = this.current?.[this.offset + 1] || 0;
      this.offset += 2;
    }
    return true;
  }
}

registerProcessor('gb-runner-ds-audio', GameAudioProcessor);
