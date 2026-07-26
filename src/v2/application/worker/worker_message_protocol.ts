import { WorkerQuestion } from '../../contracts/iautonomous_worker';

/**
 * Small, provider-neutral control envelope. Code generation remains fenced-file based, while
 * coordination messages can use JSON so a provider cannot accidentally break routing by changing
 * comment syntax or adding markdown around a question.
 */
export interface WorkerQuestionEnvelope {
  type: 'QUESTION';
  capability: string;
  question: string;
}

export interface WorkerMessageProtocol {
  parseQuestions(responseText: string, senderWorkerId: string): WorkerQuestion[];
}

export class JsonWorkerMessageProtocol implements WorkerMessageProtocol {
  parseQuestions(responseText: string, senderWorkerId: string): WorkerQuestion[] {
    const questions: WorkerQuestion[] = [];
    const candidates = this.extractJsonCandidates(responseText);
    for (const candidate of candidates) {
      let value: any;
      try {
        value = JSON.parse(candidate);
      } catch {
        continue;
      }
      const envelopes = Array.isArray(value) ? value : [value];
      for (const envelope of envelopes) {
        if (envelope?.type !== 'QUESTION') continue;
        const capability = typeof envelope.capability === 'string' ? envelope.capability.trim() : '';
        const question = typeof envelope.question === 'string' ? envelope.question.trim() : '';
        if (!capability || !question) continue;
        questions.push({
          id: `q-${Date.now()}-${questions.length}`,
          senderWorkerId,
          capability,
          question,
        });
      }
    }
    return questions;
  }

  private extractJsonCandidates(text: string): string[] {
    const candidates: string[] = [];
    const fenced = /```json\s*([\s\S]*?)```/gim;
    let match: RegExpExecArray | null;
    while ((match = fenced.exec(text)) !== null) candidates.push(match[1].trim());

    for (const line of text.split(/\r?\n/)) {
      const marker = line.match(/^\s*(?:\/\/|#)\s*SEOS_JSON:\s*(\{.*\}|\[.*\])\s*$/i);
      if (marker) candidates.push(marker[1]);
    }
    return candidates;
  }
}
