export class AiRefineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiRefineError';
  }
}
