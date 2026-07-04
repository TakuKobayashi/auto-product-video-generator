import { ProjectSummary, ProjectSummarySchema, VideoConfig, logger } from '@demo-video-gen/core';
import { LlmProvider } from '../llm/provider.js';

const SYSTEM_PROMPT = `You are a video production expert analyzing web applications for promotional demo videos.
Respond ONLY with a valid JSON object matching this TypeScript type:
{
  name: string;
  description: string;
  features: Array<{ id: string; title: string; description: string; demoable: boolean; priority: 'high' | 'medium' | 'low' }>;
  targetAudience: string;
  keyValueProps: string[];
  suggestedVideoTypes: Array<'teaser' | 'shorts' | 'demo' | 'tutorial'>;
}
No markdown, no explanation. JSON only.`;

export class ProjectAnalyzer {
  constructor(private llm: LlmProvider) {}

  async analyze(url: string, readmeContent?: string): Promise<ProjectSummary> {
    logger.step('analyze', `Calling LLM to analyze ${url}...`);

    const prompt = `Analyze this web application for a promotional demo video.

URL: ${url}
${readmeContent ? `\nREADME content:\n${readmeContent}\n` : ''}

Extract:
1. Features that are visually demonstrable via browser interaction
2. Target audience
3. Key value propositions
4. Suggested video types based on the product complexity

Respond with JSON only.`;

    const raw = await this.llm.generateJson<unknown>(prompt, SYSTEM_PROMPT);
    return ProjectSummarySchema.parse(raw);
  }
}
