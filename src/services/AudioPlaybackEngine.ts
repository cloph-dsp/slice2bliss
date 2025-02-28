import { AudioContext, IAudioDestinationNode, AudioBuffer } from 'standardized-audio-context';

interface PlaybackOptions {
  playbackRate?: number;
  // Add other options as needed
}

export class AudioPlaybackEngine {
  private context: AudioContext;
  private destinationNode: IAudioDestinationNode<AudioContext>;

  constructor(context: AudioContext, destinationNode: IAudioDestinationNode<AudioContext>) {
    this.context = context;
    this.destinationNode = destinationNode;
  }

  playSegment(audioSegment: AudioBuffer, options: PlaybackOptions = {}) {
    const source = this.context.createBufferSource();
    source.buffer = audioSegment;
    source.connect(this.destinationNode);

    if (options.playbackRate) {
      source.playbackRate.value = options.playbackRate;
    }

    source.start();
  }
}
